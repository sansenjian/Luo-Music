import type {
  CreateSongUrlResultOptions,
  PluginContext,
  PluginLogger,
  PluginStorage,
  PluginCallErrorPayload,
  RestrictedHttpClient,
  StandardSongUrl
} from './types'
import { PluginCallError } from './types'

export function createSongUrlResult(
  url: string | null | undefined,
  options: CreateSongUrlResultOptions = {}
): StandardSongUrl {
  if (!url) return { url: null }

  return {
    url,
    ...(options.mediaId !== undefined && options.mediaId !== null
      ? { mediaId: options.mediaId }
      : {}),
    ...(options.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}),
    ...(options.level ? { level: options.level } : {}),
    ...(options.bitrate !== undefined ? { bitrate: options.bitrate } : {})
  }
}

export function createPluginCallError(
  codeOrPayload: string | PluginCallErrorPayload,
  message?: string,
  options: Omit<PluginCallErrorPayload, 'code' | 'message'> = {}
): PluginCallError {
  const payload =
    typeof codeOrPayload === 'string'
      ? {
          code: codeOrPayload,
          message: message ?? 'Plugin call failed',
          ...options
        }
      : codeOrPayload

  return new PluginCallError(payload)
}

export function createPluginSdkRuntime() {
  return Object.freeze({
    PluginCallError,
    createPluginCallError,
    createSongUrlResult
  })
}

export const pluginSdkRuntime = createPluginSdkRuntime()

class InMemoryPluginStorage implements PluginStorage {
  private readonly values = new Map<string, unknown>()

  constructor(private readonly namespace: string) {}

  private resolveKey(key: string): string {
    return `${this.namespace}:${key}`
  }

  get<T = unknown>(key: string): T | undefined {
    return this.values.get(this.resolveKey(key)) as T | undefined
  }

  set<T = unknown>(key: string, value: T): void {
    this.values.set(this.resolveKey(key), value)
  }

  remove(key: string): void {
    this.values.delete(this.resolveKey(key))
  }

  clear(): void {
    this.values.clear()
  }
}

function createUnsupportedHttpClient(platformId: string): RestrictedHttpClient {
  const createError = () =>
    new Error(`HTTP access is unavailable in the local built-in runtime for "${platformId}"`)

  return {
    async get<T = unknown>(): Promise<T> {
      throw createError()
    },
    async post<T = unknown>(): Promise<T> {
      throw createError()
    }
  }
}

export function createConsolePluginLogger(platformId: string): PluginLogger {
  const prefix = `[plugin:${platformId}]`

  return {
    trace(message: string, meta?: Record<string, unknown>): void {
      console.debug(prefix, message, meta ?? {})
    },
    debug(message: string, meta?: Record<string, unknown>): void {
      console.debug(prefix, message, meta ?? {})
    },
    info(message: string, meta?: Record<string, unknown>): void {
      console.info(prefix, message, meta ?? {})
    },
    warn(message: string, meta?: Record<string, unknown>): void {
      console.warn(prefix, message, meta ?? {})
    },
    error(message: string, meta?: Record<string, unknown>): void {
      console.error(prefix, message, meta ?? {})
    }
  }
}

export function createPluginContext(
  platformId: string,
  options: {
    pluginId?: string
    settings?: Readonly<Record<string, unknown>>
    storage?: PluginStorage
    secrets?: PluginStorage
    http?: RestrictedHttpClient
    logger?: PluginLogger
  } = {}
): PluginContext {
  const pluginId = options.pluginId ?? platformId

  return {
    pluginId,
    platformId,
    settings: options.settings ?? {},
    storage: options.storage ?? new InMemoryPluginStorage(`plugin:${pluginId}:storage`),
    secrets: options.secrets ?? new InMemoryPluginStorage(`plugin:${pluginId}:secrets`),
    http: options.http ?? createUnsupportedHttpClient(platformId),
    logger: options.logger ?? createConsolePluginLogger(platformId),
    sdk: pluginSdkRuntime
  }
}
