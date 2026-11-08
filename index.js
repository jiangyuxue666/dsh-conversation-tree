import { handles } from './lib/handles.js'
import { forgetLiveSessions, liveSessionIds, resetLiveSessions } from './lib/liveness.js'
import { sameSiteRequest } from './lib/base.js'
import { titleOfEvents } from './lib/transcript.js'
import { selectionOfEvents } from './lib/models.js'
import { validEdge } from './lib/registry.js'
import { STATS_CACHE, augmentNodeStats, loadStatsCache, ownCounts, ownUsage, persistStats, pruneStatsCache, resetStatsCache, scheduleStatsPersist, statsNodeSelection } from './lib/stats.js'
import { recoverChain } from './lib/session.js'
import { buildForest, buildTree, forestMembers, pruneDeadHandles, readForest, readTree, registeredChildren, repairTreeRegistry, withTreeForRead } from './lib/tree.js'
import { nearestLiveAncestor, pruneDeadNodes } from './lib/reconcile.js'
import { branchPoint, branchTitle, autoNote, createBranch, latestBranchBoundary, nextBranchOrdinal, resolveBranchBoundary } from './lib/branch.js'
import { redactSecrets, summarize } from './lib/summarize.js'
import { saveNodeNote } from './lib/notes.js'
import { summarizeTree, treePrompt, digestText, TREE_SYSTEM } from './lib/tree-summary.js'
import { compareSessions, countToolCalls, lastText, openingPrompts, peekSession, readSide } from './lib/compare.js'
import { cleanupWorkspaceSession, assertDeleteHeader, deleteSubtree, reconcileWorkspaceRegistry, retireUnownedBranch, sideProjectKey, sideSegment, subtreeEdges } from './lib/delete.js'

/**
 * dsh-conversation-tree — host half.
 *
 * A tree branch is an ordinary DSH session forked from one completed turn of
 * its parent. The parent link is written into the immutable session header and
 * into a small durable edge registry, because the native ordinary fork does
 * not record its source. Branch sessions are created and owned by this plugin,
 * so a subtree can be stopped and deleted without touching unrelated sessions.
 *
 * Authenticated routes under Connection's fence:
 *  - branch: create a child session at one completed-turn boundary;
 *  - tree: resolve the connected branch tree around one session, optionally
 *    with each Session's own token/Turn totals after its inherited prefix;
 *  - summarize: create a handoff from the source's current model context;
 *  - delete: stop and remove one branch subtree after explicit confirmation.
 *
 * @module dsh-conversation-tree
 */

/** Route: create a branch at one completed turn. */
const BRANCH_ROUTE = '/api/conversation-tree/branch'
/** Route: resolve the branch tree around one session. */
const TREE_ROUTE = '/api/conversation-tree/tree'
/** Route: resolve every connected tree that touches one workspace's sessions. */
const FOREST_ROUTE = '/api/conversation-tree/forest'
/** Route: compress one conversation for bring-back. */
const SUMMARY_ROUTE = '/api/conversation-tree/summarize'
/** Route: delete one branch subtree. */
const DELETE_ROUTE = '/api/conversation-tree/delete'
/** Route: name one tree node. */
const NOTE_ROUTE = '/api/conversation-tree/note'
/** Route: compare two or more conversations. */
const COMPARE_ROUTE = '/api/conversation-tree/compare'
/** Route: what one conversation last said. */
const PEEK_ROUTE = '/api/conversation-tree/peek'
/** Route: one page of text about a whole tree. */
const TREE_SUMMARY_ROUTE = '/api/conversation-tree/tree-summary'

export const inject = ['llm', 'sessions', 'connection', 'agents', 'sessionProjections']

/**
 * Serialize complete branch mutations in this host.
 *
 * The registry lock protects one write, but a deletion must not interleave
 * with a creation that is still between "pending edge written" and "session
 * created": the delete would drop the registration of a branch that then
 * exists, or attach a child to a parent it is about to remove.
 */
