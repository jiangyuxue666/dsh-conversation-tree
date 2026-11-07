import { failure, json, readJson, sameSiteRequest } from './base.js'
import { ownCounts, ownUsage } from './stats.js'
import { selectionOfEvents } from './models.js'
import { clip, inheritedOf, textOf, titleOfEvents } from './transcript.js'

/**
 * Two branches side by side.
 *
 * A tree shows where the branches came from; it does not show what they did.
 * Choosing between "方案 A" and "方案 B" means comparing turns, spend, the model
 * they ran on, and — above all — the last thing each one concluded.
 *
 * @module dsh-conversation-tree/lib/compare
 */

/** Conversations one comparison may name. */
export const MAX_COMPARE_SIDES = 4

/** Last readable message of one role, flattened for a compact card. */
export function lastText(events, kind) {
  for (let index = (events?.length ?? 0) - 1; index >= 0; index--) {
    const event = events[index]
    if (event?.type !== kind) continue
    const text = kind === 'user/message'
      ? textOf(event.data?.content)
      : textOf(event.data?.message?.content)
    if (text === '') continue
    return clip(text.replace(/\s+/g, ' ').trim(), 280)
  }
  return ''
}

/** Number of tool calls this conversation made after its inherited prefix. */
export function countToolCalls(events, fromSeq) {
  let total = 0
  const start = Math.max(0, Math.min(events?.length ?? 0, fromSeq ?? 0))
  for (let index = start; index < (events?.length ?? 0); index++) {
    if (events[index]?.type === 'tool/call') total += 1
  }
  return total
}

/** POST /api/conversation-tree/compare */
export async function compareSessions(ctx, request) {
  if (!sameSiteRequest(request)) return failure(403, 'cross-origin')
  const body = await readJson(request)
  if (body === undefined) return failure(400, 'invalid-json')
  const ids = Array.isArray(body.ids) ? body.ids : []
  if (ids.length < 2 || ids.length > MAX_COMPARE_SIDES) return failure(400, 'missing-fields')
  for (const id of ids) {
    if (typeof id !== 'string' || id === '' || id.length > 256) return failure(400, 'invalid-session-id')
  }
  const sides = []
  for (const id of ids) {
    const side = await readSide(ctx, id)
    if (side === undefined) return failure(404, `session-not-found:${id}`)
    sides.push(side)
  }
  return json({ version: 1, sides })
}

/** One conversation's comparable shape. */
export async function readSide(ctx, sessionId) {
  const session = await readSession(ctx, sessionId)
  if (session === undefined) return undefined
  const counts = ownCounts(session.events, session.inherited)
  return {
    id: sessionId,
    title: titleOfEvents(session.events),
    turns: counts.turns,
    steps: counts.steps,
    toolCalls: countToolCalls(session.events, session.inherited),
    usage: ownUsage(session.events, session.inherited),
    model: selectionOfEvents(session.events) ?? null,
    lastUser: lastText(session.events, 'user/message'),
    lastAssistant: lastText(session.events, 'assistant/message'),
  }
}

/** Read one Session's events and its inherited prefix, live or stored. */
export async function readSession(ctx, sessionId) {
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) {
    return { events: live.snapshotEvents(), inherited: inheritedOf(live) }
  }
  let persistence
  try {
    persistence = ctx.get('sessionPersistence')
  } catch {
    return undefined
  }
  if (persistence === undefined || typeof persistence.open !== 'function') return undefined
  let handle
  try {
    handle = await persistence.open(sessionId, 'read')
    const result = await handle.read()
    const inherited = Number.isSafeInteger(handle.inheritedEventCount) && handle.inheritedEventCount >= 0
      ? handle.inheritedEventCount
      : 0
    return { events: result.events, inherited }
  } catch {
    return undefined
  } finally {
    await handle?.close().catch(() => {})
  }
}
