import { errorMessage, failure, json, readJson, sameSiteRequest } from './base.js'
import { MAX_NOTE_CHARS, saveTreeRegistry, withTree } from './registry.js'

/**
 * The user's own name for one tree node.
 *
 * A branch title is assembled from its source conversation ("插件仓库检查 · 分支
 * 2"), which says nothing about what the branch is for. The note is the answer
 * to that, and it belongs to the tree rather than to the Session: a Session log
 * is immutable history, and a note must also work for a root conversation that
 * no edge points at.
 *
 * @module dsh-conversation-tree/lib/notes
 */

/** POST /api/conversation-tree/note */
export async function saveNodeNote(ctx, request) {
  if (!sameSiteRequest(request)) return failure(403, 'cross-origin')
  const body = await readJson(request)
  if (body === undefined) return failure(400, 'invalid-json')
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  if (sessionId === '' || sessionId.length > 256) return failure(400, 'missing-fields')
  // The client never sends anything else; an absent note clears it.
  if (body.note !== undefined && typeof body.note !== 'string') return failure(400, 'invalid-note')
  const note = (body.note ?? '').trim().slice(0, MAX_NOTE_CHARS)
  try {
    await withTree(async (known) => {
      const notes = { ...(known.notes ?? {}) }
      if (note === '') delete notes[sessionId]
      else notes[sessionId] = note
      known.notes = notes
      await saveTreeRegistry(known)
    })
    return json({ ok: true, sessionId, note })
  } catch (error) {
    return failure(503, `note-failed:${errorMessage(error)}`)
  }
}