let mutationQueue = Promise.resolve()

/** Run one complete mutation after every earlier one settled. */
function serializeMutation(operation) {
  const result = mutationQueue.then(operation, operation)
  mutationQueue = result.then(() => undefined, () => undefined)
  return result
}

/**
 * Register the five authenticated routes.
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: BRANCH_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => serializeMutation(() => createBranch(ctx, request)),
    }),
    'conversation-tree: branch',
  )
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: TREE_ROUTE,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: (request) => readTree(ctx, request),
    }),
    'conversation-tree: tree',
  )
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: FOREST_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => readForest(ctx, request),
    }),
    'conversation-tree: forest',
  )
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: SUMMARY_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => summarize(ctx, request),
    }),
    'conversation-tree: summarize',
  )
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: DELETE_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => serializeMutation(() => deleteSubtree(ctx, request)),
    }),
    'conversation-tree: delete',
  )
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: NOTE_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => serializeMutation(() => saveNodeNote(ctx, request)),
    }),
    'conversation-tree: note',
  )
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: COMPARE_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => compareSessions(ctx, request),
    }),
    'conversation-tree: compare',
  )
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: PEEK_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => peekSession(ctx, request),
    }),
    'conversation-tree: peek',
  )
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: TREE_SUMMARY_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => summarizeTree(ctx, request),
    }),
    'conversation-tree: tree-summary',
  )
  // Repair ghost workspace/archive entries left by earlier deletions. This is
  // intentionally fire-and-forget: a storage fault must not stop the routes
  // from registering.
  void reconcileWorkspaceRegistry(ctx).catch(() => {})
  // The tree registry outlives the Sessions it names. Deleting one from the
  // sidebar (or any other plugin) never touches it, so the Host repairs the
  // edges at start instead of waiting for a page to draw the phantom.
  void repairTreeRegistry(ctx).catch(() => {})
  // A Session leaving the live registry is the cheapest available hint that it
  // may also be gone from disk. The next read then re-samples liveness.
  if (typeof ctx.on === 'function') {
    ctx.effect(() => ctx.on('api-session/removed', () => { forgetLiveSessions() }), 'conversation-tree: liveness')
  }
  // On unload, forget handles whose branch is no longer the live Agent; a
  // retained handle would otherwise pin an agent that nothing can dispose.
  ctx.effect(() => () => pruneDeadHandles(ctx), 'conversation-tree: handles')
}

/** Pure helpers used by the unit tests. */
export const __test = {
  buildTree,
  buildForest,
  forestMembers,
  registeredChildren,
  withTreeForRead,
  repairTreeRegistry,
  pruneDeadNodes,
  nearestLiveAncestor,
  liveSessionIds,
  resetLiveSessions,
  forgetLiveSessions,
  assertDeleteHeader,
  branchPoint,
  resolveBranchBoundary,
  latestBranchBoundary,
  branchTitle,
  nextBranchOrdinal,
  redactSecrets,
  selectionOfEvents,
  sameSiteRequest,
  recoverChain,
  subtreeEdges,
  titleOfEvents,
  validEdge,
  sideProjectKey,
  sideSegment,
  cleanupWorkspaceSession,
  reconcileWorkspaceRegistry,
  retireUnownedBranch,
  createBranch,
  readTree,
  readForest,
  ownUsage,
  ownCounts,
  augmentNodeStats,
  statsNodeSelection,
  saveNodeNote,
  summarizeTree,
  treePrompt,
  digestText,
  TREE_SYSTEM,
  compareSessions,
  peekSession,
  openingPrompts,
  autoNote,
  readSide,
  lastText,
  countToolCalls,
  loadStatsCache,
  persistStats,
  pruneStatsCache,
  scheduleStatsPersist,
  resetStatsCache,
  statsCache: STATS_CACHE,
}
