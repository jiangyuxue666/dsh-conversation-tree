import { randomUUID } from 'node:crypto'
import { open, readFile, rename, unlink } from 'node:fs/promises'
import { join, parse } from 'node:path'
import { harnessHome, json } from './base.js'
import { inheritedOf } from './transcript.js'
import { selectionOfEvents } from './models.js'

/** How long a cold-session usage sample stays reusable. */
export const STATS_TTL_MS = 30_000

/**
 * Reusable per-session usage samples. Reading a cold log means parsing every
 * event, and a deep tree asks for all of them on each refresh. A sample is
 * keyed by the backend's change token (`SessionPersistenceSnapshot.revision`),
 * so an unchanged log is never re-read; a short TTL still covers backends that
 * do not report one. The map survives a host restart through a small sidecar
 * file, because the same workspace is usually opened again.
 */
export const STATS_CACHE = globalThis[Symbol.for('dsh-conversation-tree.stats-cache')]
  ?? (globalThis[Symbol.for('dsh-conversation-tree.stats-cache')] = new Map())
/** Sidecar holding the samples, next to the tree registry. */
export const STATS_FILE = join(harnessHome(), 'conversation-tree-stats.json')
/** Samples kept on disk; the oldest are dropped first. */
export const STATS_MAX_ENTRIES = 2000
/** Cold logs read at once; a serial loop made a deep tree take minutes. */
export const STATS_READ_CONCURRENCY = 4

let statsLoaded = false
let statsDirty = false
let statsWriteTimer

/** Test hook: forget the one-shot load so the sidecar is read again. */
export function resetStatsCache() {
  statsLoaded = false
}

/** Load the sidecar once per process; a missing or broken file means no cache. */
export async function loadStatsCache() {
  if (statsLoaded) return
  statsLoaded = true
  let parsed
  try {
    parsed = JSON.parse(await readFile(STATS_FILE, 'utf8'))
  } catch {
    return
  }
  if (parsed === null || typeof parsed !== 'object' || parsed.version !== 1
    || parsed.entries === null || typeof parsed.entries !== 'object') return
  for (const [id, entry] of Object.entries(parsed.entries)) {
    if (entry === null || typeof entry !== 'object') continue
    if (entry.usage === undefined || entry.counts === undefined) continue
    STATS_CACHE.set(id, {
      revision: typeof entry.revision === 'string' ? entry.revision : undefined,
      usage: entry.usage,
      counts: entry.counts,
      model: entry.model,
      at: Number.isFinite(entry.at) ? entry.at : 0,
    })
  }
}

/** Mark the sidecar for a debounced rewrite; many samples arrive per tree. */
export function scheduleStatsPersist() {
  statsDirty = true
  if (statsWriteTimer !== undefined) return
  statsWriteTimer = setTimeout(() => {
    statsWriteTimer = undefined
    void persistStats().catch(() => {})
  }, 1000)
  statsWriteTimer.unref?.()
}

