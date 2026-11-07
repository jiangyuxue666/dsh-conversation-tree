import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, rename, rm, unlink } from 'node:fs/promises'
import { hostname } from 'node:os'
import { dirname, join, parse } from 'node:path'
import { failure, harnessHome, json } from './base.js'

/** Registry of branch edges, durable across host restarts. */
export const TREE_FILE = join(harnessHome(), 'conversation-tree.json')
/**
 * Cross-process lock directory. A process that dies while holding it leaves the
 * directory behind; `withTree` reclaims one whose owner proves dead or idle for
 * longer than {@link LOCK_STALE_MS}, so a crash cannot block the tree forever.
 */
export const TREE_LOCK = `${TREE_FILE}.lock`
/** A held lock older than this (and from a dead/foreign-unknown pid) is stale. */
export const LOCK_STALE_MS = 30_000

// ------------------------------------------------------------------ registry

/**
 * An empty durable registry.
 *
 * `roots` holds Sessions that this plugin still treats as tree nodes but that
 * have no parent edge any more — their ancestor chain was deleted outside this
 * plugin. Listing them keeps chain recovery from resurrecting the dead link and
 * tells the projection where a component starts.
 *
 * `notes` is the user's own name for a node, keyed by Session id. It lives here
 * rather than in the Session log because a Session is immutable history: the
 * tree's naming is a view over it, and a note must work for a root conversation
 * that no edge points at.
 */
export function emptyRegistry() {
  return { version: 1, edges: [], pending: [], roots: [], notes: {} }
}

/** A shallow copy safe to hand to an operation. */
export function cloneRegistry(known) {
  return {
    version: 1,
    edges: known.edges.map((edge) => ({ ...edge })),
    pending: known.pending.map((edge) => ({ ...edge })),
    roots: [...(known.roots ?? [])],
    notes: { ...(known.notes ?? {}) },
  }
}

/** Validate one edge record. */
export function validEdge(edge) {
  return edge !== null && typeof edge === 'object' && !Array.isArray(edge)
    && typeof edge.childId === 'string' && edge.childId !== ''
    && typeof edge.parentId === 'string' && edge.parentId !== ''
    && edge.childId !== edge.parentId
    && Number.isSafeInteger(edge.atSeq) && edge.atSeq >= 0
    && Number.isSafeInteger(edge.turn) && edge.turn >= 1
    && typeof edge.snippet === 'string'
    && typeof edge.title === 'string'
    && (edge.ordinal === undefined || (Number.isSafeInteger(edge.ordinal) && edge.ordinal >= 1))
    && Number.isFinite(edge.createdAt)
    // A reparented edge keeps the immutable header link it was created with,
    // because the branch Session's own `parentSession` can never be rewritten.
    && (edge.headerParentId === undefined
      || (typeof edge.headerParentId === 'string' && edge.headerParentId !== ''
        && edge.headerParentId !== edge.childId))
    && (edge.relinked === undefined || edge.relinked === true)
}

