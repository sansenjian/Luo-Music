const { EventEmitter } = require('node:events')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const {
  getDefaultAudioOutputHelperPath,
  prepareAudioOutputHelper
} = require('./audio-output-helper-path.cjs')
const { resolveReportPathFromEnv } = require('./audio-output-proof-dir.cjs')

const projectRoot = path.resolve(__dirname, '..')
const helperBinaryPath = getDefaultAudioOutputHelperPath({ projectRoot })
const protocolVersion = 2
const playbackStartedStates = new Set(['starting', 'playing', 'ended'])

function fail(message, error) {
  console.error(`[audio-output-format-matrix] ${message}`)
  if (error) {
    console.error(error)
  }
  process.exit(1)
}

function parseIntegerEnv(name, fallback) {
  const value = process.env[name]
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseVolumeEnv(name, fallback) {
  const value = process.env[name]
  if (!value) {
    return fallback
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback
}

function parseBooleanEnv(name, fallback = false) {
  const value = process.env[name]
  if (!value) {
    return fallback
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

function resolveReportPath() {
  return resolveReportPathFromEnv('LUO_AUDIO_OUTPUT_FORMAT_MATRIX_REPORT', 'format')
}

function writeReportIfRequested(report) {
  if (!report.reportPath) {
    return
  }

  fs.mkdirSync(path.dirname(report.reportPath), { recursive: true })
  fs.writeFileSync(report.reportPath, `${JSON.stringify(report, null, 2)}\n`)
}

function sendCommand(helper, command) {
  helper.stdin.write(`${JSON.stringify(command)}\n`)
}

function waitForEvent(events, predicate, label, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000
  const fromIndex = options.fromIndex ?? 0
  const existingEvent = events.history.slice(fromIndex).find(predicate)
  if (existingEvent) {
    return Promise.resolve(existingEvent)
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${label}`))
    }, timeoutMs)
    const onEvent = event => {
      if (!predicate(event)) {
        return
      }

      cleanup()
      resolve(event)
    }
    const cleanup = () => {
      clearTimeout(timeout)
      events.off('event', onEvent)
    }

    events.on('event', onEvent)
  })
}

function attachHelperEventParser(helper) {
  const events = new EventEmitter()
  events.history = []
  let buffer = ''

  helper.stdout.on('data', chunk => {
    buffer += String(chunk)
    for (;;) {
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex < 0) {
        break
      }

      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (!line) {
        continue
      }

      try {
        const event = JSON.parse(line)
        events.history.push(event)
        events.emit('event', event)
      } catch (error) {
        const event = {
          type: 'log',
          level: 'warn',
          message: `Ignored non-JSON helper stdout: ${line}; ${error.message}`
        }
        events.history.push(event)
        events.emit('event', event)
      }
    }
  })

  helper.stderr.on('data', chunk => {
    process.stderr.write(String(chunk))
  })

  return events
}

async function stopHelper(helper) {
  if (helper.exitCode !== null) {
    return
  }

  sendCommand(helper, { type: 'stopPlayback' })
  sendCommand(helper, { type: 'shutdown' })

  await new Promise(resolve => {
    const timeout = setTimeout(() => {
      helper.kill()
      resolve()
    }, 2_000)
    helper.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

function normalizeExtension(filePath) {
  return path.extname(filePath).toLowerCase()
}

function normalizeExtensionName(extension) {
  const normalized = String(extension || '')
    .trim()
    .toLowerCase()
  if (!normalized) {
    return ''
  }

  return normalized.startsWith('.') ? normalized : `.${normalized}`
}

function uniqueSortedExtensions(extensions) {
  return [...new Set(extensions.map(normalizeExtensionName).filter(Boolean))].sort()
}

function createFileIdentity(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    let byteSize = 0
    const stream = fs.createReadStream(filePath)

    stream.on('data', chunk => {
      byteSize += chunk.length
      hash.update(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      resolve({
        byteSize,
        sha256: hash.digest('hex')
      })
    })
  })
}

function createSampleCoverage(supportedExtensions, sampleResults) {
  const coverage = new Map()

  for (const extension of uniqueSortedExtensions(supportedExtensions)) {
    coverage.set(extension, {
      total: 0,
      started: 0,
      failed: 0
    })
  }

  for (const result of sampleResults) {
    const extension = normalizeExtensionName(result.extension)
    if (!extension) {
      continue
    }

    const entry =
      coverage.get(extension) ??
      {
        total: 0,
        started: 0,
        failed: 0
      }

    entry.total += 1
    if (result.status === 'started') {
      entry.started += 1
    } else {
      entry.failed += 1
    }
    coverage.set(extension, entry)
  }

  return Object.fromEntries([...coverage.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function parseExpectedExtensionsList(value) {
  if (!value) {
    return []
  }

  return uniqueSortedExtensions(String(value).split(/[,\s;]+/))
}

function readSampleManifest(manifestPath) {
  if (!manifestPath) {
    return { sampleManifestPath: undefined, expectedExtensions: [] }
  }

  const resolvedManifestPath = path.resolve(manifestPath)
  if (!fs.existsSync(resolvedManifestPath)) {
    fail(`LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_MANIFEST does not exist: ${resolvedManifestPath}`)
  }

  const parsed = JSON.parse(fs.readFileSync(resolvedManifestPath, 'utf8'))
  const extensions = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? parsed.expectedExtensions || parsed.requiredExtensions
      : undefined

  if (!Array.isArray(extensions)) {
    fail('LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_MANIFEST must be a JSON array or an object with expectedExtensions.')
  }

  return {
    sampleManifestPath: resolvedManifestPath,
    expectedExtensions: uniqueSortedExtensions(extensions)
  }
}

function resolveExpectedSampleConfig() {
  const manifest = readSampleManifest(process.env.LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_MANIFEST)
  const envExtensions = parseExpectedExtensionsList(
    process.env.LUO_AUDIO_OUTPUT_FORMAT_EXPECTED_EXTENSIONS
  )

  return {
    sampleManifestPath: manifest.sampleManifestPath,
    expectedExtensions: uniqueSortedExtensions([...manifest.expectedExtensions, ...envExtensions])
  }
}

function listSampleFiles(sampleDir, supportedExtensions) {
  if (!sampleDir) {
    return []
  }

  const resolvedSampleDir = path.resolve(sampleDir)
  if (!fs.existsSync(resolvedSampleDir) || !fs.statSync(resolvedSampleDir).isDirectory()) {
    fail(`LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_DIR must be an existing directory: ${resolvedSampleDir}`)
  }

  const supported = new Set(supportedExtensions.map(extension => extension.toLowerCase()))
  const samples = []
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(entryPath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const extension = normalizeExtension(entryPath)
      if (supported.has(extension)) {
        samples.push(entryPath)
      }
    }
  }
  visit(resolvedSampleDir)

  return samples.sort((left, right) => left.localeCompare(right))
}

async function verifySamplePlayback(helper, events, samplePath, options) {
  let fileIdentity
  try {
    fileIdentity = await createFileIdentity(samplePath)
  } catch (error) {
    return {
      path: samplePath,
      extension: normalizeExtension(samplePath),
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error)
    }
  }

  const fromIndex = events.history.length
  sendCommand(helper, {
    type: 'playFile',
    payload: {
      path: samplePath,
      startSeconds: 0,
      volume: options.volume
    }
  })

  try {
    const statusEvent = await waitForEvent(
      events,
      event =>
        event.type === 'status' &&
        event.payload?.nativePlaybackSource === samplePath &&
        (playbackStartedStates.has(event.payload?.nativePlaybackState) ||
          event.payload?.nativePlaybackState === 'error'),
      `format sample playback for ${samplePath}`,
      { fromIndex, timeoutMs: options.timeoutMs }
    )
    const status = statusEvent.payload
    const started = playbackStartedStates.has(status.nativePlaybackState)

    sendCommand(helper, { type: 'stopPlayback' })
    await waitForEvent(
      events,
      event => event.type === 'status' && event.payload?.nativePlaybackState === 'stopped',
      `stop playback for ${samplePath}`,
      { fromIndex: events.history.length, timeoutMs: 5_000 }
    ).catch(() => undefined)

    return {
      path: samplePath,
      extension: normalizeExtension(samplePath),
      ...fileIdentity,
      status: started ? 'started' : 'failed',
      nativePlaybackState: status.nativePlaybackState,
      activeMode: status.activeMode,
      reason: status.reason
    }
  } catch (error) {
    sendCommand(helper, { type: 'stopPlayback' })
    return {
      path: samplePath,
      extension: normalizeExtension(samplePath),
      ...fileIdentity,
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error)
    }
  }
}

function createReport(status, sampleResults, sampleDir, reportPath, options = {}) {
  const supportedExtensions = [...(status.supportedExtensions ?? [])].sort()
  const supportedModes = [...(status.supportedModes ?? [])].sort()
  const sampledExtensions = [...new Set(sampleResults.map(result => result.extension))].sort()
  const startedSampleExtensions = uniqueSortedExtensions(
    sampleResults.filter(result => result.status === 'started').map(result => result.extension)
  )
  const failedSampleExtensions = uniqueSortedExtensions(
    sampleResults.filter(result => result.status !== 'started').map(result => result.extension)
  )
  const expectedExtensions = uniqueSortedExtensions(options.expectedExtensions ?? [])
  const unsupportedExpectedExtensions = expectedExtensions.filter(
    extension => !supportedExtensions.includes(extension)
  )
  const missingSampleExtensions = sampleDir
    ? supportedExtensions.filter(extension => !sampledExtensions.includes(extension))
    : supportedExtensions
  const missingExpectedSampleExtensions = expectedExtensions.filter(
    extension => !sampledExtensions.includes(extension)
  )
  const missingRequiredSampleExtensions = uniqueSortedExtensions([
    ...missingExpectedSampleExtensions,
    ...(options.requireAllSamples ? missingSampleExtensions : [])
  ])
  const requiredSampleExtensions = uniqueSortedExtensions([
    ...expectedExtensions,
    ...(options.requireAllSamples ? supportedExtensions : [])
  ])
  const failedRequiredSampleExtensions = failedSampleExtensions.filter(extension =>
    requiredSampleExtensions.includes(extension)
  )
  const needsSampleCoverage = expectedExtensions.length > 0 || options.requireAllSamples === true
  const verdict = !sampleDir
    ? needsSampleCoverage
      ? 'missing-samples'
      : 'manifest-only'
    : unsupportedExpectedExtensions.length > 0
      ? 'unsupported-expected-formats'
      : failedRequiredSampleExtensions.length > 0
        ? 'sample-failures'
        : missingRequiredSampleExtensions.length > 0
          ? 'missing-samples'
          : 'samples-started'

  return {
    verdict,
    proof: sampleDir ? 'format-sample-startup' : 'format-capability-manifest',
    platform: process.platform,
    helperPath: options.helperPath ?? helperBinaryPath,
    helperPathSource: options.helperPathSource ?? 'debug-build',
    reportPath: reportPath ?? undefined,
    supportedExtensions,
    supportedModes,
    optionalExtensions: {
      opus: supportedExtensions.includes('.opus'),
      webm: supportedExtensions.includes('.webm')
    },
    platformModeCapabilities: {
      shared: supportedModes.includes('shared'),
      exclusive: supportedModes.includes('exclusive'),
      voicemeeter: supportedModes.includes('voicemeeter')
    },
    sampleDir: sampleDir ? path.resolve(sampleDir) : undefined,
    sampleManifestPath: options.sampleManifestPath,
    expectedExtensions,
    requireAllSamples: options.requireAllSamples === true,
    sampledExtensions,
    startedSampleExtensions,
    failedSampleExtensions,
    missingSampleExtensions,
    missingExpectedSampleExtensions,
    missingRequiredSampleExtensions,
    failedRequiredSampleExtensions,
    unsupportedExpectedExtensions,
    completeSampleCoverage: sampleDir ? missingSampleExtensions.length === 0 : false,
    sampleCoverage: createSampleCoverage(supportedExtensions, sampleResults),
    samples: sampleResults,
    missingProof: sampleDir
      ? [
          'sample startup proves helper decode/playback initialization, not complete full-track playback',
          ...(missingSampleExtensions.length > 0
            ? ['formats without sample files remain unverified on this machine']
            : []),
          ...(needsSampleCoverage
            ? []
            : [
                'set LUO_AUDIO_OUTPUT_FORMAT_REQUIRE_ALL_SAMPLES, LUO_AUDIO_OUTPUT_FORMAT_EXPECTED_EXTENSIONS, or LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_MANIFEST to make missing samples fail the run'
              ])
        ]
      : [
          'set LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_DIR to a directory of known-good audio samples to verify real decode/playback startup',
          'manifest-only mode does not prove actual sample playback'
        ]
  }
}

async function main() {
  const helperInfo = prepareAudioOutputHelper({ projectRoot })

  const deviceId = process.env.LUO_AUDIO_OUTPUT_TEST_DEVICE_ID || ''
  const bufferFrames = parseIntegerEnv('LUO_AUDIO_OUTPUT_TEST_BUFFER_FRAMES', 960)
  const timeoutMs = parseIntegerEnv('LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_TIMEOUT_MS', 15_000)
  const volume = parseVolumeEnv('LUO_AUDIO_OUTPUT_FORMAT_VOLUME', 0)
  const sampleDir = process.env.LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_DIR || ''
  const expectedSampleConfig = resolveExpectedSampleConfig()
  const requireAllSamples = parseBooleanEnv('LUO_AUDIO_OUTPUT_FORMAT_REQUIRE_ALL_SAMPLES', false)
  const reportPath = resolveReportPath()
  const helper = spawn(helperInfo.helperPath, [], {
    cwd: projectRoot,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  })
  const events = attachHelperEventParser(helper)

  try {
    await waitForEvent(events, event => event.type === 'ready', 'helper ready')
    sendCommand(helper, {
      type: 'initialize',
      payload: { protocolVersion }
    })
    await waitForEvent(events, event => event.type === 'status', 'initial status')
    const afterInitializeIndex = events.history.length
    sendCommand(helper, {
      type: 'configure',
      payload: {
        enabled: true,
        settings: {
          mode: 'shared',
          sharedDeviceId: deviceId,
          deviceId,
          bufferFrames,
          fallbackToShared: true,
          voicemeeterBus: 'A1',
          diagnosticsEnabled: true
        }
      }
    })
    const configureEvent = await waitForEvent(
      events,
      event => event.type === 'status' && Array.isArray(event.payload?.supportedExtensions),
      'format capability status',
      { fromIndex: afterInitializeIndex }
    )
    const supportedExtensions = configureEvent.payload.supportedExtensions ?? []
    const sampleFiles = listSampleFiles(sampleDir, supportedExtensions)
    const sampleResults = []

    for (const samplePath of sampleFiles) {
      sampleResults.push(
        await verifySamplePlayback(helper, events, samplePath, {
          timeoutMs,
          volume
        })
      )
    }

    const report = createReport(configureEvent.payload, sampleResults, sampleDir, reportPath, {
      ...expectedSampleConfig,
      helperPath: helperInfo.helperPath,
      helperPathSource: helperInfo.helperPathSource,
      requireAllSamples
    })
    writeReportIfRequested(report)
    console.log(JSON.stringify(report, null, 2))

    if (['missing-samples', 'sample-failures', 'unsupported-expected-formats'].includes(report.verdict)) {
      process.exitCode = 2
    }
  } finally {
    await stopHelper(helper)
  }
}

if (require.main === module) {
  main().catch(error => {
    fail(error?.message || 'Format matrix verification failed.', error)
  })
}

module.exports = {
  createFileIdentity,
  createSampleCoverage,
  createReport,
  parseExpectedExtensionsList,
  resolveExpectedSampleConfig,
  uniqueSortedExtensions
}
