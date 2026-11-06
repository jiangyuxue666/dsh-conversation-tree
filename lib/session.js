import { open } from 'node:fs/promises'
import { EDGE_RECORD_TYPE } from './base.js'
import { saveTreeRegistry, validEdge } from './registry.js'

/** Move pending edges whose child session now exists into the durable edges. */
export async function promotePending(ctx, known) {
  if (known.pending.length === 0) return
  const persistence = ctx.get('sessionPersistence')
  const promoted = []
  for (const edge of [...known.pending]) {
    let exists = ctx.sessions.get(edge.childId) !== undefined
    if (!exists && persistence !== undefined) {
      try {
        exists = (await persistence.stat(edge.childId)) !== undefined
      } catch {
        exists = false
      }
    }
    if (exists) promoted.push(edge)
  }
  if (promoted.length === 0) return
  const ids = new Set(promoted.map((edge) => edge.childId))
  known.pending = known.pending.filter((edge) => !ids.has(edge.childId))
  known.edges.push(...promoted)
  await saveTreeRegistry(known)
}

/** Read a session's own events, live or from persistence. */
export async function eventsOfSession(ctx, sessionId) {
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) return live.snapshotEvents()
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined || typeof persistence.open !== 'function') return undefined
  let handle
  try {
    handle = await persistence.open(sessionId, 'read')
    return (await handle.read()).events
  } catch {
    return undefined
  } finally {
    await handle?.close().catch(() => {})
  }
}

/** The branch edge one session recorded about itself, if it wrote one. */
export async function edgeRecordOf(ctx, sessionId) {
  const events = await eventsOfSession(ctx, sessionId)
  if (!Array.isArray(events)) return undefined
  try {
    const { pluginRecordOf } = await import('@deepseek-ai/dsh-session')
    if (typeof pluginRecordOf !== 'function') return undefined
    for (let index = events.length - 1; index >= 0; index--) {
      const record = pluginRecordOf(events[index])
      if (record?.type !== EDGE_RECORD_TYPE) continue
      const data = record.data
      return data !== null && typeof data === 'object' ? data : undefined
    }
  } catch {
    return undefined
  }
  return undefined
}

/**
 * A session's header, live or from persistence metadata.
 * @param ctx - plugin context.
 * @param sessionId - session to inspect.
 * @returns the header, or undefined when the session is unknown.
 */
export async function headerOfSession(ctx, sessionId) {
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) return live.header
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined || typeof persistence.stat !== 'function') return undefined
  const snapshot = await persistence.stat(sessionId).catch(() => undefined)
  return snapshot?.header
}

/**
 * The read-only edge a seeded Session's own header implies.
 *
 * A fork created by DSH itself carries `parentSession` when the fork call
 * passes it. The boundary is recoverable from the seed: `buildForkSeed` appends
 * one `session/end-seed` marker right after the inherited prefix, so the cut is
 * one event earlier. These nodes are shown but never written to the registry,
 * because their ownership cannot be proven for deletion.
 *
 * @param ctx - plugin context.
 * @param childId - seeded session.
 * @param parentId - parent named by the header.
 * @returns an external edge, or undefined when the session is not a plain fork.
 */
export async function externalEdgeOf(ctx, childId, parentId) {
  const header = await headerOfSession(ctx, childId)
  if (header === undefined || header.isSeeded !== true) return undefined
  // Subagent sessions also name a parent; they are not conversation branches.
  if (header.origin !== undefined) return undefined
  if (header.delegationDepth !== undefined && header.delegationDepth !== 0) return undefined
  const events = await eventsOfSession(ctx, childId)
  if (!Array.isArray(events)) return undefined
  const marker = events.find((event) => event?.type === 'session/end-seed')
  if (marker === undefined || !Number.isSafeInteger(marker.seq) || marker.seq < 1) return undefined
  return {
    childId,
    parentId,
    atSeq: marker.seq - 1,
    turn: null,
    snippet: '',
    title: '',
    createdAt: null,
    external: true,
  }
}

/** The durable parent a session's header names, without reading its whole log. */
export async function parentOfSession(ctx, sessionId) {
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) {
    return typeof live.header?.parentSession === 'string' ? live.header.parentSession : undefined
  }
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined || typeof persistence.stat !== 'function') return undefined
  try {
    const snapshot = await persistence.stat(sessionId)
    const parent = snapshot?.header?.parentSession
    return typeof parent === 'string' ? parent : undefined
  } catch {
    return undefined
  }
}

/**
 * Rebuild the missing ancestor chain of one session from its own records.
 * Runs only when the registry has no edge for the session; a damaged or
 * hand-deleted registry therefore costs a read instead of the whole tree.
 */
export async function recoverChain(ctx, known, sessionId) {
  const recovered = []
  let current = sessionId
  const seen = new Set()
  for (let depth = 0; depth < 32; depth++) {
    if (current === '' || seen.has(current)) break
    seen.add(current)
    if ([...known.edges, ...known.pending].some((edge) => edge.childId === current)) break
    // A session with no durable parent can never have an edge record, so skip
    // the expensive log read for every root conversation.
    if (await parentOfSession(ctx, current) === undefined) break
    const data = await edgeRecordOf(ctx, current)
    if (data === undefined) break
    const edge = {
      childId: current,
      parentId: typeof data.parentId === 'string' ? data.parentId : '',
      atSeq: data.atSeq,
      turn: data.turn,
      snippet: typeof data.snippet === 'string' ? data.snippet : '',
      title: typeof data.title === 'string' ? data.title : '',
      ordinal: data.ordinal,
      createdAt: data.createdAt,
    }
    if (!validEdge(edge)) break
    recovered.push(edge)
    current = edge.parentId
  }
  return recovered
}
