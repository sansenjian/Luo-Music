import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

type QueryValue = string | string[] | undefined

type VercelRequestLike = IncomingMessage & {
  body?: unknown
  query?: Record<string, QueryValue>
  url?: string
}

type VercelResponseLike = ServerResponse<IncomingMessage>

type NcmModuleResponse = {
  body?: unknown
  cookie?: string[]
  status?: number
}

type NcmRequestOptions = {
  ip?: string
  randomCNIP?: boolean
}

type NcmRequest = (
  uri: string,
  data: Record<string, unknown>,
  options?: NcmRequestOptions
) => Promise<NcmModuleResponse>

type NcmModule = (query: Record<string, unknown>, request: NcmRequest) => Promise<NcmModuleResponse>

type ModuleDefinition = {
  route: string
  module: NcmModule
}

type RuntimeState = {
  cookieToJson: (cookie: string) => Record<string, string>
  modulesByRoute: Map<string, NcmModule>
  request: NcmRequest
}

const require = createRequire(import.meta.url)

let runtimePromise: Promise<RuntimeState> | null = null

/**
 * Determines whether a value is an object (excluding `null`) and not an array.
 *
 * @param value - Value to test
 * @returns `true` if `value` is an object (excluding `null`) and not an array, `false` otherwise.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Determines whether an unknown error payload matches the narrow response shape used by NCM route modules.
 *
 * @param value - Value thrown by a module handler
 * @returns `true` when the value carries at least one supported module response field with the expected type
 */
function isNcmModuleResponse(value: unknown): value is NcmModuleResponse {
  if (!isRecord(value)) {
    return false
  }

  const hasBody = 'body' in value
  const hasStatus = typeof value.status === 'number'
  const hasCookie = Array.isArray(value.cookie)

  return hasBody || hasStatus || hasCookie
}

/**
 * Normalize a query parameter value to a single string.
 *
 * @param value - The query value which may be a string, an array of strings, or other types
 * @returns The first element if `value` is an array, the string itself if `value` is a string, or `undefined` otherwise
 */
function normalizeQueryValue(value: QueryValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }

  return typeof value === 'string' ? value : undefined
}

/**
 * Extracts normalized path segments from a request.
 *
 * Prefers `req.query.path` when present (accepting either an array of segments or a slash-delimited string); otherwise derives segments from `req.url` after removing a leading `/api/`.
 *
 * @param req - The incoming request object
 * @returns An array of non-empty path segments in order (e.g. `['foo','bar']`)
 */
function getPathSegments(req: VercelRequestLike): string[] {
  const rawPath = req.query?.path
  if (Array.isArray(rawPath)) {
    return rawPath.filter(segment => typeof segment === 'string' && segment.length > 0)
  }

  if (typeof rawPath === 'string' && rawPath.length > 0) {
    return rawPath.split('/').filter(Boolean)
  }

  const requestUrl = req.url || ''
  const pathname = requestUrl.split('?')[0] || ''
  return pathname
    .replace(/^\/api\/?/, '')
    .split('/')
    .filter(Boolean)
}

/**
 * Constructs a normalized route string from the incoming request.
 *
 * The result always begins with `/` and contains the request's path segments joined by `/`.
 *
 * @returns The route string (e.g. `/foo/bar`). Returns `/` when there are no path segments.
 */
function getRoute(req: VercelRequestLike): string {
  const segments = getPathSegments(req)
  return `/${segments.join('/')}`
}

/**
 * Determines the client's IP address from the `x-forwarded-for` header.
 *
 * @param headers - Incoming HTTP headers object that may include `x-forwarded-for`
 * @returns The first hop IP from `x-forwarded-for`, or `undefined` if the header is missing, empty, or equals the loopback `::1`
 */
function extractClientIp(headers: IncomingHttpHeaders): string | undefined {
  const forwarded = headers['x-forwarded-for']
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded
  if (typeof value !== 'string' || value.length === 0) {
    return undefined
  }

  const firstHop = value.split(',')[0]?.trim()
  return firstHop && firstHop !== '::1' ? firstHop : undefined
}

/**
 * Normalize a raw request body into a plain object record.
 *
 * @param body - The raw request body, either an object-like value or a JSON string.
 * @returns An object parsed from `body` if it is an object record or a JSON string that parses to an object record; otherwise an empty object.
 */
