import { handles, originalService } from './handles.js'
import { errorMessage, failure, json, readJson, sameSiteRequest } from './base.js'
import { clip } from './transcript.js'
import { saveTreeRegistry, treeRegistry, withTree } from './registry.js'
import { liveSessionIds } from './liveness.js'
import { hasDeadNodes, pruneDeadNodes } from './reconcile.js'
import { augmentLiveStats, augmentNodeStats, statsNodeSelection } from './stats.js'
import { externalEdgeOf, parentOfSession, promotePending, recoverChain } from './session.js'

/** Workspace sessions one forest response may name; the rest are reported as truncated. */
export const MAX_FOREST_SESSIONS = 2000

// --------------------------------------------------------------------- tree

/** Every child id the registry already names, durable, pending or detached. */
export function registeredChildren(known) {
  return new Set([
    ...known.edges.map((edge) => edge.childId),
    ...known.pending.map((edge) => edge.childId),
    ...(known.roots ?? []),
  ])
}

/**
 * Repair the whole registry once, outside a page read.
 *
 * Called at Host start so the first painted tree is already clean.
 *
 * @param ctx - plugin context.
 * @returns whether the registry changed.
 */
export async function repairTreeRegistry(ctx) {
  const live = await liveSessionIds(ctx)
  if (live === undefined) return false
  let changed = false
  try {
    await withTree(async (known) => {
      if (!hasDeadNodes(known, live)) return
      const outcome = pruneDeadNodes(known, live)
      if (!outcome.changed) return
      await saveTreeRegistry(known)
      changed = true
    })
  } catch {
    // A locked or unreadable registry repairs on the next read instead.
    return false
  }
  return changed
}

/**
 * Read the registry without the write lock when nothing needs repairing.
 *
 * Promotion, chain recovery and dead-edge repair all write, so they keep the
 * cross-process lock. A plain read of a settled workspace does not: it builds
 * straight from an atomic snapshot, leaving the lock to branch creation,
 * deletion and repair.
 *
 * @param ctx - plugin context.
 * @param ids - Session ids the caller is about to resolve.
 * @param build - pure projection over the registry snapshot.
 * @returns the projection's value.
 */
export async function withTreeForRead(ctx, ids, build) {
  const known = await treeRegistry()
  // A registry with no edges cannot name anything that is gone, so a Workspace
  // of unrelated conversations never pays for a liveness sample. That is the
  // common case: the composer dock reads one tree on every conversation.
  const tracked = known.edges.length > 0 || (known.roots ?? []).length > 0
  const live = tracked ? await liveSessionIds(ctx) : undefined
  const stale = live !== undefined && hasDeadNodes(known, live)
  const pending = known.pending.length > 0
  const missing = ids.filter((id) => !registeredChildren(known).has(id))
  if (!stale && !pending && missing.length === 0) return build(known)

  // A missing id is only repairable when its header names a parent; that check
  // is a header read, so it is cheaper than locking every ordinary read.
  const parents = new Map()
  for (const id of missing) {
    const parentId = await parentOfSession(ctx, id).catch(() => undefined)
    if (parentId !== undefined) parents.set(id, parentId)
  }
  if (!stale && !pending && parents.size === 0) return build(known)

  return await withTree(async (fresh) => {
    if (live !== undefined && hasDeadNodes(fresh, live)) {
      const outcome = pruneDeadNodes(fresh, live)
      if (outcome.changed) await saveTreeRegistry(fresh)
    }
    await promotePending(ctx, fresh).catch(() => {})
    const recoverable = [...parents.keys()].filter((id) => !registeredChildren(fresh).has(id))
    const recovered = await recoverChains(ctx, fresh, recoverable)
    if (recovered.length > 0) {
      const knownChildren = registeredChildren(fresh)
      for (const edge of recovered) {
        if (knownChildren.has(edge.childId)) continue
        knownChildren.add(edge.childId)
        fresh.edges.push(edge)
      }
      await saveTreeRegistry(fresh)
    }
    // Whatever the registry still cannot explain may be a fork DSH created
    // itself: readable, but never persisted, so it can never be deleted here.
    const adopted = []
    for (const [id, parentId] of parents) {
      if (registeredChildren(fresh).has(id)) continue
      const edge = await externalEdgeOf(ctx, id, parentId).catch(() => undefined)
      if (edge !== undefined) adopted.push(edge)
    }
    if (adopted.length === 0) return build(fresh)
    return build({ edges: [...fresh.edges, ...adopted], pending: fresh.pending, roots: fresh.roots ?? [] })
  })
}

