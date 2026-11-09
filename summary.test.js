import test from 'node:test'
import assert from 'node:assert/strict'
import { HANDOFF_PROMPT, summarize, summarizeOnce } from './lib/summarize.js'

// Everything below is synthetic. The fake follows the DSH Session/LLM request
// boundary rather than reading a persisted Session or contacting a provider.
const id = 'source-session'
const tool = { name: 'read', description: 'Read a file', parameters: { type: 'object', properties: {} } }
const addedTool = { name: 'search', description: 'Search', parameters: { type: 'object', properties: {} } }
const messages = [
  { id: 'sys', role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: '原系统提示' }] },
  { id: 'usr', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '请处理项目' }] },
  { id: 'dev', role: 'developer', source: { kind: 'test' }, content: [{ type: 'tool-addition', toolName: 'search' }] },
  { id: 'asst', role: 'assistant', source: { kind: 'model', provider: 'original-provider', model: 'original-model', replayState: { opaque: true } }, content: [{ type: 'tool-call', id: 'call-1', name: 'read', arguments: '{"path":"a.txt"}' }] },
  { id: 'result', role: 'tool', source: { kind: 'tool', callId: 'call-1' }, toolCallId: 'call-1', content: [{ type: 'text', text: '工具输出：文件内容' }] },
]
const history = { tools: [tool], updates: [{ messageId: 'dev', additions: [addedTool] }] }
const header = { config: { provider: 'original-provider', model: 'original-model', reasoningEffort: 'high', temperature: 0.2 }, tools: [tool, addedTool] }
const events = [
  { seq: 0, time: 1, type: 'session/title', data: { title: '来源标题' } },
  { seq: 1, time: 2, type: 'user/message', data: { content: [{ type: 'text', text: '请处理项目' }] } },
  { seq: 2, time: 3, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
]
const ok = [
  { type: 'text-delta', index: 0, text: '摘要正文' },
  { type: 'finish', reason: { kind: 'stop' } },
]

function fixture({ chunks = ok, stream, sourceMessages = messages, sourceHeader = header, toolHistory = history, busy = false, pending = null } = {}) {
  const calls = { streams: [], appends: [], sessionCreates: 0, agentCreates: 0, tools: 0, persistence: 0 }
  const session = {
    id, header: { id, cwd: '/synthetic/project', isSeeded: false },
    inheritedEventCount: 0, firstLiveSeq: 0, firstLifecycleSeq: 0, seq: events.length,
    snapshotEvents: () => structuredClone(events), ownEvents: () => structuredClone(events),
    eventAt: (seq) => structuredClone(events[seq]), isOwnSeq: () => true,
    deriveMessages: () => sourceMessages, toolHistory: () => toolHistory,
    requestHeader: () => sourceHeader, requestContext: () => ({ provider: 'original-provider', model: 'original-model' }),
    append: (...args) => { calls.appends.push(args); throw new Error('source session must not be written') },
  }
  const agent = { session, status: busy ? 'running' : 'idle', options: { provider: 'different-provider', model: 'different-model' }, model: { current: () => pending ?? sourceHeader?.config } }
  const ctx = {
    sessions: { get: (key) => key === id ? session : undefined, create: () => { calls.sessionCreates++; throw new Error('unexpected session create') } },
    agents: { get: (key) => key === id ? agent : undefined, create: () => { calls.agentCreates++; throw new Error('unexpected agent create') } },
    sessionProjections: { stateOf: (_session, key) => key === 'modelSelection' ? { lastUsed: header.config, pending } : undefined },
    llm: { stream(options) { calls.streams.push(options); return stream ? stream(options) : (async function* () { yield* chunks })() } },
    tools: { execute: () => { calls.tools++; throw new Error('tools must not execute') } },
    get(name) {
      if (name === 'sessionPersistence') return { open() { calls.persistence++; throw new Error('must not read a cold session') } }
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'default-provider', model: 'default-model' }) }
      return undefined
    },
  }
  return { ctx, session, agent, calls }
}

function assertFailure(result) {
  assert.ok(result && Number.isInteger(result.status), 'returns a status/payload, not an unhandled rejection')
  assert.ok(result.status >= 400, `expected error status, got ${result.status}`)
  assert.ok(result.body?.error, 'error payload explains the failure')
  assert.ok(!result.body?.summary, 'never return partial output as a summary')
}

