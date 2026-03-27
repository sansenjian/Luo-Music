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

function trimPrefix(pathname: string, prefix: string): string {
  if (pathname === prefix) {
    return '/'
  }

  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length) || '/'
  }

  return pathname
}

export function normalizeQQRequestUrl(requestUrl: string = '/'): string {
  const [pathname = '/', search = ''] = requestUrl.split('?')
  const normalizedPath = trimPrefix(
    trimPrefix(pathname || '/', QQ_FUNCTION_PREFIX),
    QQ_PUBLIC_PREFIX
  )

  return search ? `${normalizedPath}?${search}` : normalizedPath
}

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

export default function handler(req: VercelRequestLike, res: VercelResponseLike): void {
  req.url = normalizeQQRequestUrl(req.url)
  getQQHandler()(req, res)
}
