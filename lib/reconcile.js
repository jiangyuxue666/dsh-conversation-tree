import { EDGE_GRACE_MS } from './liveness.js'

/**
 * Repair a registry whose Sessions are partly gone.
 *
 * Deleting a conversation does not have to happen through this plugin: the
 * sidebar, another plugin, or a manual `rm` can remove a Session while its edge
 * survives. The tree must not draw that Session as a node — nothing can open
 * it, it has no title, usage or Workspace, and its children hang off a node
 * that will never come back.
 *
 * The repair keeps everything that still exists:
 *  - a dead child inside a live chain is removed, and its children are promoted
 *    to the nearest live ancestor (`relinked`), so no surviving branch is
 *    orphaned;
 *  - a dead chain with no live ancestor above it detaches its children, which
 *    become roots of their own tree (`roots`) instead of leaving a phantom;
 *  - `pending` edges are never touched: they describe a branch that is being
 *    created right now, not a deleted one.
 *
 * @module dsh-conversation-tree/lib/reconcile
 */

/** The nearest ancestor of one node that still exists, within a bounded walk. */
export function nearestLiveAncestor(parentId, childId, byChild, live) {
  let current = parentId
  const seen = new Set([childId])
  for (let depth = 0; depth < 64; depth += 1) {
    if (typeof current !== 'string' || current === '') return undefined
    if (seen.has(current)) return undefined
    seen.add(current)
    if (live.has(current)) return current
    const edge = byChild.get(current)
    if (edge === undefined) return undefined
    current = edge.parentId
  }
  return undefined
}

/** Whether an edge is too young for its missing Session to mean deletion. */
export function edgeIsRecent(edge, now = Date.now()) {
  return Number.isFinite(edge?.createdAt) && now - edge.createdAt < EDGE_GRACE_MS
}

/**
 * Whether the registry names anything that no longer exists.
 *
 * Runs on every read, so it must stay allocation-free on the common path: one
 * Set lookup per edge, no cloning, no writes.
 */
export function hasDeadNodes(known, live, now = Date.now()) {
  if (live === undefined) return false
  for (const edge of known.edges ?? []) {
    // A missing child is the obvious case; a missing parent is the one that
    // leaves a phantom root behind, because the projection walks up to it.
    if (!live.has(edge.childId) && !edgeIsRecent(edge, now)) return true
    if (!live.has(edge.parentId)) return true
  }
  for (const id of known.roots ?? []) {
    if (!live.has(id)) return true
  }
  return false
}

/**
 * Remove dead edges and promote the branches below them.
 *
 * @param known - registry snapshot, mutated in place.
 * @param live - ids that exist, or `undefined` when existence is unprovable.
 * @param now - clock for the creation grace window.
 * @returns what changed, so the caller can decide to persist.
 */
export function pruneDeadNodes(known, live, now = Date.now()) {
  const outcome = { changed: false, dropped: [], reparented: [], detached: [] }
  if (live === undefined) return outcome
  const edges = known.edges ?? []
  const byChild = new Map(edges.map((edge) => [edge.childId, edge]))
  const roots = new Set(known.roots ?? [])
  const kept = []
  let changed = false

  for (const edge of edges) {
    // A young edge proves nothing: its Session may still be materializing.
    if (!live.has(edge.childId) && !edgeIsRecent(edge, now)) {
      outcome.dropped.push(edge.childId)
      changed = true
      continue
    }
    if (!live.has(edge.parentId)) {
      const ancestor = nearestLiveAncestor(edge.parentId, edge.childId, byChild, live)
      if (ancestor === undefined) {
        // The whole chain above is gone. This conversation is no longer a
        // branch of anything, but it is still a conversation: it becomes a
        // root instead of keeping a parent that cannot be drawn.
        outcome.dropped.push(edge.childId)
        outcome.detached.push(edge.childId)
        roots.add(edge.childId)
        changed = true
        continue
      }
      outcome.reparented.push({ childId: edge.childId, from: edge.parentId, to: ancestor })
      // The branch Session's immutable header still names the deleted parent;
      // keep that link so deletion can verify what this edge was created from.
      if (edge.headerParentId === undefined) edge.headerParentId = edge.parentId
      edge.parentId = ancestor
      edge.relinked = true
      changed = true
      kept.push(edge)
      continue
    }
    kept.push(edge)
  }

  for (const id of [...roots]) {
    if (!live.has(id)) {
      roots.delete(id)
      changed = true
    }
  }

  if (!changed) return outcome
  known.edges = kept
  known.roots = [...roots]
  // A note is the user's name for a node; a node whose Session is gone cannot
  // come back, so the name goes with it. Detached nodes keep theirs.
  const detached = new Set(outcome.detached)
  const gone = outcome.dropped.filter((id) => !detached.has(id))
  if (gone.length > 0 && known.notes !== undefined) {
    const notes = { ...known.notes }
    for (const id of gone) delete notes[id]
    known.notes = notes
  }
  outcome.changed = true
  return outcome
}