/**
 * Resolve the connected tree around one session.
 * The current session may be any node; its parent chain names the root.
 * @param known - registry snapshot.
 * @param sessionId - current session id.
 * @returns payload with root, current, and ordered nodes.
 */
export function buildTree(known, sessionId) {
  const rootIds = new Set(known.roots ?? [])
  const notes = known.notes ?? {}
  const all = [
    ...known.edges.map((edge) => ({ ...edge, pending: false })),
    ...known.pending.map((edge) => ({ ...edge, pending: true })),
  ]
  const byChild = new Map(all.map((edge) => [edge.childId, edge]))
  let rootId = sessionId
  const seen = new Set([sessionId])
  for (;;) {
    // A detached root has lost its parent chain: the walk stops here instead of
    // climbing into a Session that no longer exists.
    if (rootIds.has(rootId)) break
    const edge = byChild.get(rootId)
    if (edge === undefined) break
    if (seen.has(edge.parentId)) throw new Error('conversation-tree-cycle')
    seen.add(edge.parentId)
    rootId = edge.parentId
  }

  const children = new Map()
  for (const edge of all) {
    const list = children.get(edge.parentId)
    if (list === undefined) children.set(edge.parentId, [edge])
    else list.push(edge)
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt || a.childId.localeCompare(b.childId))
  }

  const nodes = [{
    id: rootId,
    parentId: null,
    atSeq: null,
    turn: null,
    snippet: '',
    title: '',
    createdAt: null,
    pending: false,
    detached: rootIds.has(rootId),
    note: typeof notes[rootId] === 'string' ? notes[rootId] : '',
    depth: 0,
    childCount: 0,
  }]
  const queue = [rootId]
  const visited = new Set([rootId])
  while (queue.length > 0) {
    const parentId = queue.shift()
    const list = children.get(parentId) ?? []
    const root = nodes.find((node) => node.id === parentId)
    if (root !== undefined) root.childCount = list.length
    for (const edge of list) {
      if (visited.has(edge.childId)) throw new Error('conversation-tree-cycle')
      visited.add(edge.childId)
      const parent = nodes.find((node) => node.id === parentId)
      nodes.push({
        id: edge.childId,
        parentId: edge.parentId,
        atSeq: edge.atSeq,
        turn: edge.turn,
        snippet: edge.snippet,
        title: edge.title,
        createdAt: edge.createdAt,
        pending: edge.pending,
        external: edge.external === true,
        relinked: edge.relinked === true,
        note: typeof notes[edge.childId] === 'string' ? notes[edge.childId] : '',
        depth: (parent?.depth ?? 0) + 1,
        childCount: 0,
      })
      queue.push(edge.childId)
    }
  }
  return {
    version: 1,
    rootId,
    currentId: sessionId,
    branchCount: nodes.length - 1,
    nodes,
  }
}

/** GET /api/conversation-tree/tree?sessionId=... */
export async function readTree(ctx, request) {
  const url = new URL(request.url)
  const sessionId = url.searchParams.get('sessionId')?.trim() ?? ''
  const includeStats = url.searchParams.get('stats') === '1'
  if (sessionId === '') return failure(400, 'missing-fields')
  try {
    const payload = await withTreeForRead(ctx, [sessionId], (known) => buildTree(known, sessionId))
    pruneDeadHandles(ctx)
    if (includeStats) {
      const outcome = await augmentLiveStats(ctx, payload, request.signal)
      if (outcome?.truncated === true) payload.statsTruncated = true
    }
    return json(payload)
  } catch (error) {
    return failure(409, `tree-failed:${errorMessage(error)}`)
  }
}

/**
 * POST /api/conversation-tree/forest
 *
 * Resolve every connected tree that touches one Workspace's Sessions. The
 * caller names the conversation the page shows; `ctx.workspaceRegistry` owns
 * the membership, so the Host resolves the rest itself. The response carries
 * one component per root, including the branches and ancestors those Sessions
 * belong to. Sessions that never branched come back as single-node
 * components, which is what makes the page a Workspace view instead of a
 * per-conversation one.
 */
