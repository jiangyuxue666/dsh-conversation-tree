import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = await mkdtemp(join(tmpdir(), 'dsh-conversation-tree-stats-'))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = home
const module = await import(`./index.js?stats-test=${Date.now()}`)
const { augmentNodeStats, loadStatsCache, persistStats, resetStatsCache, scheduleStatsPersist, statsCache } = module.__test

after(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(home, { recursive: true, force: true })
})

const events = [
  { seq: 0, type: 'turn/start', time: 1, data: { turn: 1 } },
  { seq: 1, type: 'user/message', time: 2, data: { content: [{ type: 'text', text: '问题' }] } },
  { seq: 2, type: 'assistant/message', time: 3, data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '回答' }] } } },
  { seq: 3, type: 'turn/end', time: 4, data: { turn: 1, reason: { kind: 'completed' } } },
]

function fakePersistence(revision) {
  const state = { opens: 0 }
  return {
    state,
    service: {
      async stat() {
        return { revision }
      },
      async open() {
        state.opens += 1
        return {
          inheritedEventCount: 0,
          async read() {
            return { events: events.map((event) => ({ ...event })) }
          },
          async close() {},
        }
      },
    },
  }
}

function fakeContext(persistence) {
  return {
    sessions: { get() { return undefined } },
    get(name) {
      if (name === 'sessionPersistence') return persistence
      return undefined
    },
  }
}

function node(id) {
  return { id, parentId: null, depth: 0, childCount: 0 }
}

test('an unchanged revision is never re-read', async () => {
  statsCache.clear()
  const { service, state } = fakePersistence('rev-1')
  const ctx = fakeContext(service)
  const first = node('a')
  await augmentNodeStats(ctx, [first], undefined)
  assert.equal(state.opens, 1)
  assert.equal(first.statsAvailable, true)
  assert.ok(first.usage !== undefined)

  const second = node('a')
  await augmentNodeStats(ctx, [second], undefined)
  assert.equal(state.opens, 1, 'same revision must reuse the cached sample')
  assert.deepEqual(second.usage, first.usage)
})

test('a changed revision is re-read', async () => {
  statsCache.clear()
  const { service, state } = fakePersistence('rev-1')
  const ctx = fakeContext(service)
  await augmentNodeStats(ctx, [node('b')], undefined)
  const { service: nextService, state: nextState } = fakePersistence('rev-2')
  const ctx2 = fakeContext(nextService)
  await augmentNodeStats(ctx2, [node('b')], undefined)
  assert.equal(state.opens, 1)
  assert.equal(nextState.opens, 1, 'a new revision must read the log again')
})

test('a backend without revisions falls back to the TTL', async () => {
  statsCache.clear()
  const { service, state } = fakePersistence(undefined)
  const ctx = fakeContext(service)
  await augmentNodeStats(ctx, [node('c')], undefined)
  await augmentNodeStats(ctx, [node('c')], undefined)
  assert.equal(state.opens, 1, 'a fresh revision-less sample is reused inside the TTL')
})

test('samples survive a restart through the sidecar', async () => {
  statsCache.clear()
  const { service } = fakePersistence('rev-persist')
  await augmentNodeStats(fakeContext(service), [node('d')], undefined)
  scheduleStatsPersist()
  await persistStats()

  const stored = JSON.parse(await readFile(join(home, 'conversation-tree-stats.json'), 'utf8'))
  assert.equal(stored.version, 1)
  assert.equal(stored.entries.d.revision, 'rev-persist')
  assert.equal(stored.entries.d.counts.turns, 1)

  // A restart forgets the in-memory map and reads the sidecar again.
  statsCache.clear()
  resetStatsCache()
  await loadStatsCache()
  assert.equal(statsCache.get('d')?.revision, 'rev-persist')
})