function assertSilent(calls) {
  assert.deepEqual(calls.appends, [])
  assert.equal(calls.sessionCreates, 0)
  assert.equal(calls.agentCreates, 0)
  assert.equal(calls.tools, 0)
}

// These assertions check the instruction contract, not real-model compliance.
test('handoff instruction prioritizes current state and evidence without inventing tasks', () => {
  for (const required of [
    '不要执行摘要以外的操作',
    '用户最新的明确要求',
    '对于后来被更正或替代的方案，只保留最终状态',
    '不能把助手先前的自述自动当成已验证事实',
    '不要把可选建议写成用户已经要求的待办',
    '明确区分“已发起”和“已确认完成”',
    '不输出密钥、令牌、密码或含凭证的链接',
    '可合并相关部分，省略没有内容的部分',
    '若用户要求已经完成，明确说明，不自行增加任务',
    '不为简短丢失关键事实，也不为填满结构重复内容',
  ]) assert.ok(HANDOFF_PROMPT.includes(required), `missing handoff rule: ${required}`)
})

test('replays the exact live model context with a final summary instruction, silently', async () => {
  const f = fixture()
  const before = structuredClone({ messages, history, header, events })
  const result = await summarizeOnce(f.ctx, id, new AbortController().signal)
  assert.equal(result.status, 200)
  assert.equal(result.body.summary, '摘要正文')
  assert.equal(f.calls.streams.length, 1)
  const request = f.calls.streams[0]
  assert.equal(request.provider, 'original-provider')
  assert.equal(request.model, 'original-model')
  assert.equal(request.reasoningEffort, 'high')
  assert.equal(request.temperature, 0.2)
  assert.deepEqual(request.messages.slice(0, -1), messages)
  assert.deepEqual(request.toolHistory, history)
  assert.deepEqual(request.tools, header.tools)
  const final = request.messages.at(-1)
  assert.equal(final.role, 'user')
  assert.deepEqual(final.content, [{ type: 'text', text: HANDOFF_PROMPT }])
  assert.deepEqual({ messages, history, header, events }, before, 'must not mutate the source context')
  assertSilent(f.calls)
})

test('does not truncate a context over 140,000 characters or drop its oldest content', async () => {
  const long = structuredClone(messages)
  long[1].content[0].text = 'OLDEST-BEGIN-' + '甲'.repeat(145_000) + '-OLDEST-END'
  const f = fixture({ sourceMessages: long })
  const result = await summarizeOnce(f.ctx, id)
  assert.equal(result.status, 200)
  assert.deepEqual(f.calls.streams[0].messages.slice(0, -1), long)
  assert.equal(f.calls.streams[0].messages[1].content[0].text, long[1].content[0].text)
  assertSilent(f.calls)
})

test('snapshots the live current model, including a pending selection, rather than the host default', async () => {
  const f = fixture({ pending: { provider: 'pending-provider', model: 'pending-model', reasoningEffort: 'low' } })
  const result = await summarizeOnce(f.ctx, id)
  assert.equal(result.status, 200)
  assert.equal(f.calls.streams[0].provider, 'pending-provider')
  assert.equal(f.calls.streams[0].model, 'pending-model')
  assert.equal(f.calls.streams[0].reasoningEffort, 'low')
  assertSilent(f.calls)
})

test('uses the pending model projection if the live agent model API is unavailable', async () => {
  const f = fixture({ pending: { provider: 'pending-provider', model: 'pending-model' } })
  delete f.agent.model
  const result = await summarizeOnce(f.ctx, id)
  assert.equal(result.status, 200)
  assert.equal(f.calls.streams[0].provider, 'pending-provider')
  assert.equal(f.calls.streams[0].model, 'pending-model')
  assertSilent(f.calls)
})

test('a provider switched during the conversation is used directly without another confirmation', async () => {
  const f = fixture({ pending: { provider: 'new-provider', model: 'new-model' } })
  const result = await summarizeOnce(f.ctx, id)
  assert.equal(result.status, 200)
  assert.equal(f.calls.streams.length, 1)
  assert.equal(f.calls.streams[0].provider, 'new-provider')
  assert.equal(f.calls.streams[0].model, 'new-model')
  assertSilent(f.calls)
})

