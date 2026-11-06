

/**
 * Live branch handles, keyed by session id.
 *
 * Kept on globalThis rather than module scope: Cordis can reload this module
 * for a profile without recreating the process, and a module-local map would
 * silently lose the only capability that can dispose a live branch. The
 * global map survives that reload; a process restart also drops the agents,
 * so a stale entry can be discarded by the normal liveness checks.
 */
export const HANDLE_STORE = Symbol.for('dsh-conversation-tree.handles')
export const disposeFailures = globalThis[Symbol.for('dsh-conversation-tree.dispose-failures')]
  ?? (globalThis[Symbol.for('dsh-conversation-tree.dispose-failures')] = new Map())
export const handles = globalThis[HANDLE_STORE] ?? (globalThis[HANDLE_STORE] = new Map())

export function originalService(service) { return service?.[Symbol.for('cordis.original')] ?? service }