export async function readForest(ctx, request) {
  if (!sameSiteRequest(request)) return failure(403, 'cross-origin')
  const body = await readJson(request)
  if (body === undefined) return failure(400, 'invalid-json')
  const currentId = typeof body.sessionId === 'string' ? body.sessionId : ''
  if (currentId.length > 256) return failure(400, 'invalid-session-id')
  // Older clients still name their Workspace's Sessions; the host treats that
  // list as a hint and resolves the authoritative membership itself.
  const hinted = Array.isArray(body.sessionIds) ? body.sessionIds : []
  for (const value of hinted) {
    if (typeof value !== 'string' || value === '' || value.length > 256) {
      return failure(400, 'invalid-session-id')
    }
  }
  if (currentId === '' && hinted.length === 0) return failure(400, 'missing-fields')
  // A conversation deleted outside this plugin is not a Workspace member any
  // more, but a stale page can still name it; resolving it as a member would
  // draw one more phantom component. A registry with no edges has nothing to
  // prune, so a Workspace of unrelated conversations skips the scan entirely.
  const known = await treeRegistry()
  const tracked = known.edges.length > 0 || (known.roots ?? []).length > 0
  const live = tracked ? await liveSessionIds(ctx) : undefined
  const members = forestMembers(ctx, currentId, hinted, live)
  const total = members.length
  const sessionIds = members.slice(0, MAX_FOREST_SESSIONS)
  const includeStats = body.stats === true
  try {
    const payload = await withTreeForRead(ctx, sessionIds, (registry) => buildForest(registry, sessionIds))
    payload.memberCount = sessionIds.length
    payload.total = total
    payload.truncated = total > sessionIds.length
    pruneDeadHandles(ctx)
    if (includeStats) {
      // The conversation on screen is the one the user is looking at; its tree
      // is read completely, and the budget stops the rest of a large Workspace
      // from turning the first paint into minutes of cold-log parsing.
      const selection = statsNodeSelection(payload.components, currentId)
      const outcome = await augmentNodeStats(ctx, selection.nodes, request.signal)
      payload.statsTruncated = selection.truncated || outcome.truncated
    }
    return json(payload)
  } catch (error) {
    return failure(409, `tree-failed:${errorMessage(error)}`)
  }
}

/**
 * The Sessions one Workspace read covers.
 *
 * `ctx.workspaceRegistry` owns workspace membership and its canonical-cwd
 * header index, so the host resolves it here instead of trusting a list the
 * client assembled. A conversation outside every workspace scopes to itself.
 * The current Session is pinned first so a cap can never drop it.
 *
 * @param ctx - plugin context.
 * @param currentId - conversation the page is showing, if the caller named one.
 * @param hinted - ids an older client named; unioned in for compatibility.
 * @param live - ids that still exist, or `undefined` when unknown.
 * @returns ordered, de-duplicated Session ids that exist.
 */
export function forestMembers(ctx, currentId, hinted, live) {
  const ordered = []
  const seen = new Set()
  const push = (id) => {
    if (typeof id !== 'string' || id === '' || seen.has(id)) return
    // A deleted Session cannot be a member: keeping it would give the page one
    // component whose only node can never be opened.
    if (live !== undefined && !live.has(id)) return
    seen.add(id)
    ordered.push(id)
  }
  if (currentId !== '') push(currentId)
  let scope
  try {
    const registry = ctx.get('workspaceRegistry')
    const workspaces = registry !== undefined && typeof registry.list === 'function' ? registry.list() : []
    for (const workspace of Array.isArray(workspaces) ? workspaces : []) {
      const ids = workspace?.sessionIds
      if (currentId !== '' && Array.isArray(ids) && ids.includes(currentId)) {
        scope = ids
        break
      }
    }
  } catch {
    scope = undefined
  }
  if (scope !== undefined) for (const id of scope) push(id)
  for (const id of hinted) push(id)
  return ordered
}

/**
 * Build one forest around the requested Sessions.
 *
 * A component is the complete connected tree of its root, so a branch fetched
 * through its own id still comes back with the siblings and descendants that
 * make the lineage readable. The requested ids only decide which components
 * exist; they do not clip their contents.
 *
 * @param known - registry snapshot with edges and pending edges.
 * @param sessionIds - Session ids belonging to one Workspace.
 * @returns ordered components, conversation and branch counts.
 */
