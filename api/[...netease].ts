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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeQueryValue(value: QueryValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }

  return typeof value === 'string' ? value : undefined
}

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

function getRoute(req: VercelRequestLike): string {
  const segments = getPathSegments(req)
  return `/${segments.join('/')}`
}

function extractClientIp(headers: IncomingHttpHeaders): string | undefined {
  const forwarded = headers['x-forwarded-for']
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded
  if (typeof value !== 'string' || value.length === 0) {
    return undefined
  }

  const firstHop = value.split(',')[0]?.trim()
  return firstHop && firstHop !== '::1' ? firstHop : undefined
}

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

function sendJson(res: VercelResponseLike, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

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

async function ensureRuntime(): Promise<RuntimeState> {
  if (!runtimePromise) {
    runtimePromise = loadRuntime()
  }

  return runtimePromise
}

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
    const moduleResponse = isRecord(error) ? (error as NcmModuleResponse) : {}

    if (Array.isArray(moduleResponse.cookie) && !query.noCookie) {
      res.setHeader('Set-Cookie', moduleResponse.cookie)
    }

    if (!moduleResponse.body) {
      sendJson(res, 404, { code: 404, msg: 'Not Found', data: null })
      return
    }

    sendJson(res, moduleResponse.status || 500, moduleResponse.body)
  }
}
