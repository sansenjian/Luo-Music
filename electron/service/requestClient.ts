type JsonHttpError = Error & {
  code?: string
  response?: {
    status?: number
    data?: unknown
  }
}

const LOCAL_SERVICE_HOST = '127.0.0.1'
const LOCAL_SERVICE_TIMEOUT_MS = 10000

type ParsedErrorPayload = {
  message: string
  data: unknown
  code?: string
}

function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          searchParams.append(key, String(item))
        }
      }
      continue
    }

    searchParams.append(key, String(value))
  }

  const query = searchParams.toString()
  return query.length > 0 ? `?${query}` : ''
}

function parseErrorPayload(raw: string): ParsedErrorPayload {
  if (!raw) {
    return {
      message: 'Empty response',
      data: undefined
    }
  }

  try {
    const parsed = JSON.parse(raw) as {
      error?: {
        message?: unknown
        name?: unknown
        code?: unknown
        status?: unknown
        config?: {
          url?: unknown
          method?: unknown
        }
      }
      message?: unknown
    }

    const upstreamError = parsed?.error
    const message =
      typeof upstreamError?.message === 'string'
        ? upstreamError.message
        : typeof parsed?.message === 'string'
          ? parsed.message
          : raw
    const code = typeof upstreamError?.code === 'string' ? upstreamError.code : undefined

    if (upstreamError && typeof upstreamError === 'object') {
      return {
        message,
        code,
        data: {
          error: {
            message,
            name: upstreamError.name,
            code,
            status: upstreamError.status,
            url: upstreamError.config?.url,
            method: upstreamError.config?.method
          }
        }
      }
    }
  } catch {
    // Keep the original text response for plain-text errors.
  }

  return {
    message: raw,
    data: raw
  }
}

export async function requestJson(
  port: number,
  endpoint: string,
  params: Record<string, unknown>,
  options: {
    method: 'GET' | 'POST'
    serviceName: string
  }
): Promise<unknown> {
  const http = await import('node:http')
  const normalizedEndpoint = endpoint.replace(/^\/+/, '')
  const query = options.method === 'GET' ? buildQueryString(params) : ''
  const path = `/${normalizedEndpoint}${query}`
  const body = options.method === 'POST' ? JSON.stringify(params) : null

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: LOCAL_SERVICE_HOST,
        port,
        path,
        method: options.method,
        timeout: LOCAL_SERVICE_TIMEOUT_MS,
        headers:
          body === null
            ? undefined
            : {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
              }
      },
      res => {
        let data = ''
        res.on('data', chunk => (data += chunk))
        res.on('end', () => {
          const status = typeof res.statusCode === 'number' ? res.statusCode : 500
          const contentTypeHeader = res.headers['content-type']
          const contentType = Array.isArray(contentTypeHeader)
            ? contentTypeHeader.join(', ')
            : String(contentTypeHeader ?? '')

          if (status < 200 || status >= 300) {
            const payload = parseErrorPayload(data)
            const error = new Error(
              `${options.serviceName} service request failed with status ${status}: ${payload.message}`
            ) as JsonHttpError
            if (payload.code) {
              error.code = payload.code
            }
            error.response = {
              status,
              data: payload.data
            }
            reject(error)
            return
          }

          if (data.length === 0) {
            resolve({})
            return
          }

          try {
            resolve(JSON.parse(data))
          } catch (parseError) {
            const error = new Error(
              `${options.serviceName} service returned invalid JSON (${contentType || 'unknown content type'}): ${
                parseError instanceof Error ? parseError.message : String(parseError)
              }`
            ) as JsonHttpError
            error.response = {
              status,
              data
            }
            reject(error)
          }
        })
      }
    )

    req.on('error', reject)
    req.on('timeout', () => {
      const error = new Error(
        `${options.serviceName} local service request timed out after ${LOCAL_SERVICE_TIMEOUT_MS}ms: ${path}`
      ) as JsonHttpError
      error.code = 'LOCAL_SERVICE_TIMEOUT'
      req.destroy(error)
    })

    if (body !== null) {
      req.write(body)
    }

    req.end()
  })
}
