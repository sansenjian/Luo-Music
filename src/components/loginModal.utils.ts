type LoginPayload = {
  unikey?: string
  qrimg?: string
  code?: number | string
  cookie?: string | string[]
  profile?: Record<string, unknown>
  data?: LoginPayload
  body?: LoginPayload
}

export type QrKeyResponse = LoginPayload
export type QrImageResponse = LoginPayload
export type QrCheckResponse = LoginPayload
export type UserAccountResponse = LoginPayload

function collectPayloads(response: LoginPayload | null | undefined): LoginPayload[] {
  if (!response || typeof response !== 'object') {
    return []
  }

  const payloads: LoginPayload[] = []

  for (const root of [response, response.body]) {
    let current = root
    let depth = 0

    while (current && typeof current === 'object' && depth < 4) {
      payloads.push(current)
      current = current.data
      depth += 1
    }
  }

  return payloads
}

function normalizeStringValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const parts = value.filter(
      (item): item is string => typeof item === 'string' && item.length > 0
    )
    return parts.join('; ')
  }

  return ''
}

function normalizeNumberLikeValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function extractQrKey(response: QrKeyResponse | null | undefined): string {
  const value = collectPayloads(response).find(
    payload => typeof payload.unikey === 'string'
  )?.unikey
  return normalizeStringValue(value)
}

export function extractQrImage(response: QrImageResponse | null | undefined): string {
  const value = collectPayloads(response).find(payload => typeof payload.qrimg === 'string')?.qrimg
  return normalizeStringValue(value)
}

export function extractQrStatusCode(response: QrCheckResponse | null | undefined): number | null {
  for (const payload of collectPayloads(response)) {
    const value = normalizeNumberLikeValue(payload.code)
    if (value !== null) {
      return value
    }
  }

  return null
}

export function extractQrCookie(response: QrCheckResponse | null | undefined): string {
  for (const payload of collectPayloads(response)) {
    const value = normalizeStringValue(payload.cookie)
    if (value) {
      return value
    }
  }

  return ''
}

export function extractUserProfile(
  response: UserAccountResponse | null | undefined
): Record<string, unknown> | null {
  for (const payload of collectPayloads(response)) {
    if (payload.profile && typeof payload.profile === 'object') {
      return payload.profile
    }
  }

  return null
}
