import type {
  CreateSongUrlResultOptions,
  PluginCallErrorInstance,
  PluginCallErrorPayload,
  PluginSdkRuntime,
  StandardSongUrl
} from './types'

export class PluginCallError extends Error implements PluginCallErrorInstance {
  readonly code: string
  readonly retryable: boolean
  readonly userMessage?: string
  readonly details?: Record<string, unknown>

  constructor(payload: PluginCallErrorPayload)
  constructor(
    codeOrPayload: string | PluginCallErrorPayload,
    message?: string,
    options?: Omit<PluginCallErrorPayload, 'code' | 'message'>
  )
  toJSON(): PluginCallErrorPayload
}

export function createPluginCallError(
  codeOrPayload: string | PluginCallErrorPayload,
  message?: string,
  options?: Omit<PluginCallErrorPayload, 'code' | 'message'>
): PluginCallError

export function createSongUrlResult(
  url: string | null | undefined,
  options?: CreateSongUrlResultOptions
): StandardSongUrl

export function createPluginSdkRuntime(): PluginSdkRuntime

export const pluginSdkRuntime: PluginSdkRuntime
