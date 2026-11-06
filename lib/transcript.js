import { join } from 'node:path'

/** Transcript characters carried into one compression call. */
export const MAX_CONTEXT_CHARS = 140_000

// --------------------------------------------------------------- transcript

/**
 * Fold committed events into a readable record.
 * @param events - Session events.
 * @param fromSeq - first event seq to include.
 * @returns the transcript text and its truncation flag.
 */
export function transcriptOf(events, fromSeq = 0) {
  const lines = []
  for (const event of events ?? []) {
    if (typeof event?.seq === 'number' && event.seq < fromSeq) continue
    const data = event?.data ?? {}
    switch (event?.type) {
      case 'user/message': {
        const text = textOf(data.content)
        if (text !== '') lines.push(`【用户】${text}`)
        break
      }
      case 'assistant/message': {
        const text = textOf(data.message?.content)
        if (text !== '') lines.push(`【助手】${text}`)
        break
      }
      case 'tool/call': {
        const name = typeof data.name === 'string' ? data.name : 'tool'
        const args = typeof data.arguments === 'string' ? data.arguments : ''
        lines.push(`【调用 ${name}】${clip(args, 240)}`)
        break
      }
      case 'tool/result': {
        const text = textOf(data.message?.content)
        if (text !== '') lines.push(`【工具结果】${clip(text, 400)}`)
        break
      }
      default:
        break
    }
  }
  const full = lines.join('\n\n')
  if (full.length > MAX_CONTEXT_CHARS) {
    return { text: full.slice(-MAX_CONTEXT_CHARS), truncated: true }
  }
  return { text: full, truncated: false }
}

/** Read a live Session's inherited prefix length. */
export function inheritedOf(session) {
  return typeof session.inheritedEventCount === 'number' ? session.inheritedEventCount : 0
}

/** Join the text blocks of one message. */
export function textOf(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n').trim()
}

/** Bound a string with an ellipsis. */
export function clip(value, limit) {
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}…`
}

/** The latest durable title in one event list. */
export function titleOfEvents(events) {
  for (let index = (events?.length ?? 0) - 1; index >= 0; index--) {
    const event = events[index]
    if (event?.type === 'session/title' && typeof event.data?.title === 'string') {
      const title = event.data.title.trim()
      if (title !== '') return title
    }
  }
  return ''
}
