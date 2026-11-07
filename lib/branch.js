import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { handles } from './handles.js'
import { markLiveSession } from './liveness.js'
import { EDGE_RECORD_TYPE, errorMessage, failure, json, readJson, sameSiteRequest } from './base.js'
import { clip, textOf, titleOfEvents } from './transcript.js'
import { currentModelSelection, installModelRoute, modelRoute, routeOf, usableRoute } from './models.js'
import { saveTreeRegistry, withTree } from './registry.js'

/** Maximum branch title characters. */
export const MAX_TITLE_CHARS = 80

// ------------------------------------------------------------------- branch
/** POST /api/conversation-tree/branch */
export async function createBranch(ctx, request) {
  if (!sameSiteRequest(request)) return failure(403, 'cross-origin')
  const body = await readJson(request)
  if (body === undefined) return failure(400, 'invalid-json')
  const parentSessionId = typeof body.parentSessionId === 'string' ? body.parentSessionId : ''
  const atSeq = body.atSeq
  if (parentSessionId === '' || !Number.isSafeInteger(atSeq) || atSeq < 0) {
    return failure(400, 'missing-fields')
  }

  const parent = ctx.agents.get(parentSessionId)
  if (parent === undefined) return failure(409, 'session-not-loaded')
  const parentSession = parent.session
  const header = parentSession.header
  if (!header || typeof header !== 'object') return failure(409, 'session-header-unavailable')
  // The persisted depth is a floor; runtime options can deepen it further.
  const storedDepth = header?.delegationDepth ?? 0
  const runtimeDepth = parent.options?.subagentDepth ?? 0
  if (header?.origin !== undefined || !Number.isSafeInteger(storedDepth) || storedDepth !== 0
    || Object.is(storedDepth, -0) || !Number.isSafeInteger(runtimeDepth) || runtimeDepth !== 0
    || Object.is(runtimeDepth, -0)) return failure(403, 'subagent-not-supported')
  const cwd = typeof header.cwd === 'string' ? header.cwd : ''
  if (cwd === '' || !isAbsolute(cwd)) return failure(409, 'cwd-unavailable')

  let events
  let seed
  let inheritedEventCount
  let boundarySeq
  try {
    events = parentSession.snapshotEvents()
    boundarySeq = resolveBranchBoundary(events, atSeq)
    if (boundarySeq < 0) return failure(409, 'branch-boundary-invalid')
    const inheritedPrefix = Number.isSafeInteger(parentSession.inheritedEventCount)
      && parentSession.inheritedEventCount >= 0 ? parentSession.inheritedEventCount : 0
    // A branch's snapshot includes its parent's prefix. Forking inside that
    // prefix would copy an ancestor's context while recording the current
    // branch as the parent, so the tree would show a lineage that never
    // happened. Only the branch's own turns can be branch points.
    if (boundarySeq < inheritedPrefix) return failure(409, 'branch-boundary-inherited')
    if (events.some((event, index) => event.seq !== index)) throw new Error('non-contiguous snapshot')
    const { buildForkSeed } = await import('@deepseek-ai/dsh-session/fork')
    if (typeof buildForkSeed !== 'function') throw new Error('fork helper unavailable')
    seed = buildForkSeed(events, boundarySeq)
    inheritedEventCount = boundarySeq + 1
  } catch (error) {
    return failure(409, `context-unavailable:${errorMessage(error)}`)
  }

  const presets = ctx.get('agentPresets')
  if (!presets || !parent.ctx || typeof presets.composeFrom !== 'function') return failure(409, 'preset-unavailable')
  let presetId
  try {
    presetId = presets.composedPreset(parent.ctx)
    if (typeof presetId !== 'string' || presetId === '') return failure(409, 'preset-unavailable')
  } catch (error) {
    return failure(409, `preset-unavailable:${errorMessage(error)}`)
  }
  const selected = currentModelSelection(ctx, parentSession)
  const route = usableRoute(selected) ? routeOf(selected) : modelRoute(ctx, parentSession)
  if (route === undefined) return failure(409, 'model-unavailable')

  const sessionId = `session-${randomUUID()}`
  const point = branchPoint(events, boundarySeq)
  let ordinal = 1
  let edge
  try {
    edge = await withTree(async (known) => {
      const siblings = [...known.edges, ...known.pending].filter((entry) => entry.parentId === parentSessionId)
      // Deleting a middle branch frees its slot; the next branch must not reuse
      // a number that is still visible on a sibling. Take the highest one used.
      ordinal = nextBranchOrdinal(siblings)
      const title = branchTitle(titleOfEvents(events), ordinal)
      const record = {
        childId: sessionId,
        parentId: parentSessionId,
        atSeq: boundarySeq,
        turn: point.turn,
        snippet: point.snippet,
        title,
        ordinal,
        createdAt: Date.now(),
      }
      known.pending.push(record)
      await saveTreeRegistry(known)
      return record
    })
  } catch (error) {
    return failure(503, `tree-registry-failed:${errorMessage(error)}`)
  }

  let handle
  try {
    handle = await ctx.agents.create({
      sessionId,
      ...(route === undefined ? {} : { agentOptions: route }),
      meta: {
        cwd,
        parentSession: parentSessionId,
        isSeeded: true,
        agentPreset: presetId,
      },
      inheritedEventCount,
      seed,
      setup: async (agentCtx, agent) => {
        const inheritedPreset = presets.composeFrom(agentCtx, parent.ctx)
        if (inheritedPreset !== presetId) throw new Error('parent preset revision unavailable')
        installModelRoute(ctx, agentCtx, agent, route)
        if (route !== undefined) {
          agent.session.append('model/selection', {
            provider: route.provider,
            model: route.model,
            ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
          })
        }
        agent.session.append('session/title', {
          title: edge.title,
          messageSeqs: [],
          source: { kind: 'user' },
        })
        // A second, self-describing copy of the edge lives in the branch's own
        // log. A lost registry can then be rebuilt from the sessions it names.
        try {
          const { appendPluginRecord } = await import('@deepseek-ai/dsh-session')
          if (typeof appendPluginRecord === 'function') {
            appendPluginRecord(agent.session, EDGE_RECORD_TYPE, {
              childId: sessionId,
              parentId: parentSessionId,
              atSeq: boundarySeq,
              turn: point.turn,
              snippet: point.snippet,
              title: edge.title,
              ordinal,
              createdAt: edge.createdAt,
            })
          }
        } catch {
          /* the registry remains authoritative when a record cannot be written */
        }
      },
    })
  } catch (error) {
    // A throwing create may still have written a session. Keep the pending
    // edge when evidence exists; otherwise remove the empty registration.
    let exists = ctx.sessions.get(sessionId) !== undefined
    if (!exists) {
      const persistence = ctx.get('sessionPersistence')
      if (persistence === undefined) {
        exists = true
      } else {
        try {
          exists = (await persistence.stat(sessionId)) !== undefined
        } catch {
          exists = true
        }
      }
    }
    if (!exists) {
      await withTree(async (known) => {
        known.pending = known.pending.filter((entry) => entry.childId !== sessionId)
        await saveTreeRegistry(known)
      }).catch(() => {})
    }
    return new Response(JSON.stringify({
      error: `open-failed:${errorMessage(error)}`,
      sessionId,
      pending: exists,
      cleanupAvailable: false,
    }), {
      status: 409,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  handles.set(sessionId, handle)
  // The Session now exists in this Host: a read that samples liveness before
  // the backend materializes it must not mistake the fresh edge for a dead one.
  markLiveSession(sessionId)
  let verified = false
  try {
    const live = handle?.agent?.session?.header
    if (live?.id !== sessionId || live?.cwd !== cwd || live?.parentSession !== parentSessionId) {
      throw new Error('session-binding-mismatch')
    }
    verified = true
  } catch {
    verified = false
  }

  let pending = false
  try {
    await withTree(async (known) => {
      const index = known.pending.findIndex((entry) => entry.childId === sessionId)
      if (index < 0) throw new Error('pending-edge-missing')
      const [record] = known.pending.splice(index, 1)
      known.edges.push(record)
      await saveTreeRegistry(known)
    })
  } catch {
    pending = true
  }

  if (verified) {
    try {
      const registryService = ctx.get('workspaceRegistry')
      const workspace = registryService?.list?.().find((candidate) => Array.isArray(candidate.sessionIds)
        && candidate.sessionIds.includes(parentSessionId))
      if (workspace !== undefined && typeof workspace.attachSession === 'function') {
        await workspace.attachSession(sessionId)
      }
    } catch {
      /* an unattached session still works; the user can move it later */
    }
  }

  if (!verified) {
    return new Response(JSON.stringify({
      error: 'creation-unverified:session binding mismatch',
      sessionId,
      cleanupAvailable: false,
      pending,
    }), {
      status: 409,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
  return json({
    sessionId,
    parentSessionId,
    atSeq: boundarySeq,
    inheritedEventCount,
    pending,
    edge: {
      childId: sessionId,
      parentId: parentSessionId,
      atSeq: boundarySeq,
      turn: point.turn,
      snippet: point.snippet,
      title: edge.title,
    },
  })
}

/**
 * Resolve a requested boundary to the enclosing completed Turn end.
 * The TurnTail client slot reports the closing Assistant message seq; older
 * clients may send that directly. Accept it only when a matching turn/end
 * follows in the same Turn, and always fork at that Turn end.
 */
export function resolveBranchBoundary(events, atSeq) {
  if (!Array.isArray(events) || !Number.isSafeInteger(atSeq) || atSeq < 0 || atSeq >= events.length) {
    return -1
  }
  const event = events[atSeq]
  if (event?.type === 'turn/end') return atSeq
  if (event?.type !== 'assistant/message') return -1
  const turn = event.data?.turn
  if (!Number.isSafeInteger(turn)) return -1
  for (let index = atSeq + 1; index < events.length; index++) {
    const candidate = events[index]
    if (candidate?.type === 'turn/end' && candidate.data?.turn === turn) return index
    if (candidate?.type === 'turn/start' && candidate.data?.turn !== turn) return -1
  }
  return -1
}

/** Count one-based turn number and capture the last prompt at the boundary. */
export function branchPoint(events, atSeq) {
  let turn = 0
  let prompt = ''
  let answer = ''
  for (let index = 0; index <= atSeq; index++) {
    const event = events[index]
    if (event?.type === 'turn/start') {
      const value = Number(event.data?.turn)
      turn = Number.isSafeInteger(value) && value > 0 ? value : turn + 1
    } else if (event?.type === 'user/message') {
      const text = textOf(event.data?.content)
      if (text !== '') prompt = text
    } else if (event?.type === 'assistant/message') {
      const text = textOf(event.data?.message?.content)
      if (text !== '') answer = text
    }
  }
  return {
    turn: Math.max(1, turn),
    snippet: clip((prompt || answer).replace(/\s+/g, ' ').trim(), 72),
  }
}

/** Give a branch a distinct, human-readable starting title. */
export function branchTitle(parentTitle, ordinal) {
  const base = clip(parentTitle.trim() || '对话', 56)
  return clip(ordinal <= 1 ? `${base} · 分支` : `${base} · 分支 ${ordinal}`, MAX_TITLE_CHARS)
}

/**
 * Next unused branch ordinal among one parent's children.
 * Counting children reuses the slot of a deleted middle branch, so a live
 * 「分支 3」 can collide with a new one; legacy records store the number only
 * in the title, hence the fallback parse.
 * @param siblings - edges already recorded under the same parent.
 * @returns the smallest ordinal above every used one.
 */
export function nextBranchOrdinal(siblings) {
  let highest = 0
  for (const sibling of siblings ?? []) {
    const stored = sibling?.ordinal
    if (Number.isSafeInteger(stored) && stored > highest) highest = stored
    const match = /·\s*分支(?:\s+(\d+))?\s*$/.exec(typeof sibling?.title === 'string' ? sibling.title : '')
    if (match === null) continue
    const parsed = match[1] === undefined ? 1 : Number.parseInt(match[1], 10)
    if (Number.isSafeInteger(parsed) && parsed > highest) highest = parsed
  }
  return highest + 1
}
