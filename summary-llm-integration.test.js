import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, LlmRuntime } from '@deepseek-ai/dsh-llm'
import { HANDOFF_PROMPT, summarizeContext } from './lib/summarize.js'

// Synthetic data only. This adapter is local and does not implement a vendor
// protocol or perform network I/O. Projection and routing are the real runtime's.
const tool = (name, extra = {}) => ({ name, description: `synthetic ${name}`, parameters: { type: 'object', properties: {} }, ...extra })
const base = tool('base')
const retired = tool('retired')
const added = tool('added')
const source = () => ({
  route: { provider: 'local-target', model: 'new-model', reasoningEffort: 'low' },
  header: {
    config: { provider: 'local-original', model: 'old-model', reasoningEffort: 'high', maxTokens: 500, temperature: 0.2 },
    adapterDefaults: { maxTokens: true },
    tools: [base, { ...added, deferLoading: true }],
  },
  messages: [
    { id: 'system-1', role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'synthetic original system' }] },
    { id: 'user-1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'synthetic user request' }] },
    { id: 'update-1', role: 'developer', source: { kind: 'test' }, content: [{ type: 'tool-addition', toolName: 'added' }, { type: 'tool-removal', toolName: 'retired' }] },
    { id: 'assistant-1', role: 'assistant', source: { kind: 'model', provider: 'local-original', model: 'old-model', replayState: { opaque: 'synthetic' } }, content: [{ type: 'tool-call', id: 'call-1', name: 'base', arguments: '{}' }] },
    { id: 'tool-1', role: 'tool', source: { kind: 'tool', callId: 'call-1' }, toolCallId: 'call-1', content: [{ type: 'text', text: 'synthetic tool result' }] },
    { id: 'system-2', role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'synthetic updated system' }] },
  ],
  toolHistory: { tools: [base, retired], updates: [{ messageId: 'update-1', additions: [added] }] },
})

class LocalAdapter extends LlmAdapter {
  constructor(mode) { super(); this.mode = mode; this.resolutions = []; this.calls = [] }
  async resolveModel(provider, model) {
    this.resolutions.push({ provider, model })
    return {
      provider, id: model, name: model,
      ...(this.mode === undefined ? {} : { toolUpdate: this.mode }),
      systemPromptUpdate: 'in-history',
      defaultMaxTokens: 77,
      reasoning: { efforts: [{ id: 'low', name: 'low' }, { id: 'high', name: 'high' }] },
    }
  }
  async *stream(options) {
    this.calls.push(options)
    yield { type: 'text-delta', index: 0, text: ' synthetic ' }
    yield { type: 'text-delta', index: 0, text: 'summary ' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

function runtime(mode, sameAdapter = false) {
  const context = new Context()
  const llm = new LlmRuntime(context)
  const target = new LocalAdapter(mode)
  const original = sameAdapter ? target : new LocalAdapter(mode)
  llm.registerAdapter(['local-target'], target)
  llm.registerAdapter(['local-original'], original)
  return { llm, target, original }
}

for (const mode of [undefined, 'in-history', 'addition-only']) {
  test(`real LlmRuntime projects tool history: ${mode ?? 'unsupported'}`, async () => {
    const fixture = source()
    const before = structuredClone(fixture)
    const { llm, target, original } = runtime(mode)
    const signal = new AbortController().signal
    assert.deepEqual(await summarizeContext({ llm }, fixture, signal), { text: 'synthetic summary', truncated: false })
    assert.deepEqual(target.resolutions, [{ provider: 'local-target', model: 'new-model' }])
    assert.equal(original.calls.length, 0)
    assert.equal(target.calls.length, 1)
    const request = target.calls[0]
    assert.equal(request.provider, 'local-target')
    assert.equal(request.model, 'new-model')
    assert.equal(request.reasoningEffort, 'low')
    assert.equal(request.temperature, 0.2)
    assert.equal(request.maxTokens, 77, 'new adapter default replaces old adapter default')
    assert.equal(request.signal, signal)
    assert.deepEqual(request.messages.filter((m) => m.role === 'system'), [fixture.messages[0], fixture.messages[5]])
    assert.deepEqual(request.messages.at(-1), { role: 'user', content: [{ type: 'text', text: HANDOFF_PROMPT }] })
    assert.deepEqual(request.messages.find((m) => m.role === 'tool'), fixture.messages[4])
    const assistant = request.messages.find((m) => m.role === 'assistant')
    assert.deepEqual(assistant.content, fixture.messages[3].content)
    assert.equal(assistant.source.replayState, undefined, 'foreign adapter replay state must not cross adapters')
    const updates = request.messages.filter((m) => m.role === 'developer')
    if (mode === undefined) {
      assert.deepEqual(updates, [])
      assert.deepEqual(request.tools, [base, added], 'unsupported mode uses active tools without deferred marker')
    } else if (mode === 'in-history') {
      assert.deepEqual(updates, [fixture.messages[2]])
      assert.deepEqual(request.tools, [base, retired, { ...added, deferLoading: true }])
    } else {
      assert.deepEqual(updates, [{ ...fixture.messages[2], content: [{ type: 'tool-addition', toolName: 'added' }] }])
      assert.deepEqual(request.tools, [base, { ...added, deferLoading: true }])
    }
    assert.deepEqual(fixture, before, 'source context remains unchanged')
  })
}

test('runtime retains same-adapter replay state and explicitly configured maxTokens', async () => {
  const fixture = source()
  fixture.header.adapterDefaults.maxTokens = false
  const { llm, target } = runtime('in-history', true)
  await summarizeContext({ llm }, fixture, new AbortController().signal)
  assert.equal(target.calls[0].maxTokens, 500)
  assert.deepEqual(target.calls[0].messages.find((m) => m.role === 'assistant').source.replayState, { opaque: 'synthetic' })
})

test('incomplete history falls back to current tool declarations and omits developer updates', async () => {
  const fixture = source()
  fixture.toolHistory.updates.push({ messageId: 'missing-synthetic-update', additions: [] })
  const { llm, target } = runtime('in-history')
  await summarizeContext({ llm }, fixture, new AbortController().signal)
  assert.deepEqual(target.calls[0].tools, fixture.header.tools)
  assert.equal(target.calls[0].messages.some((m) => m.role === 'developer'), false)
})

test('unregistered route fails without calling any mock adapter', async () => {
  const fixture = source()
  fixture.route.provider = 'local-missing'
  const { llm, target, original } = runtime('in-history')
  await assert.rejects(summarizeContext({ llm }, fixture, new AbortController().signal), /no adapter registered/i)
  assert.equal(target.calls.length, 0)
  assert.equal(original.calls.length, 0)
})
