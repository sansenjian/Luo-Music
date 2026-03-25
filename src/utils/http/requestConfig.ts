import { CACHE_DEFAULTS } from '../../../electron/shared/protocol/cache'
import {
  HTTP_DEFAULT_RETRY_COUNT,
  HTTP_DEFAULT_RETRY_DELAY,
  HTTP_DEFAULT_TIMEOUT
} from '@/constants/http'

interface CacheConfig {
  enabled: boolean
  ttl: number
  max_size: number
  methods: string[]
  cleanup_interval: number
}

interface RetryConfig {
  enabled: boolean
  max_retries: number
  initial_delay: number
  max_delay: number
  backoff: number
  statuses: Array<number | null>
  jitter: boolean
}

interface CancelConfig {
  enabled: boolean
  auto_cancel: boolean
  cancel_on_unmount: boolean
}

interface TimeoutConfig {
  default: number
  download: number
  upload: number
}

interface LoggingConfig {
  enabled: boolean
  level: 'debug' | 'info' | 'warn' | 'error'
  log_request: boolean
  log_response: boolean
  log_error: boolean
}

export interface RequestConfigType {
  cache: CacheConfig
  retry: RetryConfig
  cancel: CancelConfig
  timeout: TimeoutConfig
  logging: LoggingConfig
}

export type ConfigCategory = keyof RequestConfigType

const createDefaultConfig = (): RequestConfigType => ({
  cache: {
    enabled: true,
    ttl: CACHE_DEFAULTS.TTL,
    max_size: CACHE_DEFAULTS.MAX_SIZE,
    methods: ['get'],
    cleanup_interval: CACHE_DEFAULTS.CLEANUP_INTERVAL
  },
  retry: {
    enabled: true,
    max_retries: HTTP_DEFAULT_RETRY_COUNT,
    initial_delay: HTTP_DEFAULT_RETRY_DELAY,
    max_delay: 10000,
    backoff: 2,
    statuses: [null, 500, 502, 503, 504],
    jitter: true
  },
  cancel: {
    enabled: true,
    auto_cancel: true,
    cancel_on_unmount: true
  },
  timeout: {
    default: HTTP_DEFAULT_TIMEOUT,
    download: 60000,
    upload: 60000
  },
  logging: {
    enabled: true,
    level: 'warn',
    log_request: true,
    log_response: true,
    log_error: true
  }
})

export const RequestConfig: RequestConfigType = createDefaultConfig()

function isCategory(category: string): category is ConfigCategory {
  return category in RequestConfig
}

export function getCacheConfig(): CacheConfig {
  return { ...RequestConfig.cache }
}

export function getRetryConfig(): RetryConfig {
  return { ...RequestConfig.retry }
}

export function getCancelConfig(): CancelConfig {
  return { ...RequestConfig.cancel }
}

export function updateConfig(category: string, newConfig: unknown): void {
  if (!isCategory(category) || !newConfig || typeof newConfig !== 'object') {
    return
  }

  Object.assign(RequestConfig[category], newConfig)
}

export function resetConfig(category?: string): void {
  const defaults = createDefaultConfig()

  if (category && isCategory(category)) {
    Object.assign(RequestConfig[category], defaults[category])
    return
  }

  Object.assign(RequestConfig, defaults)
}

export function exportConfig(): RequestConfigType {
  return JSON.parse(JSON.stringify(RequestConfig)) as RequestConfigType
}

export function importConfig(config: unknown): void {
  if (!config || typeof config !== 'object') {
    return
  }

  const typedConfig = config as Partial<RequestConfigType>
  for (const key of Object.keys(typedConfig)) {
    if (!isCategory(key)) {
      continue
    }

    const value = typedConfig[key]
    if (value && typeof value === 'object') {
      Object.assign(RequestConfig[key], value)
    }
  }
}

export default RequestConfig
