// ----------------------------------------------------------------- models

/**
 * Keep the branch session's request route aligned with its durable model
 * selection, mirroring the session controller's model-selection wiring.
 */
export function installModelRoute(ctx, agentCtx, agent, fallback) {
  const effective = () => currentModelSelection(ctx, agent.session) ?? fallback ?? modelRoute(ctx, undefined)
  agentCtx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    const selected = effective()
    if (selected === undefined) return assembled
    return {
      ...assembled,
      variables: { ...assembled.variables, provider: selected.provider, model: selected.model },
    }
  })
  agentCtx.on('agent/request', async (_payload, next) => {
    const resolved = await next()
    const selected = effective()
    if (selected === undefined) return resolved
    const { reasoningEffort: _inherited, ...rest } = resolved
    return {
      ...rest,
      provider: selected.provider,
      model: selected.model,
      ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }),
    }
  })
}

/** Read the session's pending or last-used model selection. */
export function currentModelSelection(ctx, session) {
  try {
    const state = ctx.sessionProjections.stateOf(session, 'modelSelection')
    return state?.pending ?? state?.lastUsed ?? undefined
  } catch {
    return undefined
  }
}

export function modelRoute(ctx, session) {
  if (session !== undefined) {
    let config
    try {
      config = session.requestHeader()?.config
    } catch {
      config = undefined
    }
    if (usableRoute(config)) return routeOf(config)
  }
  let fallback
  try {
    fallback = ctx.get('agentDefaultModel')?.currentSelection?.()
  } catch {
    fallback = undefined
  }
  if (usableRoute(fallback)) return routeOf(fallback)
  return undefined
}

/** Whether a candidate carries a provider and model. */
export function usableRoute(value) {
  return value !== undefined && value !== null
    && typeof value.provider === 'string' && value.provider !== ''
    && typeof value.model === 'string' && value.model !== ''
}

/** Project a selection into the request route shape. */
export function routeOf(value) {
  return {
    provider: value.provider,
    model: value.model,
    ...(typeof value.reasoningEffort === 'string' ? { reasoningEffort: value.reasoningEffort } : {}),
  }
}

export function selectionOfEvents(events) {
  for (let index = (events?.length ?? 0) - 1; index >= 0; index--) {
    const data = events?.[index]?.data
    if (events[index]?.type !== 'model/selection' || data === null || typeof data !== 'object') continue
    if (usableRoute(data)) return routeOf(data)
  }
  return undefined
}

/** Prefer the live route, then the persisted selection, then the default. */
