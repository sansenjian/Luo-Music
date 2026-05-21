export class PluginCallError extends Error {
  constructor(codeOrPayload, message, options = {}) {
    const payload =
      codeOrPayload && typeof codeOrPayload === 'object'
        ? codeOrPayload
        : { code: codeOrPayload, message, ...options }

    super(String(payload.message ?? 'Plugin call failed'))
    this.name = 'PluginCallError'
    this.code = String(payload.code ?? 'PLUGIN_ERROR')
    this.retryable = Boolean(payload.retryable)
    this.userMessage = typeof payload.userMessage === 'string' ? payload.userMessage : undefined
    this.details =
      payload.details && typeof payload.details === 'object' && !Array.isArray(payload.details)
        ? payload.details
        : undefined
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      userMessage: this.userMessage,
      details: this.details
    }
  }
}

export function createPluginCallError(codeOrPayload, message, options = {}) {
  return new PluginCallError(codeOrPayload, message, options)
}

export function createSongUrlResult(url, options = {}) {
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

export function createPluginSdkRuntime() {
  return Object.freeze({
    PluginCallError,
    createPluginCallError,
    createSongUrlResult
  })
}

export const pluginSdkRuntime = createPluginSdkRuntime()
