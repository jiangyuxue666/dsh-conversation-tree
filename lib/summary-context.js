import { Session, interruptedTurnClosers } from '@deepseek-ai/dsh-session'
import { basename } from 'node:path'
import { currentModelSelection, routeOf, usableRoute } from './models.js'
import { titleOfEvents } from './transcript.js'

/** A failure that can be safely mapped to a localized response. */
export class SummaryContextError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

/** Fold the same pending/last-used selection semantics as the agent model. */
export function recordedSelection(events) {
  let pending
  let lastUsed
  for (const event of events) {
    if (event.type === 'model/selection' && usableRoute(event.data)) {
      pending = routeOf(event.data)
    } else if (event.type === 'request/header' && usableRoute(event.data?.header?.config)) {
      const header = event.data.header
      lastUsed = routeOf(header.config)
      if (header.adapterDefaults?.reasoningEffort === true) delete lastUsed.reasoningEffort
      if (pending && pending.provider === lastUsed.provider && pending.model === lastUsed.model
        && pending.reasoningEffort === lastUsed.reasoningEffort) pending = undefined
    }
  }
  return pending ?? lastUsed
}

/** Check the source's exact message surface has no unfinished tool invocation. */
export function assertBalancedMessages(messages) {
  const pending = new Set()
  for (const message of messages) {
    if (message.role === 'assistant') {
      if (pending.size !== 0) throw new SummaryContextError('source-busy')
      for (const block of message.content ?? []) {
        if (block.type !== 'tool-call') continue
        if (typeof block.id !== 'string' || block.id === '' || pending.has(block.id)) {
          throw new SummaryContextError('context-unavailable')
        }
        pending.add(block.id)
      }
    } else if (message.role === 'tool') {
      if (!pending.delete(message.toolCallId)) throw new SummaryContextError('context-unavailable')
    } else if (message.role === 'user' && pending.size !== 0) {
      throw new SummaryContextError('source-busy')
    }
  }
  if (pending.size !== 0) throw new SummaryContextError('source-busy')
}

/** A cold log may end in the middle of a turn or compaction after a crash. */
export function assertClosedEvents(events) {
  if (interruptedTurnClosers(events).length !== 0) throw new SummaryContextError('source-busy')
  const compacting = new Set()
  for (const event of events) {
    if (event.type === 'compaction/start') compacting.add(event.data?.compactionId)
    else if (event.type === 'compaction/end') compacting.delete(event.data?.compactionId)
    // A seed boundary retires an interrupted compaction from the prior lifecycle.
    else if (event.type === 'session/end-seed') compacting.clear()
  }
  if (compacting.size !== 0) throw new SummaryContextError('source-busy')
}

/** Capture a live Session synchronously so it cannot advance between fields. */
function liveSnapshot(ctx, id, session) {
  const agent = ctx.agents?.get(id)
  if (agent?.status === 'running') throw new SummaryContextError('source-busy')
  const events = session.snapshotEvents()
  assertClosedEvents(events)
  const messages = session.deriveMessages()
  assertBalancedMessages(messages)
  const selected = agent?.model?.current?.() ?? currentModelSelection(ctx, session) ?? recordedSelection(events)
  return snapshotOf(session, events, messages, selected)
}

function snapshotOf(session, events, messages, selected) {
  if (!messages.some((message) => message.role === 'user' || message.role === 'assistant')) {
    throw new SummaryContextError('source-empty')
  }
  const header = session.requestHeader()
  const route = usableRoute(selected) ? routeOf(selected) : undefined
  if (route === undefined) throw new SummaryContextError('model-unavailable')
  return {
    route,
    header,
    messages,
    toolHistory: session.toolHistory(),
    sourceTitle: titleOfEvents(events) || basename(session.header?.cwd ?? '') || '对话',
  }
}

/** Read without opening a writable handle or entering a temporary Session. */
export async function readSummaryContext(ctx, id, signal) {
  signal?.throwIfAborted()
  let live = ctx.sessions.get(id)
  if (live !== undefined) return liveSnapshot(ctx, id, live)
  const persistence = ctx.get('sessionPersistence')
  if (!persistence) throw new SummaryContextError('persistence-unavailable')

  const before = typeof persistence.stat === 'function' ? await persistence.stat(id, { signal }) : undefined
  if (typeof persistence.stat === 'function' && before === undefined) {
    live = ctx.sessions.get(id)
    if (live !== undefined) return liveSnapshot(ctx, id, live)
    throw new SummaryContextError('session-not-found')
  }
  let handle
  let read
  let header
  let inherited
  try {
    handle = await persistence.open(id, 'read', { signal })
    read = await handle.read(0, undefined, { signal })
    header = handle.header
    inherited = handle.inheritedEventCount
  } finally {
    await handle?.close()
  }
  signal?.throwIfAborted()
  // A live instance always wins over the potentially older persisted prefix.
  live = ctx.sessions.get(id)
  if (live !== undefined) return liveSnapshot(ctx, id, live)
  if (before !== undefined && typeof persistence.stat === 'function') {
    const after = await persistence.stat(id, { signal })
    live = ctx.sessions.get(id)
    if (live !== undefined) return liveSnapshot(ctx, id, live)
    if (after === undefined || before.revision !== after.revision) throw new SummaryContextError('context-unavailable')
  }
  const events = read.events
  assertClosedEvents(events)
  const session = Session.fromRestore(id, events, header, inherited, read.eventState, ctx.sessions.messageProjections)
  const messages = session.deriveMessages()
  assertBalancedMessages(messages)
  return snapshotOf(session, events, messages, recordedSelection(events))
}