/** Atomically replace the sidecar with the newest samples. */
export async function persistStats() {
  if (!statsDirty) return
  statsDirty = false
  const newest = [...STATS_CACHE.entries()]
    .filter(([, entry]) => entry !== null && typeof entry === 'object')
    .sort((left, right) => (right[1].at ?? 0) - (left[1].at ?? 0))
    .slice(0, STATS_MAX_ENTRIES)
  const entries = {}
  for (const [id, entry] of newest) {
    entries[id] = {
      ...(typeof entry.revision === 'string' ? { revision: entry.revision } : {}),
      usage: entry.usage,
      counts: entry.counts,
      ...(entry.model === undefined ? {} : { model: entry.model }),
      at: Number.isFinite(entry.at) ? entry.at : 0,
    }
  }
  const temporary = `${STATS_FILE}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify({ version: 1, entries }), 'utf8')
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, STATS_FILE)
  } catch {
    await unlink(temporary).catch(() => {})
  }
}

/** The backend's change token for one stored session, when it reports one. */
export async function statsRevisionOf(persistence, sessionId) {
  if (persistence === undefined || typeof persistence.stat !== 'function') return undefined
  const snapshot = await persistence.stat(sessionId).catch(() => undefined)
  const revision = snapshot?.revision
  if (revision === undefined || revision === null) return undefined
  return typeof revision === 'string' ? revision : String(revision)
}

/** Add each Session's own usage and Turn counts, reading cold logs when needed. */
export async function augmentLiveStats(ctx, payload, signal) {
  if (payload === null || typeof payload !== 'object') return
  await augmentNodeStats(ctx, payload.nodes, signal)
}

/** Add each Session's own usage and Turn counts to one list of nodes. */
export async function augmentNodeStats(ctx, nodes, signal) {
  if (!Array.isArray(nodes) || nodes.length === 0) return
  let persistence
  try {
    persistence = ctx.get('sessionPersistence')
  } catch {
    persistence = undefined
  }
  await loadStatsCache()
  if (STATS_CACHE.size > STATS_MAX_ENTRIES * 2) pruneStatsCache()
  const cold = []
  const seen = new Set()
  for (const node of nodes) {
    if (node === null || typeof node !== 'object' || typeof node.id !== 'string' || seen.has(node.id)) continue
    seen.add(node.id)
    const live = ctx.sessions.get(node.id)
    if (live !== undefined) {
      try {
        const events = live.snapshotEvents()
        const inherited = inheritedOf(live)
        applyNodeStats(node, ownUsage(events, inherited), ownCounts(events, inherited), selectionOfEvents(events))
      } catch {
        /* a live session that cannot be read keeps its numbers unknown */
      }
      // A session that just became live has authoritative in-memory events.
      STATS_CACHE.delete(node.id)
      continue
    }
    if (persistence === undefined || typeof persistence.open !== 'function') continue
    // The change token costs one header read and saves the whole log parse.
    const revision = await statsRevisionOf(persistence, node.id)
    const cached = STATS_CACHE.get(node.id)
    if (cached !== undefined && revision !== undefined && cached.revision === revision) {
      applyNodeStats(node, cached.usage, cached.counts, cached.model)
      continue
    }
    if (cached !== undefined && revision === undefined && Date.now() - cached.at < STATS_TTL_MS) {
      applyNodeStats(node, cached.usage, cached.counts, cached.model)
      continue
    }
    cold.push({ node, revision })
  }
  if (cold.length === 0) return
  let cursor = 0
  const worker = async () => {
    for (;;) {
      if (signal?.aborted) return
      const entry = cold[cursor]
      cursor += 1
      if (entry === undefined) return
      let handle
      try {
        handle = await persistence.open(entry.node.id, 'read')
        const result = await handle.read()
        const inherited = Number.isSafeInteger(handle.inheritedEventCount) && handle.inheritedEventCount >= 0
          ? handle.inheritedEventCount
          : 0
        const usage = ownUsage(result.events, inherited)
        const counts = ownCounts(result.events, inherited)
        const model = selectionOfEvents(result.events)
        STATS_CACHE.set(entry.node.id, { ...(entry.revision === undefined ? {} : { revision: entry.revision }), usage, counts, model, at: Date.now() })
        applyNodeStats(entry.node, usage, counts, model)
        scheduleStatsPersist()
      } catch {
        /* unreadable cold session: leave the numbers absent, not zero */
      } finally {
        await handle?.close().catch(() => {})
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(STATS_READ_CONCURRENCY, cold.length) }, worker))
}

/** Keep the newest samples; a workspace with many short sessions must not grow forever. */
export function pruneStatsCache() {
  const newest = [...STATS_CACHE.entries()]
    .sort((left, right) => (right[1].at ?? 0) - (left[1].at ?? 0))
    .slice(0, STATS_MAX_ENTRIES)
  STATS_CACHE.clear()
  for (const [id, entry] of newest) STATS_CACHE.set(id, entry)
}

/** Publish one session's numbers onto its tree node. */
export function applyNodeStats(node, usage, counts, model) {
  node.usage = usage
  node.turns = counts.turns
  node.steps = counts.steps
  if (model !== undefined) node.model = model
  node.statsAvailable = true
}

/** The retry slot a usage sample belongs to, if the event names one. */
export function turnStepKey(data) {
  if (!Number.isSafeInteger(data?.turn) || !Number.isSafeInteger(data?.step)) return null
  return `${data.turn}:${data.step}`
}

/** The last usage chunk embedded in one compact Assistant stream. */
export function lastStreamUsage(stream) {
  if (!Array.isArray(stream)) return undefined
  for (let index = stream.length - 1; index >= 0; index--) {
    const record = stream[index]
    if (record?.type === 'chunk' && record.chunk?.type === 'usage' && record.chunk.usage !== undefined) {
      return record.chunk.usage
    }
  }
  return undefined
}

/** Normalize one provider usage sample into the four disjoint billing buckets. */
export function usageBuckets(usage) {
  const count = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
  return {
    uncachedInputTokens: count(usage?.inputTokens),
    outputTokens: count(usage?.outputTokens),
    cacheReadTokens: count(usage?.cacheReadTokens),
    cacheWriteTokens: count(usage?.cacheWriteTokens),
  }
}

/**
 * Sum only the events this Session owns after its inherited fork prefix.
 * A retried step replaces its earlier sample instead of adding to it.
 */
export function ownUsage(events, fromSeq) {
  const samples = new Map()
  const start = Math.max(0, Math.min(events.length, fromSeq))
  for (let index = start; index < events.length; index++) {
    const event = events[index]
    if (event?.type === 'llm/retry-started') {
      const key = turnStepKey(event.data)
      if (key !== null) samples.delete(key)
      continue
    }
    if (event?.type !== 'assistant/message' && event?.type !== 'assistant/attempt') continue
    const usage = event.type === 'assistant/message'
      ? event.data?.usage
      : lastStreamUsage(event.data?.stream)
    if (usage === undefined || usage === null) continue
    samples.set(turnStepKey(event.data) ?? `seq:${event.seq}`, usageBuckets(usage))
  }
  const totals = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  for (const buckets of samples.values()) {
    totals.uncachedInputTokens += buckets.uncachedInputTokens
    totals.outputTokens += buckets.outputTokens
    totals.cacheReadTokens += buckets.cacheReadTokens
    totals.cacheWriteTokens += buckets.cacheWriteTokens
  }
  return totals
}

/** Count the Turns and Steps the Session completed after its inherited prefix. */
export function ownCounts(events, fromSeq) {
  let turns = 0
  let steps = 0
  const start = Math.max(0, Math.min(events.length, fromSeq))
  for (let index = start; index < events.length; index++) {
    const type = events[index]?.type
    if (type === 'turn/start') turns += 1
    else if (type === 'step/start') steps += 1
  }
  return { turns, steps }
}
