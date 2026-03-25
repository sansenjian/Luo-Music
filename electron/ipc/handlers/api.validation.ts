import logger from '../../logger'
import type { MusicPlatform } from './api.contract'

const ALLOWED_SERVICES: readonly string[] = ['netease', 'qq'] as const

const PARAM_VALIDATORS = {
  keyword: (v: unknown): boolean => typeof v === 'string' && v.length > 0 && v.length <= 100,
  id: (v: unknown): boolean => typeof v === 'string' || typeof v === 'number',
  page: (v: unknown): boolean => typeof v === 'number' && v > 0 && v <= 100,
  limit: (v: unknown): boolean => typeof v === 'number' && v > 0 && v <= 100,
  quality: (v: unknown): boolean => typeof v === 'number' && v > 0,
  platform: (v: unknown): boolean => v === undefined || v === 'netease' || v === 'qq',
  type: (v: unknown): boolean => v === undefined || typeof v === 'string'
} as const

// eslint-disable-next-line no-control-regex
const DANGEROUS_PATTERNS = /[<>:"|?*\x00-\x1f]|\.\./

export function resolvePlatform(platform?: string): MusicPlatform {
  return platform === 'qq' ? 'qq' : 'netease'
}

export function normalizeEndpoint(endpoint: string): string {
  let normalized = endpoint.replace(/^\/+/, '')

  try {
    normalized = decodeURIComponent(normalized)
  } catch {
    // keep original value when decode fails
  }

  if (DANGEROUS_PATTERNS.test(normalized)) {
    logger.warn(`[API Gateway] Blocked potentially dangerous endpoint: ${endpoint}`)
    return ''
  }

  return normalized.replace(/^\/+/, '')
}

export function validateService(service: unknown): { valid: boolean; error?: string } {
  if (typeof service !== 'string') {
    return { valid: false, error: 'Service must be a string' }
  }
  if (!ALLOWED_SERVICES.includes(service)) {
    return { valid: false, error: `Invalid service: ${service}. Allowed: ${ALLOWED_SERVICES.join(', ')}` }
  }
  return { valid: true }
}

export function validateEndpoint(
  endpoint: unknown
): { valid: boolean; error?: string; normalized?: string } {
  if (typeof endpoint !== 'string') {
    return { valid: false, error: 'Endpoint must be a string' }
  }

  if (endpoint.length === 0) {
    return { valid: false, error: 'Endpoint cannot be empty' }
  }

  const normalized = normalizeEndpoint(endpoint)
  if (!normalized) {
    return { valid: false, error: 'Invalid endpoint: contains dangerous characters' }
  }

  if (normalized.length > 200) {
    return { valid: false, error: 'Endpoint too long' }
  }

  return { valid: true, normalized }
}

export function validateParams(
  params: unknown,
  requiredKeys: readonly (keyof typeof PARAM_VALIDATORS)[] = []
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (params !== undefined && typeof params !== 'object') {
    return { valid: false, errors: ['Params must be an object'] }
  }

  const typedParams = params as Record<string, unknown> | undefined

  for (const key of requiredKeys) {
    const validator = PARAM_VALIDATORS[key]
    const value = typedParams?.[key]
    if (value === undefined) {
      errors.push(`Missing required parameter: ${key}`)
    } else if (validator && !validator(value)) {
      errors.push(`Invalid parameter: ${key}`)
    }
  }

  if (typedParams) {
    for (const [key, validator] of Object.entries(PARAM_VALIDATORS)) {
      const value = typedParams[key]
      if (value !== undefined && !validator(value)) {
        errors.push(`Invalid parameter: ${key}`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
