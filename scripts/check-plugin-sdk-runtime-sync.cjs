const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const vm = require('node:vm')

function getWorkerRuntimeSource(rootDir = process.cwd()) {
  const source = readFileSync(join(rootDir, 'electron/plugins/externalPluginWorker.mjs'), 'utf8')
  const start = source.indexOf('class PluginCallError')
  const end = source.indexOf('function serializeError')

  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Unable to locate plugin SDK runtime helpers in externalPluginWorker.mjs')
  }

  return `${source.slice(start, end)}
globalThis.workerPluginSdkRuntime = createPluginSdkRuntime();`
}

function createWorkerRuntime(rootDir = process.cwd()) {
  const context = vm.createContext({})
  vm.runInContext(getWorkerRuntimeSource(rootDir), context)
  return context.workerPluginSdkRuntime
}

function normalizeError(error) {
  return {
    name: error.name,
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    userMessage: error.userMessage,
    details: error.details,
    json: typeof error.toJSON === 'function' ? error.toJSON() : undefined
  }
}

function checkPluginSdkRuntimeSync(sdkRuntime, rootDir = process.cwd()) {
  const workerRuntime = createWorkerRuntime(rootDir)
  const sdkRuntimeKeys = Object.keys(sdkRuntime).sort()
  const workerRuntimeKeys = Object.keys(workerRuntime).sort()
  const keyErrors =
    JSON.stringify(sdkRuntimeKeys) === JSON.stringify(workerRuntimeKeys)
      ? []
      : [
          `plugin SDK runtime helper keys mismatch: SDK=${JSON.stringify(
            sdkRuntimeKeys
          )}, worker=${JSON.stringify(workerRuntimeKeys)}`
        ]
  const cases = [
    runtime => runtime.createSongUrlResult(null),
    runtime =>
      runtime.createSongUrlResult('https://example.test/song.mp3', {
        mediaId: 0,
        expiresAt: 0,
        level: 'lossless',
        bitrate: 999000
      }),
    runtime =>
      normalizeError(
        runtime.createPluginCallError('AUTH_REQUIRED', 'Auth required', {
          retryable: false,
          userMessage: '请先登录',
          details: { method: 'library.getLikedSongs' }
        })
      ),
    runtime =>
      normalizeError(
        new runtime.PluginCallError({
          code: 'PARSE_ERROR',
          message: 'Bad response',
          retryable: true,
          userMessage: '响应解析失败',
          details: { endpoint: '/song/url/v1' }
        })
      )
  ]

  return [
    ...keyErrors,
    ...cases.flatMap((createResult, index) => {
      const sdkValue = createResult(sdkRuntime)
      const workerValue = createResult(workerRuntime)

      if (JSON.stringify(sdkValue) === JSON.stringify(workerValue)) {
        return []
      }

      return [
        `plugin SDK runtime helper mismatch at case ${index + 1}: SDK=${JSON.stringify(
          sdkValue
        )}, worker=${JSON.stringify(workerValue)}`
      ]
    })
  ]
}

module.exports = {
  checkPluginSdkRuntimeSync,
  createWorkerRuntime,
  getWorkerRuntimeSource
}
