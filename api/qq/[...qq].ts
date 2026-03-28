import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'

type VercelRequestLike = IncomingMessage & {
  url?: string
}

type VercelResponseLike = ServerResponse<IncomingMessage>

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void

const require = createRequire(import.meta.url)

const QQ_FUNCTION_PREFIX = '/api/qq'
const QQ_PUBLIC_PREFIX = '/qq-api'

let cachedQQHandler: NodeHandler | null = null

/**
 * Strips a specified leading prefix from a pathname, returning `'/'` when the result is empty.
 *
 * @param pathname - The pathname to normalize (e.g., `'/api/qq/foo'`)
 * @param prefix - The prefix to remove if present (e.g., `'/api/qq'`)
 * @returns The pathname with the prefix removed; if `pathname` equals the `prefix` or removal yields an empty string, returns `'/'`
 */
function trimPrefix(pathname: string, prefix: string): string {
  if (pathname === prefix) {
    return '/'
  }

  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length) || '/'
  }

  return pathname
}

/**
 * Normalize a request URL by removing configured QQ API prefixes while preserving the query string.
 *
 * @param requestUrl - The incoming request URL (pathname with optional `?query`); defaults to `/`
 * @returns The normalized URL whose pathname has `/api/qq` and `/qq-api` prefixes trimmed and which includes the original query string if present
 */
export function normalizeQQRequestUrl(requestUrl: string = '/'): string {
  const queryStart = requestUrl.indexOf('?')
  const pathname = queryStart >= 0 ? requestUrl.slice(0, queryStart) : requestUrl
  const search = queryStart >= 0 ? requestUrl.slice(queryStart + 1) : ''
  const normalizedPath = trimPrefix(
    trimPrefix(pathname || '/', QQ_FUNCTION_PREFIX),
    QQ_PUBLIC_PREFIX
  )

  return search ? `${normalizedPath}?${search}` : normalizedPath
}

/**
 * Load and cache the QQ Music API Node HTTP request handler.
 *
 * Loads the handler from the QQ Music API package on first call, caches it for
 * subsequent calls, and returns the resolved handler.
 *
 * @returns The cached Node HTTP request handler for the QQ Music API.
 * @throws Error if the module does not export a compatible request handler.
 */
function getQQHandler(): NodeHandler {
  if (!cachedQQHandler) {
    const qqApiModule = require('@sansenjian/qq-music-api/dist/api/index.js') as
      | NodeHandler
      | { default?: NodeHandler }

    cachedQQHandler =
      typeof qqApiModule === 'function' ? qqApiModule : (qqApiModule.default ?? null)

    if (!cachedQQHandler) {
      throw new Error('Failed to resolve QQ Music API handler')
    }
  }

  return cachedQQHandler
}

/**
 * Normalizes the incoming request URL for QQ Music API routes and forwards the request to the resolved QQ Music API handler.
 *
 * Normalizes `req.url` to remove the configured QQ prefixes, mutates `req.url` with the normalized value, and then invokes the cached QQ Music API Node handler with `(req, res)`.
 *
 * @param req - Vercel-style incoming request; its `url` is mutated to the normalized QQ API path before forwarding.
 * @param res - Node HTTP server response forwarded to the QQ Music API handler.
 * @throws Error - If the QQ Music API handler cannot be resolved.
 */
export default function handler(req: VercelRequestLike, res: VercelResponseLike): void {
  req.url = normalizeQQRequestUrl(req.url)
  getQQHandler()(req, res)
}
