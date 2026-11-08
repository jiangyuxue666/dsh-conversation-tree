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