test('the HTTP route uses the current provider even when the last request used another one', async () => {
  const f = fixture({ pending: { provider: 'new-provider', model: 'new-model' } })
  const request = (body) => ({ json: async () => body })
  const response = await summarize(f.ctx, request({ sessionId: id }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).summary, '摘要正文')
  assert.equal(f.calls.streams[0].provider, 'new-provider')
})

test('unpaired historical tool calls do not get sent to a provider', async () => {
  const unmatched = messages.filter((message) => message.role !== 'tool')
  const f = fixture({ sourceMessages: unmatched })
  const result = await summarizeOnce(f.ctx, id)
  assert.equal(result.body.error, 'source-busy')
  assert.equal(f.calls.streams.length, 0)
})

test('model switches do not inherit the old adapter default output limit', async () => {
  const oldHeader = { config: { ...header.config, maxTokens: 12345 }, adapterDefaults: { maxTokens: true }, tools: header.tools }
  const f = fixture({ sourceHeader: oldHeader, pending: { provider: 'original-provider', model: 'new-model' } })
  assert.equal((await summarizeOnce(f.ctx, id)).status, 200)
  assert.equal(f.calls.streams[0].maxTokens, undefined)
})

test('the canonical assembler uses final text blocks even without deltas', async () => {
  const f = fixture({ chunks: [{ type: 'block-end', index: 0, block: { type: 'text', text: '完整摘要' } }, ok[1]] })
  const result = await summarizeOnce(f.ctx, id)
  assert.equal(result.status, 200)
  assert.equal(result.body.summary, '完整摘要')
})

test('rejects a running source without starting a model call or writing to it', async () => {
  const f = fixture({ busy: true })
  assertFailure(await summarizeOnce(f.ctx, id))
  assert.equal(f.calls.streams.length, 0)
  assertSilent(f.calls)
})

test('returns an error for a missing or unreadable source without calling the model', async () => {
  const f = fixture()
  assertFailure(await summarizeOnce(f.ctx, 'missing'))
  assert.equal(f.calls.streams.length, 0)
  assertSilent(f.calls)
})

test('does not fall back to a different model if the source has no request header', async () => {
  const f = fixture({ sourceHeader: undefined })
  // Default argument values make an explicit undefined choose the fixture default.
  f.session.requestHeader = () => undefined
  f.agent.model.current = () => undefined
  f.ctx.sessionProjections.stateOf = () => ({ lastUsed: null, pending: null })
  assertFailure(await summarizeOnce(f.ctx, id))
  assert.equal(f.calls.streams.length, 0)
  assertSilent(f.calls)
})

for (const [name, chunks] of [
  ['error finish', [{ type: 'text-delta', index: 0, text: 'partial' }, { type: 'finish', reason: { kind: 'error', failure: { code: 'TEST', message: 'provider failed' } } }]],
  ['aborted finish', [{ type: 'text-delta', index: 0, text: 'partial' }, { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'cancelled' } } }]],
  ['empty response', [{ type: 'text-delta', index: 0, text: '   ' }, { type: 'finish', reason: { kind: 'stop' } }]],
  ['missing finish', [{ type: 'text-delta', index: 0, text: 'partial' }]],
  ['tool-calls finish', [{ type: 'text-delta', index: 0, text: 'partial' }, { type: 'finish', reason: { kind: 'tool-calls' } }]],
  ['tool-call delta even with stop', [{ type: 'text-delta', index: 0, text: 'partial' }, { type: 'tool-call-delta', index: 1, id: 'call-new', name: 'read', argumentsDelta: '{}' }, { type: 'finish', reason: { kind: 'stop' } }]],
  ['tool-call block even with stop', [{ type: 'text-delta', index: 0, text: 'partial' }, { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call-new', name: 'read', arguments: '{}' } }, { type: 'finish', reason: { kind: 'stop' } }]],
]) {
  test(`fails closed on ${name}`, async () => {
    const f = fixture({ chunks })
    assertFailure(await summarizeOnce(f.ctx, id))
    assertSilent(f.calls)
  })
}

// The host UI presents max-tokens as a visibly truncated result, not a complete
// summary: it must have both nonempty text and the explicit truncated flag.
test('marks a max-tokens finish as truncated', async () => {
  const f = fixture({ chunks: [{ type: 'text-delta', index: 0, text: 'partial' }, { type: 'finish', reason: { kind: 'max-tokens' } }] })
  const result = await summarizeOnce(f.ctx, id)
  assert.equal(result.status, 200)
  assert.equal(result.body.summary, 'partial')
  assert.equal(result.body.truncated, true)
  assertSilent(f.calls)
})

test('redacts sensitive credentials from model output before returning the summary', async () => {
  const secret = 'sk-abcdefghijklmnopqrstuvwx'
  const token = 'ghp_abcdefghijklmnopqrstuvwx'
  const password = 'example_abc123456789012345'
  const f = fixture({ chunks: [{ type: 'text-delta', index: 0, text: `决策：API key ${secret}; token=${token}; {"password":"${password}"}` }, ok[1]] })
  const result = await summarizeOnce(f.ctx, id)
  assert.equal(result.status, 200)
  assert.match(result.body.summary, /决策/)
  assert.ok(!result.body.summary.includes(secret))
  assert.ok(!result.body.summary.includes(token))
  assert.ok(!result.body.summary.includes(password))
  assertSilent(f.calls)
})

// Cooperative fake provider: it never completes on its own, but reports abort.
function waitForAbort(options) {
  return (async function* () {
    if (!options.signal.aborted) await new Promise((resolve) => options.signal.addEventListener('abort', resolve, { once: true }))
    yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'cancelled' } } }
  })()
}

