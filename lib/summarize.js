import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { errorMessage, errorResponse, failure, failureMessage, readJson, responseOf, sameSiteRequest } from './base.js'
import { modelRoute, selectionOfEvents } from './models.js'
import { readSummaryContext, SummaryContextError } from './summary-context.js'

/**
 * A bring-back brief must not keep generating after the client gave up.
 * The brief itself has no output budget: how much of a discussion to carry
 * back is the model's and the user's call, not a fixed number here.
 */
export const SUMMARY_TIMEOUT_MS = 180_000

// ---------------------------------------------------------------- summarize

/**
 * One in-flight brief per source session. A refresh, a double click, or a
 * retried request must not start a second paid model call for the same record.
 */
const INFLIGHT_KEY = Symbol.for('dsh-conversation-tree.summary-inflight-v2')
export const SUMMARY_INFLIGHT = globalThis[INFLIGHT_KEY] ?? (globalThis[INFLIGHT_KEY] = new WeakMap())

/** Race a read or iterator step against cancellation even if a plugin ignores it. */
function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('summary-aborted'))
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(signal.reason ?? new Error('summary-aborted'))
    }
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

/** Each caller can cancel independently; stop shared work only when all leave. */
async function waitForSummary(entry, signal) {
  if (signal?.aborted) return errorResponse(signal.reason ?? new Error('summary-aborted'))
  entry.waiters++
  try {
    if (!signal) return await entry.promise
    return await abortable(entry.promise, signal)
  } catch (error) {
    return errorResponse(error)
  } finally {
    entry.waiters--
    if (entry.waiters === 0 && !entry.settled) entry.controller.abort(new Error('summary-aborted'))
  }
}

/** POST /api/conversation-tree/summarize */
export async function summarize(ctx, request) {
  if (!sameSiteRequest(request)) return failure(403, 'cross-origin')
  const body = await readJson(request)
  if (body === undefined) return failure(400, 'invalid-json')
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  if (sessionId === '') return failure(400, 'missing-fields')
  if (request.signal?.aborted) return responseOf(errorResponse(request.signal.reason ?? new Error('summary-aborted')))

  let inflight = SUMMARY_INFLIGHT.get(ctx)
  if (inflight === undefined) {
    inflight = new Map()
    SUMMARY_INFLIGHT.set(ctx, inflight)
  }
  const key = sessionId
  let entry = inflight.get(key)
  if (entry === undefined) {
    const controller = new AbortController()
    entry = { controller, waiters: 0, settled: false, promise: undefined }
    const current = entry
    entry.promise = summarizeOnce(ctx, sessionId, controller.signal).catch(errorResponse).finally(() => {
      current.settled = true
      if (inflight.get(key) === current) inflight.delete(key)
    })
    inflight.set(key, entry)
  }
  return responseOf(await waitForSummary(entry, request.signal))
}

/** A handoff is one additional request over the source's model-visible context. */
export async function summarizeOnce(ctx, sessionId, signal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('summary-timeout')), SUMMARY_TIMEOUT_MS)
  const forward = () => controller.abort(signal?.reason)
  if (signal?.aborted) forward()
  else signal?.addEventListener('abort', forward, { once: true })
  try {
    let source
    try {
      source = await abortable(readSummaryContext(ctx, sessionId, controller.signal), controller.signal)
    } catch (error) {
      if (controller.signal.aborted || error instanceof SummaryContextError) throw error
      if (error?.name === 'SessionPersistenceNotFoundError') throw new SummaryContextError('session-not-found')
      throw new SummaryContextError('context-unavailable')
    }
    controller.signal.throwIfAborted()
    const result = await abortable(summarizeContext(ctx, source, controller.signal), controller.signal)
    const text = redactSecrets(result.text)
    if (text === '') return { status: 409, body: { error: 'summary-empty' } }
    return {
      status: 200,
      body: { summary: text, chars: text.length, truncated: result.truncated, sourceTitle: source.sourceTitle },
    }
  } catch (error) {
    if (error instanceof SummaryContextError) return { status: error.code === 'session-not-found' ? 404 : 409, body: { error: error.code } }
    if (controller.signal.aborted) return { status: 409, body: { error: `summary-failed:${errorMessage(controller.signal.reason ?? error)}` } }
    if (error?.code === 'CONTEXT_WINDOW_EXCEEDED') return { status: 409, body: { error: 'context-overflow' } }
    if (error?.code === 'SESSION_NOT_FOUND' || error?.code === 'SESSION_PERSISTENCE_NOT_FOUND') {
      return { status: 404, body: { error: 'session-not-found' } }
    }
    return { status: 409, body: { error: `summary-failed:${errorMessage(error)}` } }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forward)
  }
}

/** The final prompt is a new request input, not an event on the source Session. */
export const HANDOFF_PROMPT = [
  '请基于当前对话上下文，写一份交给另一个对话继续工作的交接摘要。',
  '使用与对话相同的语言，按以下结构清楚说明：',
  '1. 身份与任务：你在对话中的角色、要解决的问题和必要背景。',
  '2. 已完成：实际完成的工作、结果和关键决定；准确保留重要文件、命令、版本和标识。',
  '3. 验证情况：做过哪些测试或检查及其结果；未验证的明确标记为“未验证”。',
  '4. 已知问题和风险：错误、限制、不确定之处和需要确认的事项。',
  '5. 未完成事项：剩余工作、下一步及等待的外部条件或用户决定。',
  '只依据当前上下文，不要编造或把计划、讨论、推测说成已完成。',
  '保留接手所需的约束和事实，篇幅由内容决定；信息缺失时注明未确认。',
  '只输出交接摘要，不要调用工具、执行命令或开展新的工作。',
].join('\n')