export function buildForest(known, sessionIds) {
  const all = [
    ...known.edges.map((edge) => ({ ...edge, pending: false })),
    ...known.pending.map((edge) => ({ ...edge, pending: true })),
  ]
  const byChild = new Map(all.map((edge) => [edge.childId, edge]))
  const children = new Map()
  for (const edge of all) {
    const list = children.get(edge.parentId)
    if (list === undefined) children.set(edge.parentId, [edge])
    else list.push(edge)
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt || a.childId.localeCompare(b.childId))
  }

  const detachedRoots = new Set(known.roots ?? [])
  const rootOf = (start) => {
    let current = start
    const seen = new Set([start])
    for (;;) {
      // A detached root ends the walk: its parent is gone on purpose.
      if (detachedRoots.has(current)) return current
      const edge = byChild.get(current)
      if (edge === undefined) return current
      if (seen.has(edge.parentId)) throw new Error('conversation-tree-cycle')
      seen.add(edge.parentId)
      current = edge.parentId
    }
  }

  const roots = new Set()
  for (const id of sessionIds) roots.add(rootOf(id))
  const notes = known.notes ?? {}
  const components = [...roots]
    .sort((a, b) => a.localeCompare(b))
    .map((rootId) => ({ rootId, nodes: componentNodes(rootId, children, detachedRoots, notes) }))
  const branchCount = components.reduce((total, component) => total + component.nodes.length - 1, 0)
  return {
    version: 2,
    components,
    conversationCount: components.length,
    branchCount,
  }
}

/** One root and every edge below it, breadth-first, with the accepted cycle guard. */
export function componentNodes(rootId, children, detachedRoots = new Set(), notes = {}) {
  const root = {
    id: rootId,
    parentId: null,
    atSeq: null,
    turn: null,
    snippet: '',
    title: '',
    createdAt: null,
    pending: false,
    detached: detachedRoots.has(rootId),
    note: typeof notes[rootId] === 'string' ? notes[rootId] : '',
    depth: 0,
    childCount: 0,
  }
  const nodes = [root]
  const byId = new Map([[rootId, root]])
  const queue = [rootId]
  const visited = new Set([rootId])
  while (queue.length > 0) {
    const parentId = queue.shift()
    const list = children.get(parentId) ?? []
    const parent = byId.get(parentId)
    parent.childCount = list.length
    for (const edge of list) {
      if (visited.has(edge.childId)) throw new Error('conversation-tree-cycle')
      visited.add(edge.childId)
      const node = {
        id: edge.childId,
        parentId: edge.parentId,
        atSeq: edge.atSeq,
        turn: edge.turn,
        snippet: edge.snippet,
        title: edge.title,
        createdAt: edge.createdAt,
        pending: edge.pending,
        external: edge.external === true,
        relinked: edge.relinked === true,
        note: typeof notes[edge.childId] === 'string' ? notes[edge.childId] : '',
        depth: parent.depth + 1,
        childCount: 0,
      }
      nodes.push(node)
      byId.set(edge.childId, node)
      queue.push(edge.childId)
    }
  }
  return nodes
}

/**
 * Recover the ancestor chains of requested Sessions the registry has no edge
 * for, with bounded parallelism. A Workspace read must not become a long
 * serial log crawl just because one registry entry was lost.
 */
export async function recoverChains(ctx, known, ids) {
  if (ids.length === 0) return []
  const found = new Map()
  let cursor = 0
  const worker = async () => {
    for (;;) {
      const id = ids[cursor]
      cursor += 1
      if (id === undefined) return
      const chain = await recoverChain(ctx, known, id).catch(() => [])
      for (const edge of chain) {
        if (!found.has(edge.childId)) found.set(edge.childId, edge)
      }
    }
  }
  const width = Math.min(4, ids.length)
  await Promise.all(Array.from({ length: width }, worker))
  return [...found.values()]
}

/** Forget handles whose branch is no longer the live Agent for that id. */
export function pruneDeadHandles(ctx) {
  for (const [sessionId, handle] of handles) {
    let live
    try {
      live = ctx.agents.get(sessionId)
    } catch {
      live = undefined
    }
    if (live === undefined || originalService(live) !== originalService(handle?.agent)) {
      handles.delete(sessionId)
    }
  }
}
