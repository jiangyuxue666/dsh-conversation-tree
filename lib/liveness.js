/**
 * Which Sessions still exist on this Host.
 *
 * The tree registry outlives the Sessions it names: a conversation can be
 * deleted from the sidebar, by another plugin, or from disk, and nothing in
 * that path knows about `conversation-tree.json`. Every read therefore needs a
 * cheap, authoritative liveness sample, so a dead edge can be repaired instead
 * of being drawn as a node nothing can open.
 *
 * `SessionPersistence.list` is that authority — it names every stored Session
 * regardless of Workspace — but it is a directory walk, so one sample is reused
 * for {@link LIVE_TTL_MS}. Unknown is a first-class answer: without a backend
 * that can list, nothing may be pruned.
 *
 * @module dsh-conversation-tree/lib/liveness
 */

/** How long one live-set sample is reused before it is read again. */
export const LIVE_TTL_MS = 3_000

/**
 * An edge younger than this is never treated as dead.
 *
 * `createBranch` writes the durable edge before the Session handle exists, and
 * a backend is allowed to materialize a stored Session lazily. Within this
 * window the absence of the id proves nothing.
 */
export const EDGE_GRACE_MS = 10_000

/** Process-wide sample: a Cordis reload must not lose a just-created Session. */
const STORE = Symbol.for('dsh-conversation-tree.live-sessions')
const sample = globalThis[STORE] ?? (globalThis[STORE] = {
  at: 0,
  identity: undefined,
  root: undefined,
  ids: null,
})

/** Test hook: forget the sample so the next read goes to the backend. */
export function resetLiveSessions() {
  sample.at = 0
  sample.identity = undefined
  sample.root = undefined
  sample.ids = null
}

/** The backend root that owns one sample, or the empty string. */
function rootOf(persistence) {
  return typeof persistence?.root === 'string' ? persistence.root : ''
}

/** Whether a cached sample belongs to the backend instance asking. */
function sampleMatches(persistence) {
  if (sample.ids === null) return false
  // `identity` is a process-local symbol: equal identity means the same live
  // service instance, which is the only thing a cached sample is valid for.
  return sample.identity === persistence?.identity && sample.root === rootOf(persistence)
}

/** Add one id this Host just created, so a following read cannot prune it. */
export function markLiveSession(sessionId) {
  if (sample.ids === null || typeof sessionId !== 'string' || sessionId === '') return
  sample.ids.add(sessionId)
}

/** Forget the sample; the next read observes the backend again. */
export function forgetLiveSessions() {
  resetLiveSessions()
}

/** Read a service without letting an absent dependency throw. */
function serviceOf(ctx, name) {
  try {
    return ctx.get(name)
  } catch {
    return undefined
  }
}

/**
 * Every Session id that currently exists.
 *
 * @param ctx - plugin context.
 * @returns the id set, or `undefined` when this Host cannot prove existence.
 */
export async function liveSessionIds(ctx) {
  const persistence = serviceOf(ctx, 'sessionPersistence')
  if (persistence === undefined || persistence === null || typeof persistence.list !== 'function') {
    return undefined
  }
  const now = Date.now()
  if (sampleMatches(persistence) && now - sample.at < LIVE_TTL_MS) return sample.ids
  let snapshots
  try {
    snapshots = await persistence.list()
  } catch {
    // A failed listing is not evidence of deletion; reuse the previous sample
    // when it belongs to this backend, and let the caller skip repair rather
    // than wipe a workspace's tree.
    return sampleMatches(persistence) ? sample.ids : undefined
  }
  const ids = new Set()
  for (const snapshot of snapshots ?? []) {
    const id = snapshot?.header?.id
    if (typeof id === 'string' && id !== '') ids.add(id)
  }
  try {
    for (const session of ctx.sessions.list()) {
      if (typeof session?.id === 'string' && session.id !== '') ids.add(session.id)
    }
  } catch {
    /* a live listing is a bonus; the persisted listing is authoritative */
  }
  sample.at = Date.now()
  sample.identity = persistence.identity
  sample.root = rootOf(persistence)
  sample.ids = ids
  return ids
}
