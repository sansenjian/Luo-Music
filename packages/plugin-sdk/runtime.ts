import type { PluginContext, PluginLogger, PluginStorage, RestrictedHttpClient } from './types'

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
    logger: options.logger ?? createConsolePluginLogger(platformId)
  }
}
