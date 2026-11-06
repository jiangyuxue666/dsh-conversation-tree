import { homedir } from 'node:os'
import { isAbsolute, join, parse } from 'node:path'

/** Largest JSON body any route accepts; the plugin never needs more than a few hundred bytes. */
export const MAX_BODY_BYTES = 64 * 1024

/**
 * Plugin-owned durable record written into every branch Session. The JSON
 * registry stays the fast path; this copy lets the tree survive a lost or
 * truncated registry file, because the edge travels with the session log.
 */
export const EDGE_RECORD_TYPE = 'plugin:conversation-tree/edge'

export function harnessHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured !== '' && isAbsolute(configured)) return configured
  return join(homedir(), '.dsh')
}


/**
 * Defense in depth for write routes: the connection fence already checks the
 * same origin, but a route that deletes sessions should not depend on one
 * layer staying strict.
 *
 * The browser's Origin is compared with the `Host` header, never with the
 * request URL: Connection hands this handler a Fetch Request built on the
 * synthetic base `http://dsh.internal`, so the URL authority is not the one the
 * browser dialed. Comparing against it would reject every same-origin POST.
 * A request with no Origin (a same-origin GET utility, a test, a local script)
 * passes; a browser-marked cross-site request does not.
 */
export function sameSiteRequest(request) {
  const site = request.headers?.get?.('sec-fetch-site')
  if (site === 'cross-site') return false
  const origin = request.headers?.get?.('origin')
  if (typeof origin !== 'string' || origin === '') return true
  const host = request.headers?.get?.('host')
  // A browser always sends Host; without it, the Origin cannot be proven ours.
  if (typeof host !== 'string' || host === '') return false
  try {
    const originUrl = new URL(origin)
    if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') return false
    const hostUrl = new URL(`${originUrl.protocol}//${host}`)
    return originUrl.host === hostUrl.host
  } catch {
    return false
  }
}

/** Read a JSON body without throwing; oversized bodies are rejected unread. */
export async function readJson(request) {
  const declared = Number(request.headers?.get?.('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return undefined
  try {
    if (typeof request.text === 'function') {
      const text = await request.text()
      if (text.length > MAX_BODY_BYTES) return undefined
      const value = JSON.parse(text)
      return typeof value === 'object' && value !== null ? value : undefined
    }
    const value = await request.json()
    return typeof value === 'object' && value !== null ? value : undefined
  } catch {
    return undefined
  }
}

/** Describe one thrown value. */
export function errorMessage(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Describe one terminal LLM failure. */
export function failureMessage(failure) {
  if (failure !== null && typeof failure === 'object' && typeof failure.message === 'string' && failure.message !== '') {
    return failure.message
  }
  return errorMessage(failure)
}

/** Build a JSON response. */
export function json(value) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Build a JSON failure response. */
export function failure(status, code) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Build a response from a settled route result. */
export function responseOf(result) {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Normalize a rejected route promise into a settled failure result. */
export function errorResponse(error) {
  return { status: 409, body: { error: `summary-failed:${errorMessage(error)}` } }
}