function parseBody(body: unknown): Record<string, unknown> {
  if (isRecord(body)) {
    return body
  }

  if (typeof body !== 'string' || body.length === 0) {
    return {}
  }

  try {
    const parsed = JSON.parse(body) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Constructs a normalized query object by merging request query parameters and the parsed request body.
 *
 * @param req - The incoming request whose `query` and `body` are used. Query entries under the key `path` are ignored; query values are normalized (arrays -> first element, strings unchanged) and entries with `undefined` values are omitted.
 * @returns An object containing the normalized query key/value pairs (excluding `path`) merged with the parsed JSON body; body properties override query keys when names conflict.
 */
function buildQuery(req: VercelRequestLike): Record<string, unknown> {
  const queryEntries = Object.entries(req.query || {}).filter(([key]) => key !== 'path')
  const queryObject = Object.fromEntries(
    queryEntries
      .map(([key, value]) => [key, normalizeQueryValue(value)])
      .filter(([, value]) => value !== undefined)
  )

  return {
    ...queryObject,
    ...parseBody(req.body)
  }
}

/**
 * Send a JSON HTTP response using the provided response-like object.
 *
 * Sets the response status code and `Content-Type: application/json; charset=utf-8`,
 * then ends the response with the JSON-serialized `payload`.
 *
 * @param res - The response-like object to write the status, headers, and body to
 * @param status - The HTTP status code to send
 * @param payload - The value to serialize as the JSON response body
 */
function sendJson(res: VercelResponseLike, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/**
 * Load and initialize the Netease runtime components required to dispatch module routes.
 *
 * Ensures package configuration is generated, discovers module definitions (applying special route mappings),
 * and imports the runtime utilities needed by handlers.
 *
 * @returns An object containing:
 *  - `cookieToJson`: a function that parses a cookie header string into a record of cookie name/value pairs.
 *  - `modulesByRoute`: a Map that maps route strings to their corresponding module handler.
 *  - `request`: the runtime request function used to perform upstream API calls.
 */
async function loadRuntime(): Promise<RuntimeState> {
  const fs = require('node:fs') as typeof import('node:fs')
  const anonymousTokenPath = path.resolve(os.tmpdir(), 'anonymous_token')
  if (!fs.existsSync(anonymousTokenPath)) {
    fs.writeFileSync(anonymousTokenPath, '', 'utf-8')
  }

  const generateConfig =
    require('@neteasecloudmusicapienhanced/api/generateConfig.js') as () => Promise<void>
  await generateConfig()

  const pkgServerPath = require.resolve('@neteasecloudmusicapienhanced/api/server.js')
  const pkgDir = path.dirname(pkgServerPath)
  const { getModulesDefinitions } = require('@neteasecloudmusicapienhanced/api/server.js') as {
    getModulesDefinitions: (
      modulesPath: string,
      specificRoute?: Record<string, string>,
      doRequire?: boolean
    ) => Promise<ModuleDefinition[]>
  }
  const request = require('@neteasecloudmusicapienhanced/api/util/request.js') as NcmRequest
  const { cookieToJson } = require('@neteasecloudmusicapienhanced/api/util/index.js') as {
    cookieToJson: (cookie: string) => Record<string, string>
  }

  const specialRoutes = {
    'daily_signin.js': '/daily_signin',
    'fm_trash.js': '/fm_trash',
    'personal_fm.js': '/personal_fm'
  }

  const moduleDefinitions = await getModulesDefinitions(path.join(pkgDir, 'module'), specialRoutes)
  const modulesByRoute = new Map(
    moduleDefinitions.map((definition: ModuleDefinition) => [definition.route, definition.module])
  )

  return {
    cookieToJson,
    modulesByRoute,
    request
  }
}

/**
 * Lazily initializes and returns the shared runtime state used by request handlers.
 *
 * @returns The cached RuntimeState instance
 */
async function ensureRuntime(): Promise<RuntimeState> {
  if (!runtimePromise) {
    runtimePromise = loadRuntime().catch(error => {
      runtimePromise = null
      throw error
    })
  }

  return runtimePromise
}

/**
 * Handle incoming HTTP requests by routing them to the corresponding Netease module and returning its JSON response.
 *
 * Processes CORS preflight (OPTIONS), resolves the route from the request, lazily initializes runtime modules, builds a query object (including parsed body and cookies), invokes the matched module with a request wrapper that injects client IP, applies `Set-Cookie` headers from module responses when appropriate, and sends the module's body as a JSON response or a JSON 404 when not found.
 *
 * @param req - The incoming request-like object (may include `body`, `query`, `url`, and `headers`)
 * @param res - The response-like object used to set status, headers, and send JSON payloads
 */
export default async function handler(
  req: VercelRequestLike,
  res: VercelResponseLike
): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  const route = getRoute(req)
  if (route === '/' || route === '/favicon.ico') {
    sendJson(res, 404, { code: 404, msg: 'Not Found', data: null })
    return
  }

  const runtime = await ensureRuntime()
  const endpointHandler = runtime.modulesByRoute.get(route)

  if (!endpointHandler) {
    sendJson(res, 404, { code: 404, msg: `Unknown Netease API route: ${route}`, data: null })
    return
  }

  const query: Record<string, unknown> & { noCookie?: unknown } = {
    cookie: runtime.cookieToJson(req.headers.cookie || ''),
    ...buildQuery(req)
  }

  try {
    const moduleResponse = await endpointHandler(query, (uri, data, options = {}) => {
      const clientIp = extractClientIp(req.headers)
      return runtime.request(uri, data, clientIp ? { ...options, ip: clientIp } : options)
    })

    if (Array.isArray(moduleResponse.cookie) && !query.noCookie) {
      res.setHeader('Set-Cookie', moduleResponse.cookie)
    }

    sendJson(res, moduleResponse.status || 200, moduleResponse.body ?? {})
  } catch (error) {
    const moduleResponse = isNcmModuleResponse(error) ? error : null

    if (Array.isArray(moduleResponse?.cookie) && !query.noCookie) {
      res.setHeader('Set-Cookie', moduleResponse.cookie)
    }

    if (!moduleResponse) {
      sendJson(res, 500, { code: 500, msg: 'Internal Server Error', data: null })
      return
    }

    if (moduleResponse.body === undefined) {
      const status = moduleResponse.status || 404
      sendJson(res, status, { code: status, msg: 'Not Found', data: null })
      return
    }

    sendJson(res, moduleResponse.status || 500, moduleResponse.body)
  }
}