test('forwards caller cancellation to the in-flight request and returns an error', { timeout: 2000 }, async () => {
  const controller = new AbortController()
  const f = fixture({ stream: waitForAbort })
  const run = summarizeOnce(f.ctx, id, controller.signal)
  controller.abort(new Error('client-cancelled'))
  assertFailure(await run)
  if (f.calls.streams.length) assert.equal(f.calls.streams[0].signal.aborted, true)
  assertSilent(f.calls)
})

test('duplicate callers can cancel independently without aborting the other request', { timeout: 2000 }, async () => {
  let started
  let release
  const ready = new Promise((resolve) => { started = resolve })
  const gate = new Promise((resolve) => { release = resolve })
  const f = fixture({ stream: () => (async function* () { started(); await gate; yield* ok })() })
  const first = new AbortController()
  const second = new AbortController()
  const request = (signal) => ({ signal, json: async () => ({ sessionId: id }) })
  const a = summarize(f.ctx, request(first.signal))
  const b = summarize(f.ctx, request(second.signal))
  await ready
  first.abort(new Error('first left'))
  assert.ok((await a).status >= 400)
  assert.equal(f.calls.streams.length, 1)
  assert.equal(f.calls.streams[0].signal.aborted, false)
  release()
  assert.equal((await b).status, 200)
  assertSilent(f.calls)
})

test('all callers leaving cancels the shared provider request', { timeout: 2000 }, async () => {
  let started
  const ready = new Promise((resolve) => { started = resolve })
  const f = fixture({ stream: (options) => { started(); return waitForAbort(options) } })
  const first = new AbortController()
  const second = new AbortController()
  const request = (signal) => ({ signal, json: async () => ({ sessionId: id }) })
  const a = summarize(f.ctx, request(first.signal))
  const b = summarize(f.ctx, request(second.signal))
  await ready
  first.abort()
  second.abort()
  await Promise.all([a, b])
  assert.equal(f.calls.streams.length, 1)
  assert.equal(f.calls.streams[0].signal.aborted, true)
})

test('timeout returns even if the provider ignores abort', { timeout: 2000 }, async (t) => {
  const realSetTimeout = globalThis.setTimeout
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => realSetTimeout(fn, ms >= 10_000 ? 5 : ms, ...args))
  const f = fixture({ stream: () => (async function* () { await new Promise(() => {}); yield* ok })() })
  assertFailure(await summarizeOnce(f.ctx, id))
  assert.equal(f.calls.streams[0].signal.aborted, true)
})

test('times out an in-flight model request and aborts the provider', { timeout: 2000 }, async (t) => {
  // Shorten only the implementation's long timeout; keep the test runner's own
  // watchdog untouched. No wall-clock wait of three minutes and no real model.
  const realSetTimeout = globalThis.setTimeout
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => realSetTimeout(fn, ms >= 10_000 ? 5 : ms, ...args))
  const f = fixture({ stream: waitForAbort })
  const result = await summarizeOnce(f.ctx, id)
  assertFailure(result)
  assert.equal(f.calls.streams.length, 1)
  assert.equal(f.calls.streams[0].signal.aborted, true)
  assertSilent(f.calls)
})
