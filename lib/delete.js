import { createHash } from 'node:crypto'
import { lstat, open, readdir, rmdir, unlink } from 'node:fs/promises'
import { isAbsolute, join, parse, resolve } from 'node:path'
import { disposeFailures, handles, originalService } from './handles.js'
import { forgetLiveSessions } from './liveness.js'
import { errorMessage, failure, json, readJson, sameSiteRequest } from './base.js'
import { cloneRegistry, saveTreeRegistry, withTree } from './registry.js'

/**
 * Platforms whose session directory and write-lock semantics are verified.
 * macOS takes a POSIX `flock` on `session.lock`; Windows excludes writers with
 * a named kernel semaphore derived from the same path and creates no lock file.
 */
export const SUPPORTED_DELETE_PLATFORMS = new Set(['darwin', 'win32'])

// ------------------------------------------------------------------- delete

/** POST /api/conversation-tree/delete */
export async function deleteSubtree(ctx, request) {
  if (!sameSiteRequest(request)) return failure(403, 'cross-origin')
  const body = await readJson(request)
  if (body === undefined) return failure(400, 'invalid-json')
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  if (sessionId === '') return failure(400, 'missing-fields')
  if (!SUPPORTED_DELETE_PLATFORMS.has(process.platform)) {
    return failure(501, 'deletion-platform-unsupported')
  }

  let known
  try {
    known = await withTree(cloneRegistry)
  } catch (error) {
    return failure(503, `tree-registry-failed:${errorMessage(error)}`)
  }
  const all = [...known.edges, ...known.pending]
  const target = all.find((edge) => edge.childId === sessionId)
  if (target === undefined) return failure(403, 'cannot-delete-root')
  const subtree = subtreeEdges(all, sessionId)
  if (subtree.length === 0) return failure(409, 'not-a-tree-node')

  const persistence = ctx.get('sessionPersistence')
  try {
    assertJsonlBackend(persistence)
  } catch (error) {
    return failure(501, `deletion-unsupported:${errorMessage(error)}`)
  }

  // Preflight every target before disposing anything.
  const snapshots = new Map()
  try {
    for (const edge of subtree) {
      const handle = handles.get(edge.childId)
      const liveAgent = ctx.agents.get(edge.childId)
      if (handle !== undefined) {
        // Native archive can dispose the agent while this registry still holds
        // the one-shot handle. A stale handle must not block file cleanup.
        if (liveAgent === undefined && ctx.sessions.get(edge.childId) === undefined) {
          handles.delete(edge.childId)
          disposeFailures.delete(edge.childId)
        } else if (liveAgent !== undefined
          && originalService(liveAgent) !== originalService(handle.agent)) {
          // A page reload can resume the same branch through the native
          // controller, producing a different live Agent under the same id.
          // The old one-shot handle no longer owns it.
          handles.delete(edge.childId)
          disposeFailures.delete(edge.childId)
        }
      }
      if (liveAgent !== undefined) {
        // A branch reopened by the native UI (or surviving a plugin reload)
        // has no plugin-owned AgentHandle. Verify its durable binding now;
        // the deletion loop stops it through the Agent's scope.
        assertDeleteHeader(liveAgent.session?.header, edge, persistence)
      } else if (handle === undefined && ctx.sessions.get(edge.childId) !== undefined) {
        throw new Error(`session-live:${edge.childId}`)
      }
      const snapshot = await persistence.stat(edge.childId)
      if (snapshot !== undefined) {
        assertDeleteHeader(snapshot.header, edge, persistence)
        snapshots.set(edge.childId, snapshot)
      }
    }
  } catch (error) {
    return failure(409, `delete-preflight:${errorMessage(error)}`)
  }

  const deleted = []
  let failureMessageText = ''
  for (const edge of subtree) {
    try {
      if (disposeFailures.has(edge.childId)) {
        throw new Error(`dispose-failed:${errorMessage(disposeFailures.get(edge.childId))}`)
      }
      const handle = handles.get(edge.childId)
      if (handle !== undefined) {
        assertOwnedLive(ctx, edge.childId, handle)
        try {
          await handle.dispose()
        } catch (error) {
          handles.delete(edge.childId)
          disposeFailures.set(edge.childId, error)
          throw error
        }
        handles.delete(edge.childId)
        disposeFailures.delete(edge.childId)
      } else if (ctx.agents.get(edge.childId) !== undefined) {
        await retireUnownedBranch(ctx, edge.childId)
      }
      if (ctx.agents.get(edge.childId) !== undefined || ctx.sessions.get(edge.childId) !== undefined) {
        throw new Error(`session-live:${edge.childId}`)
      }
      const snapshot = snapshots.get(edge.childId)
      if (snapshot !== undefined) {
        await deleteColdSession(persistence, edge)
      }
      // The session files are gone, but the workspace registry still owns the
      // id. Detach it before publishing the deletion so the native sidebar
      // cannot keep a ghost row (or a stale archived/pinned entry) after the
      // tree says the conversation was deleted.
      await cleanupWorkspaceSession(ctx, edge.childId)
      deleted.push(edge.childId)
    } catch (error) {
      failureMessageText = errorMessage(error)
      break
    }
  }

  if (deleted.length > 0) {
    try {
      await withTree(async (current) => {
        const gone = new Set(deleted)
        // A child registered by another process after this preflight would
        // otherwise stay behind as an edge pointing at a removed parent.
        current.edges = current.edges.filter((edge) => !gone.has(edge.childId) && !gone.has(edge.parentId))
        current.pending = current.pending.filter((edge) => !gone.has(edge.childId) && !gone.has(edge.parentId))
        current.roots = (current.roots ?? []).filter((id) => !gone.has(id))
        await saveTreeRegistry(current)
      })
    } catch (error) {
      return failure(503, `registry-cleanup-failed:${errorMessage(error)}`)
    }
  }

  if (failureMessageText !== '') {
    return new Response(JSON.stringify({
      error: `delete-partial:${failureMessageText}`,
      deleted,
    }), {
      status: 409,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
  // The liveness sample still names what was just removed; the next page read
  // must observe the backend instead of trusting it.
  forgetLiveSessions()
  return json({ ok: true, deleted })
}

/** All edges in one child's subtree, children before parents. */
export function subtreeEdges(edges, childId) {
  const children = new Map()
  for (const edge of edges) {
    const list = children.get(edge.parentId)
    if (list === undefined) children.set(edge.parentId, [edge])
    else list.push(edge)
  }
  const ordered = []
  const visit = (id, seen) => {
    if (seen.has(id)) throw new Error('conversation-tree-cycle')
    seen.add(id)
    for (const child of children.get(id) ?? []) visit(child.childId, seen)
    const edge = edges.find((candidate) => candidate.childId === id)
    if (edge !== undefined) ordered.push(edge)
  }
  visit(childId, new Set())
  return ordered
}

/**
 * Drop one deleted session from every workspace accounting set.
 *
 * File deletion alone leaves `workspace.json` holding the id. The native
 * workspace/session surfaces then have to rediscover that the id is gone,
 * which is exactly the window where a deleted branch reappears as a ghost.
 * Detach is idempotent, so every workspace is tried without first proving
 * membership; archive/pin sets are registry-global.
 *
 * @param ctx - plugin context.
 * @param sessionId - session whose files were already removed.
 */
export async function cleanupWorkspaceSession(ctx, sessionId) {
  let registry
  try {
    registry = ctx.get('workspaceRegistry')
  } catch {
    return
  }
  if (registry === undefined || registry === null) return
  const failures = []
  const run = async (label, operation) => {
    if (typeof operation !== 'function') return
    try {
      await operation()
    } catch (error) {
      failures.push(`${label}:${errorMessage(error)}`)
    }
  }
  await run('unarchive', () => registry.unarchiveSession?.(sessionId))
  await run('unpin', () => registry.unpinSession?.(sessionId))
  let workspaces = []
  try {
    workspaces = typeof registry.list === 'function' ? registry.list() : []
  } catch (error) {
    failures.push(`list:${errorMessage(error)}`)
  }
  for (const workspace of Array.isArray(workspaces) ? workspaces : []) {
    await run('detach', () => workspace?.detachSession?.(sessionId))
  }
  if (failures.length > 0) throw new Error(`workspace-cleanup-failed:${failures.join(';')}`)
}

/**
 * Remove workspace/archive/pin ids whose session no longer exists.
 *
 * The explicit cleanup above covers ids deleted by this version. Older
 * deletions could leave entries in `workspace.json`; this one-time pass makes
 * the plugin's own deletions retroactive without touching a valid live or
 * cold session. If the persistence listing fails, nothing is pruned.
 *
 * @param ctx - plugin context.
 */
export async function reconcileWorkspaceRegistry(ctx) {
  let registry
  let persistence
  try {
    registry = ctx.get('workspaceRegistry')
    persistence = ctx.get('sessionPersistence')
  } catch {
    return
  }
  if (registry === undefined || persistence === undefined || typeof persistence.list !== 'function') return
  const snapshots = await persistence.list()
  const known = new Set()
  for (const snapshot of snapshots) {
    const id = snapshot?.header?.id
    if (typeof id === 'string' && id !== '') known.add(id)
  }
  try {
    for (const session of ctx.sessions.list()) known.add(session.id)
  } catch {
    /* live sessions are a bonus; the persisted listing is authoritative */
  }
  for (const workspace of typeof registry.list === 'function' ? registry.list() : []) {
    const ids = workspace?.record?.sessionIds
    if (!Array.isArray(ids)) continue
    for (const id of ids) {
      if (!known.has(id) && typeof workspace.detachSession === 'function') {
        await workspace.detachSession(id)
      }
    }
  }
  for (const id of registry.archivedSessionIds ?? []) {
    if (!known.has(id)) await registry.unarchiveSession(id)
  }
  for (const id of registry.pinnedSessionIds ?? []) {
    if (!known.has(id)) await registry.unpinSession(id)
  }
}

/**
 * Stop an Agent that has no plugin-owned handle (for example after a plugin
 * reload, or when the native UI reopened a branch). The handle is a capability
 * we no longer hold; its public Agent still exposes cancellation and the
 * scope disposer that unwinds agent-local registrations. The caller verifies
 * the durable header before reaching this point and that both registries are
 * empty after it.
 *
 * @param ctx - plugin context.
 * @param sessionId - branch to retire.
 */
export async function retireUnownedBranch(ctx, sessionId) {
  const agent = ctx.agents.get(sessionId)
  if (agent === undefined) return
  if (typeof agent.cancel !== 'function' || agent.scope === undefined
    || typeof agent.scope.dispose !== 'function') {
    throw new Error(`session-live:${sessionId}`)
  }
  agent.cancel({ kind: 'disposed' }, { keepInbox: false })
  if (typeof agent.whenIdle === 'function') await agent.whenIdle()
  await agent.scope.dispose()
  // Scope disposal starts the agent-loop teardown asynchronously; wait for
  // the agent and session registry entries to disappear instead of assuming
  // one tick is enough.
  for (let attempt = 0; attempt < 60; attempt++) {
    if (ctx.agents.get(sessionId) === undefined && ctx.sessions.get(sessionId) === undefined) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  // A native-resumed agent can survive scope disposal because the controller,
  // not this plugin, owns its fiber. Detach the exact registry entries; the
  // scope teardown above already cancelled and quiesced the loop.
  const agentEntry = ctx.agents.store?.get?.(sessionId)
  if (agentEntry !== undefined && typeof ctx.agents.detachEntered === 'function') {
    ctx.agents.detachEntered(agentEntry)
  }
  const sessionEntry = ctx.sessions.store?.get?.(sessionId)
  if (sessionEntry !== undefined && typeof ctx.sessions.detachEntered === 'function') {
    ctx.sessions.detachEntered(sessionEntry)
  }
  if (ctx.agents.get(sessionId) === undefined && ctx.sessions.get(sessionId) === undefined) return
  const agentStill = ctx.agents.get(sessionId) !== undefined
  const sessionStill = ctx.sessions.get(sessionId) !== undefined
  throw new Error(`session-live:${sessionId}:agent=${agentStill}:session=${sessionStill}`)
}

/** Refuse to dispose a handle when another live agent owns the same id. */
export function assertOwnedLive(ctx, sessionId, handle) {
  const live = ctx.agents.get(sessionId)
  if (live !== undefined && originalService(live) !== originalService(handle?.agent)) {
    throw new Error(`session-live:${sessionId}`)
  }
}

/** Verify the durable header belongs to this exact branch edge. */
export function assertDeleteHeader(header, edge, persistence) {
  // `parentId` is the branch's place in the tree and can be promoted when its
  // source is deleted elsewhere; the Session header keeps the original link,
  // which is what proves this edge was created for this branch.
  const expectedParent = edge.headerParentId ?? edge.parentId
  if (header?.id !== edge.childId || header?.parentSession !== expectedParent
    || typeof header?.cwd !== 'string' || !isAbsolute(header.cwd)) {
    throw new Error(`session-binding-mismatch:${edge.childId}`)
  }
  if (typeof persistence.root !== 'string' || !isAbsolute(persistence.root)) {
    throw new Error('session-backend-mismatch')
  }
}

/**
 * Delete one cold branch after proving its exact directory layout.
 * Only the verified Windows and macOS backends reach this function.
 */
export async function deleteColdSession(persistence, edge) {
  let snapshot = await persistence.stat(edge.childId)
  if (snapshot === undefined) return
  assertDeleteHeader(snapshot.header, edge, persistence)
  const intent = { id: edge.childId, root: persistence.root, cwd: snapshot.header.cwd }
  let before = await inspectSessionDirectory(intent, persistence, true)
  if (before.logs.length === 0) throw new Error('session-logs-missing')
  let lease
  try {
    lease = await persistence.open(edge.childId, 'write')
    assertDeleteHeader(lease.header, edge, persistence)
    const locked = await inspectSessionDirectory(intent, persistence, true)
    if (!sameDirectorySnapshot(before, locked)
      || (!lockIsKernelObject() && !locked.lock)) throw new Error('session-directory-changed')
    for (const log of locked.logs) {
      const now = await lstat(join(locked.dir, log.name), { bigint: true })
      if (!now.isFile() || now.nlink !== 1n || now.dev !== log.dev || now.ino !== log.ino) {
        throw new Error('session-log-changed')
      }
      await unlink(join(locked.dir, log.name))
    }
    const after = await inspectSessionDirectory(intent, persistence, true)
    if (lockIsKernelObject()) {
      if (after.logs.length !== 0 || after.entries.length !== 0
        || !sameIdentity(locked.dirStat, after.dirStat)) throw new Error('session-directory-changed')
      await removeVerifiedEmptyDirectory(after)
    } else {
      if (after.logs.length !== 0 || !after.lock || !sameIdentity(locked.dirStat, after.dirStat)
        || !sameIdentity(locked.lock, after.lock)) throw new Error('session-directory-changed')
      await syncVerifiedDirectory(locked.dirStat, locked.dir)
    }
  } finally {
    if (lease !== undefined) await lease.close()
  }
  if (lockIsKernelObject()) {
    const settled = await inspectOrMissing(intent, persistence, true)
    if (settled !== undefined && (settled.logs.length !== 0 || settled.entries.length !== 0)) {
      throw new Error('session-directory-changed')
    }
  }
}


/**
 * Pin the *implementation*, not merely the spoofable service label.
 * Only revisions whose lease and artifact layout were reviewed are accepted.
 */
export const JSONL_BACKEND_FINGERPRINTS = new Set([
  // DSH 0.2.1-rc.2
  'bb0e12b14bd21adec58c51934f00014e482380102f09aa5e935536c57c0d6e1e',
  // DSH 0.2.2-rc.1 (same session.lock lease, v4 artifact names, keep-lock release)
  '3b266ac3f592216e5967eedce615630e07024c68637fe9f86ba152419805c3f7',
])

/** Pin the implementation that owns the artifact layout. */
export function assertJsonlBackend(persistence) {
  const original = persistence?.[Symbol.for('cordis.original')] ?? persistence
  const ctor = original?.constructor
  const fingerprint = typeof ctor === 'function'
    ? createHash('sha256').update(Function.prototype.toString.call(ctor)).digest('hex') : ''
  if (ctor?.name !== 'JsonlSessionPersistence'
    || !JSONL_BACKEND_FINGERPRINTS.has(fingerprint)
    || typeof persistence.root !== 'string' || !isAbsolute(persistence.root)
    || resolve(persistence.root) !== persistence.root
    || !['none', 'zstd'].includes(persistence.compression)
    || persistence.generationFormat?.currentVersion !== 4) throw new Error('unsupported-persistence-backend')
}

/** Whether the write lock is a kernel object rather than a `session.lock` file. */
export function lockIsKernelObject() {
  return process.platform === 'win32'
}

/** Identical to the rc.2 backend's UTF-16 path encoding. */
export function sideProjectKey(cwd) {
  let readable = ''
  let separator = false
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separator) readable += '-'
      separator = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separator = false
    } else {
      readable += `~${code.toString(16).toUpperCase().padStart(4, '0')}`
      separator = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

export function sideSegment(raw) {
  if (!raw) throw new Error('empty-session-id')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    out += ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch) ? ch : `~${code.toString(16).toUpperCase().padStart(4, '0')}`
  }
  return out
}

/**
 * Compare two bigint stats by the identity the platform actually exposes.
 * POSIX and NTFS both report a volume and file index, so a replaced file or
 * directory never compares equal; a volume whose entries report index zero
 * falls back to creation and modification time.
 */
export function sameIdentity(a, b) {
  if (a === undefined || b === undefined) return false
  if (a.dev !== b.dev) return false
  if (a.ino !== 0n || b.ino !== 0n) return a.ino === b.ino
  return a.birthtimeNs === b.birthtimeNs && a.mtimeNs === b.mtimeNs
}

/**
 * lstat every ancestor and every entry; no recursive removal or symlink following.
 * @param intent - the verified binding that locates the session directory.
 * @param persistence - the verified backend that owns the artifact layout.
 * @param allowEmpty - permit a directory without a log (an interrupted deletion).
 * @returns the inspected path, directory identities, entry names, logs and lock.
 */
export async function inspectSessionDirectory(intent, persistence, allowEmpty) {
  if (intent.root !== persistence.root || !isAbsolute(intent.cwd) || !intent.id) {
    throw new Error('invalid-session-location')
  }
  const dir = join(intent.root, sideProjectKey(intent.cwd), sideSegment(intent.id))
  const rootPart = parse(dir).root
  let path = rootPart
  const components = dir.slice(rootPart.length).split(/[\\/]+/).filter(Boolean)
  const directories = []
  const first = await lstat(path, { bigint: true })
  if (!first.isDirectory() || first.isSymbolicLink()) throw new Error('unsafe-session-ancestor')
  directories.push(first)
  for (const component of components) {
    path = join(path, component)
    const info = await lstat(path, { bigint: true })
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('unsafe-session-ancestor')
    directories.push(info)
  }
  const entries = []
  const logs = []
  let lock
  const versions = new Set()
  for (const name of await readdir(dir)) {
    const info = await lstat(join(dir, name), { bigint: true })
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) throw new Error('unsafe-session-entry')
    entries.push(name)
    if (name === 'session.lock') {
      // Windows excludes writers with a named kernel semaphore keyed by this
      // path and never creates the file, so a stray one is not this backend's.
      if (lockIsKernelObject()) throw new Error('unexpected-session-entry')
      if (info.size !== 0n) throw new Error('unsafe-session-lock')
      lock = info
      continue
    }
    const match = /^session(?:\.v([1-9][0-9]*))?\.jsonl(\.zstd)?$/.exec(name)
    const version = match ? Number(match[1] ?? 0) : NaN
    if (!match || !Number.isSafeInteger(version) || version > 4 || versions.has(version)) {
      throw new Error('unexpected-session-entry')
    }
    versions.add(version)
    logs.push({ name, version, dev: info.dev, ino: info.ino })
  }
  logs.sort((a, b) => a.version - b.version)
  // Avoid write-open's historical migration, which modifies the log itself.
  if (logs.length && !logs.some((log) => log.version === 4
    && log.name === `session.v4.jsonl${persistence.compression === 'zstd' ? '.zstd' : ''}`)) {
    throw new Error('unsupported-session-generation')
  }
  if (!allowEmpty && !logs.length) throw new Error('session-logs-missing')
  return { dir, dirStat: directories.at(-1), directories, entries, logs, lock }
}

/** Inspect a session directory, treating a Windows session that is already gone as absent. */
export async function inspectOrMissing(intent, persistence, allowEmpty) {
  try {
    return await inspectSessionDirectory(intent, persistence, allowEmpty)
  } catch (error) {
    if (lockIsKernelObject() && error?.code === 'ENOENT') return undefined
    throw error
  }
}

/**
 * Open the inspected directory, prove it is still the same object, and fsync it
 * where the platform exposes that contract. Windows has no parent-directory
 * fsync; the backend publishes entries with write-through namespace operations.
 */
export async function syncVerifiedDirectory(expected, dir) {
  const directory = await open(dir, 'r')
  try {
    const opened = await directory.stat({ bigint: true })
    if (!sameIdentity(expected, opened)) throw new Error('session-directory-changed')
    if (!lockIsKernelObject()) await directory.sync()
  } finally {
    await directory.close()
  }
}

/**
 * Remove one verified empty session directory. Windows keeps no lock file, so
 * the directory itself is the last artifact. An empty directory that cannot be
 * removed right now (a held handle from an indexer) is accepted as residue;
 * a non-empty one proves a racing writer.
 */
export async function removeVerifiedEmptyDirectory(snapshot) {
  if (snapshot.logs.length !== 0 || snapshot.entries.length !== 0) throw new Error('session-directory-changed')
  try {
    await rmdir(snapshot.dir)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    if (error?.code === 'ENOTEMPTY' || error?.code === 'EEXIST') throw new Error('session-directory-changed')
  }
}

export function sameDirectorySnapshot(a, b) {
  return a.directories.length === b.directories.length
    && a.directories.every((value, index) => sameIdentity(value, b.directories[index]))
    && (a.lock === undefined || (b.lock !== undefined && sameIdentity(a.lock, b.lock)))
    && a.logs.length === b.logs.length
    && a.logs.every((log, index) => log.name === b.logs[index].name && sameIdentity(log, b.logs[index]))
}