/** Read the registry, treating a missing file as empty. */
export async function treeRegistry() {
  let raw
  try {
    raw = await readFile(TREE_FILE, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyRegistry()
    throw error
  }
  const parsed = JSON.parse(raw)
  if (parsed === null || typeof parsed !== 'object' || parsed.version !== 1
    || !Array.isArray(parsed.edges) || !Array.isArray(parsed.pending)) {
    throw new Error('invalid conversation-tree registry')
  }
  const edges = parsed.edges.map((edge) => ({ ...edge }))
  const pending = parsed.pending.map((edge) => ({ ...edge }))
  if (edges.some((edge) => !validEdge(edge)) || pending.some((edge) => !validEdge(edge))) {
    throw new Error('invalid conversation-tree edge')
  }
  const childIds = [...edges, ...pending].map((edge) => edge.childId)
  if (new Set(childIds).size !== childIds.length) throw new Error('duplicate conversation-tree child')
  // `roots` is additive: a registry written before the field existed stays
  // readable, and its nodes simply keep resolving through the edge chain.
  const listed = parsed.roots === undefined ? [] : parsed.roots
  if (!Array.isArray(listed)) throw new Error('invalid conversation-tree roots')
  if (listed.some((id) => typeof id !== 'string' || id === '')) {
    throw new Error('invalid conversation-tree root')
  }
  return { version: 1, edges, pending, roots: [...new Set(listed)], notes: readNotes(parsed.notes) }
}

/** Largest note a node may carry; the canvas ellipsizes far earlier. */
export const MAX_NOTE_CHARS = 40

/**
 * Read the note map, dropping entries a hand edit broke.
 *
 * A bad note is cosmetic, so it is filtered instead of failing the whole
 * registry the way a malformed edge must.
 */
export function readNotes(value) {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const notes = {}
  for (const [id, note] of Object.entries(value)) {
    if (typeof id !== 'string' || id === '') continue
    if (typeof note !== 'string') continue
    const text = note.trim()
    if (text === '') continue
    notes[id] = text.slice(0, MAX_NOTE_CHARS)
  }
  return notes
}

/** Atomic replacement under the cross-process lock; never swallow failure. */
export async function saveTreeRegistry(known) {
  const temporary = `${TREE_FILE}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify({
        version: 1,
        edges: known.edges,
        pending: known.pending,
        roots: known.roots ?? [],
        notes: known.notes ?? {},
      }), 'utf8')
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, TREE_FILE)
    if (process.platform !== 'win32') {
      const directory = await open(dirname(TREE_FILE), 'r')
      try { await directory.sync() } finally { await directory.close() }
    }
  } finally {
    await unlink(temporary).catch((error) => { if (error?.code !== 'ENOENT') throw error })
  }
}

/**
 * Take the lock directory and record its owner, so a later process can tell a
 * crashed holder from a live one.
 */
export async function acquireTreeLock() {
  await mkdir(TREE_LOCK, { mode: 0o700 })
  let owner
  try {
    owner = await open(join(TREE_LOCK, 'owner.json'), 'wx', 0o600)
    await owner.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), at: Date.now() }), 'utf8')
    await owner.sync()
  } catch (error) {
    await owner?.close().catch(() => {})
    await rm(TREE_LOCK, { recursive: true, force: true }).catch(() => {})
    throw error
  }
  await owner.close().catch(() => {})
}

/** Release the lock only when this process still owns it. */
export async function releaseTreeLock() {
  try {
    const owner = JSON.parse(await readFile(join(TREE_LOCK, 'owner.json'), 'utf8'))
    if (owner?.pid !== process.pid) return
  } catch {
    return
  }
  await rm(TREE_LOCK, { recursive: true, force: true }).catch(() => {})
}

/** Whether the current lock owner is provably gone, or has held it too long. */
export async function treeLockIsStale() {
  let owner
  try {
    owner = JSON.parse(await readFile(join(TREE_LOCK, 'owner.json'), 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') return false
    // The owner record is written right after mkdir, so a record-less directory
    // is either mid-acquisition or left by a crash. Judge that one by age.
    try {
      const info = await lstat(TREE_LOCK)
      return Date.now() - info.mtimeMs > LOCK_STALE_MS
    } catch {
      return false
    }
  }
  // Killing a pid means nothing on another machine; never judge a foreign host.
  if (owner?.host !== hostname()) return false
  if (Number.isSafeInteger(owner?.pid) && owner.pid !== process.pid) {
    try {
      process.kill(owner.pid, 0)
    } catch (error) {
      if (error?.code === 'ESRCH') return true
    }
  }
  return Number.isFinite(owner?.at) && Date.now() - owner.at > LOCK_STALE_MS
}

/** Atomically steal a stale lock; only one racer can rename the directory away. */
export async function breakStaleTreeLock() {
  if (!(await treeLockIsStale())) return false
  const grave = `${TREE_LOCK}.${randomUUID()}.stale`
  try {
    await rename(TREE_LOCK, grave)
  } catch {
    return false
  }
  await rm(grave, { recursive: true, force: true }).catch(() => {})
  return true
}

/** Serialize all cooperating processes; reclaim a lock whose owner is gone. */
export async function withTree(operation) {
  await mkdir(dirname(TREE_FILE), { recursive: true })
  let held = false
  for (let attempt = 0; attempt < 160; attempt++) {
    try {
      await acquireTreeLock()
      held = true
      break
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      // Give the ordinary short critical section a chance first, then probe for
      // an abandoned lock about twice a second.
      if (attempt >= 20 && attempt % 20 === 0 && await breakStaleTreeLock()) continue
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25))
    }
  }
  if (!held) throw new Error('tree-lock-timeout')
  try {
    return await operation(await treeRegistry())
  } finally {
    await releaseTreeLock()
  }
}
