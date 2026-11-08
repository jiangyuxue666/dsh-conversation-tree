import test from 'node:test'
import assert from 'node:assert/strict'
import { Session } from '@deepseek-ai/dsh-session'
import { assertClosedEvents, readSummaryContext, recordedSelection } from './lib/summary-context.js'
import { summarizeOnce } from './lib/summarize.js'

const id = 'synthetic-cold-session'

function userMessage(id, text) {
  return { id, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] }
}

/** A real detached DSH Session; no real user data or persistence is involved. */
function syntheticSession() {
  const session = Session.create(id)
  session.append('turn/start', { turn: 1 })
  const old = session.append('user/message', userMessage('original', 'original pre-compaction history'), { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  session.append('user/message', userMessage('checkpoint', 'previous compressed checkpoint'), {
    surfaceOp: { op: 'replace', startSeq: old.seq, endSeq: old.seq }, sourceEventSeqs: [old.seq],
  })
  session.append('model/selection', { provider: 'synthetic-provider', model: 'synthetic-model' })
  return session
}

function contextForCold(session, { live = () => undefined, revisions = ['rev-1', 'rev-1'], readError, events = session.snapshotEvents() } = {}) {
  const calls = { open: 0, close: 0, stat: 0, stream: [], created: 0 }
  const ctx = {
    sessions: { get: live, messageProjections: [], create: () => { calls.created++; throw new Error('must not create') } },
    agents: { get: () => undefined, create: () => { calls.created++; throw new Error('must not create') } },
    get(name) {
      if (name !== 'sessionPersistence') return undefined
      return {
        async stat() { return { revision: revisions[Math.min(calls.stat++, revisions.length - 1)] } },
        async open(sessionId, access) {
          assert.equal(sessionId, id)
          assert.equal(access, 'read')
          calls.open++
          return {
            header: session.header,
            inheritedEventCount: session.inheritedEventCount,
            async read() {
              if (readError) throw readError
              return { events, eventState: 'shared-frozen' }
            },
            async close() { calls.close++ },
          }
        },
      }
    },
    llm: { stream(options) {
      calls.stream.push(options)
      return (async function* () {
        yield { type: 'text-delta', text: 'handoff' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    } },
  }
  return { ctx, calls }
}

test('cold read reconstructs the current DSH surface without creating or writing a Session', async () => {
  const session = syntheticSession()
  const original = session.snapshotEvents()
  const { ctx, calls } = contextForCold(session)
  const result = await summarizeOnce(ctx, id)
  assert.equal(result.status, 200)
  assert.equal(result.body.summary, 'handoff')
  assert.equal(calls.open, 1)
  assert.equal(calls.close, 1)
  assert.equal(calls.created, 0)
  const sent = calls.stream[0]
  assert.equal(sent.provider, 'synthetic-provider')
  assert.equal(sent.model, 'synthetic-model')
  assert.deepEqual(sent.messages.slice(0, -1), session.deriveMessages())
  assert.equal(sent.messages[0].content[0].text, 'previous compressed checkpoint')
  assert.equal(JSON.stringify(sent.messages).includes('original pre-compaction history'), false)
  assert.deepEqual(session.snapshotEvents(), original)
})

test('cold reads fail closed when the stored revision changes', async () => {
  const { ctx, calls } = contextForCold(syntheticSession(), { revisions: ['before', 'after'] })
  const result = await summarizeOnce(ctx, id)
  assert.equal(result.body.error, 'context-unavailable')
  assert.equal(calls.close, 1)
  assert.equal(calls.stream.length, 0)
})

test('a live source appearing during cold read takes precedence', async () => {
  const cold = syntheticSession()
  const live = syntheticSession()
  let reads = 0
  const { ctx, calls } = contextForCold(cold, { live: () => ++reads >= 2 ? live : undefined })
  ctx.agents.get = () => ({ status: 'idle', model: { current: () => ({ provider: 'live-p', model: 'live-m' }) } })
  const context = await readSummaryContext(ctx, id)
  assert.equal(context.route.provider, 'live-p')
  assert.equal(context.route.model, 'live-m')
  assert.equal(calls.close, 1)
  assert.equal(calls.created, 0)
})

test('cold replay requires and uses the registered message projection', async () => {
  const projection = { type: 'image/offload', project: () => new Map() }
  const session = Session.create(id, undefined, undefined, undefined, [projection])
  session.append('turn/start', { turn: 1 })
  session.append('user/message', userMessage('u1', 'image evidence'), { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  session.append('image/offload', { targets: [] })
  session.append('model/selection', { provider: 'p', model: 'm' })
  const missing = contextForCold(session)
  assert.equal((await summarizeOnce(missing.ctx, id)).body.error, 'context-unavailable')
  assert.equal(missing.calls.stream.length, 0)
  const available = contextForCold(session)
  available.ctx.sessions.messageProjections = [projection]
  assert.equal((await summarizeOnce(available.ctx, id)).status, 200)
})

test('cold read errors close the handle and do not call the model', async () => {
  const { ctx, calls } = contextForCold(syntheticSession(), { readError: new Error('synthetic read failure') })
  const result = await summarizeOnce(ctx, id)
  assert.equal(result.body.error, 'context-unavailable')
  assert.equal(calls.close, 1)
  assert.equal(calls.stream.length, 0)
})

test('an unfinished cold turn is not synthetically closed for summarization', async () => {
  const session = syntheticSession()
  session.append('turn/start', { turn: 2 })
  const { ctx, calls } = contextForCold(session)
  const result = await summarizeOnce(ctx, id)
  assert.equal(result.body.error, 'source-busy')
  assert.equal(calls.stream.length, 0)
})

test('a seed boundary retires an interrupted compaction from a previous lifecycle', () => {
  const start = { seq: 0, time: 1, type: 'compaction/start', data: { compactionId: 'synthetic', turn: null } }
  assert.throws(() => assertClosedEvents([start]), /source-busy/)
  assert.doesNotThrow(() => assertClosedEvents([start, { seq: 1, time: 2, type: 'session/end-seed', data: {} }]))
})

test('model selection follows pending versus the last recorded request', () => {
  const selection = (provider, model, reasoningEffort) => ({ type: 'model/selection', data: { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) } })
  const header = (provider, model, reasoningEffort, adapterDefaults) => ({
    type: 'request/header', data: { header: { config: { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) }, ...(adapterDefaults ? { adapterDefaults } : {}) } },
  })
  assert.deepEqual(recordedSelection([header('a', 'x'), selection('b', 'y', 'high')]), { provider: 'b', model: 'y', reasoningEffort: 'high' })
  assert.deepEqual(recordedSelection([selection('a', 'x'), header('a', 'x', 'high', { reasoningEffort: true })]), { provider: 'a', model: 'x' })
  assert.deepEqual(recordedSelection([selection('a', 'x'), header('b', 'y')]), { provider: 'a', model: 'x' })
})