/** Replay the structured current surface using DSH's provider-neutral LLM API. */
export async function summarizeContext(ctx, source, signal) {
  const { provider, model, reasoningEffort } = source.route
  const previous = source.header?.config
  const config = { ...(previous ?? {}), provider, model }
  // A pending model switch must not inherit the old adapter's output default.
  if ((previous?.provider !== provider || previous?.model !== model)
    && source.header?.adapterDefaults?.maxTokens === true) delete config.maxTokens
  if (reasoningEffort === undefined) delete config.reasoningEffort
  else config.reasoningEffort = reasoningEffort
  const options = {
    ...config,
    messages: [...source.messages, { role: 'user', content: [{ type: 'text', text: HANDOFF_PROMPT }] }],
    ...(source.header?.tools === undefined ? {} : { tools: source.header.tools }),
    toolHistory: source.toolHistory,
    signal,
  }
  const assembler = new BlockAssembler()
  let finish
  for await (const chunk of ctx.llm.stream(options)) {
    signal.throwIfAborted()
    if (chunk.type === 'tool-call-delta' || (chunk.type === 'block-start' && chunk.blockType === 'tool-call')
      || (chunk.type === 'block-end' && chunk.block?.type === 'tool-call')) {
      throw new SummaryContextError('summary-tool-call')
    }
    assembler.push(chunk)
    if (chunk.type === 'finish') {
      finish = chunk.reason
      break
    }
  }
  signal.throwIfAborted()
  if (finish?.kind === 'tool-calls') throw new SummaryContextError('summary-tool-call')
  if (finish?.kind === 'error') {
    if (finish.failure?.code === 'CONTEXT_WINDOW_EXCEEDED') throw new SummaryContextError('context-overflow')
    throw new Error(failureMessage(finish.failure))
  }
  if (finish?.kind === 'aborted') throw new Error('summary-aborted')
  if (finish?.kind !== 'stop' && finish?.kind !== 'max-tokens') throw new Error('summary-incomplete')
  const blocks = assembler.blocks()
  if (blocks.some((block) => block.type !== 'text' && block.type !== 'reasoning')) throw new Error('summary-unsupported-output')
  const text = blocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
  return { text: text.trim(), truncated: finish.kind === 'max-tokens' }
}

/** The route a tree-summary request should use: live header, recorded selection, then default. */
export function routeForSummary(ctx, session, events) {
  if (session !== undefined) {
    const live = modelRoute(ctx, session)
    if (live !== undefined) return live
  }
  const selected = selectionOfEvents(events)
  if (selected !== undefined) return selected
  return modelRoute(ctx, undefined)
}

/**
 * Mask credentials that tool output tends to carry into a prompt.
 * Summaries are copied into another conversation, so a leaked key would travel
 * with them; this is redaction, not a guarantee.
 */
export function redactSecrets(text) {
  if (typeof text !== 'string' || text === '') return ''
  return text
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})/g, '[redacted-key]')
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{16,})/g, '[redacted-token]')
    .replace(/\b(xox[baprs]-[A-Za-z0-9-]{10,})/g, '[redacted-token]')
    .replace(/\b(AKIA[0-9A-Z]{16})\b/g, '[redacted-key]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]{16,}=*/g, '$1[redacted]')
    .replace(/(["'][A-Za-z_]*(?:api[_-]?key|secret|token|password|passwd)[A-Za-z_]*["']\s*:\s*["'])[A-Za-z0-9._~+/-]{12,}(["'])/gi, '$1[redacted]$2')
    .replace(/\b([A-Za-z_]*(?:api[_-]?key|secret|token|password|passwd)[A-Za-z_]*\s*[:=]\s*)["']?[A-Za-z0-9._~+/-]{12,}["']?/gi, '$1[redacted]')
}

/**
 * Run one tool-less completion and collect its text.
 * The call carries an output budget, a hard timeout, and the caller's abort
 * signal: a client that navigated away must not leave a paid generation
 * running, and a truncated answer must not be presented as a complete brief.
 */
export async function oneShot(ctx, route, prompt, signal, system) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('summary-timeout')), SUMMARY_TIMEOUT_MS)
  const forward = () => controller.abort(signal?.reason)
  if (signal !== undefined) {
    if (signal.aborted) forward()
    else signal.addEventListener('abort', forward, { once: true })
  }
  let text = ''
  let truncated = false
  try {
    for await (const chunk of ctx.llm.stream({
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      signal: controller.signal,
    })) {
      if (chunk.type === 'text-delta') {
        text += chunk.text
      } else if (chunk.type === 'finish') {
        if (chunk.reason?.kind === 'error') throw new Error(failureMessage(chunk.reason.failure))
        if (chunk.reason?.kind === 'aborted') throw new Error('summary-aborted')
        truncated = chunk.reason?.kind === 'max-tokens'
        break
      }
    }
  } finally {
    clearTimeout(timer)
    if (signal !== undefined) signal.removeEventListener('abort', forward)
  }
  return { text: text.trim(), truncated }
}
