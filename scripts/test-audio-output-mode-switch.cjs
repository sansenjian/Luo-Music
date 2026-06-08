const { EventEmitter } = require('node:events')
const { createHash } = require('node:crypto')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  getDefaultAudioOutputHelperPath,
  prepareAudioOutputHelper
} = require('./audio-output-helper-path.cjs')
const { resolveReportPathFromEnv } = require('./audio-output-proof-dir.cjs')

const projectRoot = path.resolve(__dirname, '..')
const helperBinaryPath = getDefaultAudioOutputHelperPath({ projectRoot })
const protocolVersion = 2
const defaultModeSwitchSequence = ['shared', 'exclusive', 'voicemeeter', 'shared']
const playbackStartedStates = new Set(['starting', 'playing', 'ended'])
const playbackTerminalStates = new Set(['idle', 'stopped', 'ended', 'error'])
const playbackLiveStates = new Set(['starting', 'playing', 'paused'])

function fail(message, error) {
  console.error(`[audio-output-mode-switch] ${message}`)
  if (error) {
    console.error(error)
  }
  process.exit(1)
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
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

function normalizeMode(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (normalized === 'shared' || normalized === 'exclusive' || normalized === 'voicemeeter') {
    return normalized
  }

  return null
}

function normalizeModeSwitchSequence(value) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[,\s;>]+/)
        .filter(Boolean)
  const modes = rawItems.map(normalizeMode).filter(Boolean)

  return modes.length > 0 ? modes : [...defaultModeSwitchSequence]
}

function normalizeVoicemeeterBus(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
  return ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'].includes(normalized) ? normalized : 'A1'
}

function normalizeVoicemeeterHardwareOutBus(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
  return ['A1', 'A2', 'A3'].includes(normalized) ? normalized : 'A1'
}

function normalizeVoicemeeterHardwareOutDriver(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ['wdm', 'mme', 'ks', 'asio'].includes(normalized) ? normalized : 'wdm'
}

function resolveReportPath() {
  return resolveReportPathFromEnv('LUO_AUDIO_OUTPUT_MODE_SWITCH_REPORT', 'modeSwitch')
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
        event.index = events.history.length
        events.history.push(event)
        events.emit('event', event)
      } catch (error) {
        const event = {
          index: events.history.length,
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
  if (!helper || helper.exitCode !== null) {
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

function createTinyWavBuffer() {
  const sampleRate = 44_100
  const channels = 1
  const bitsPerSample = 16
  const frames = 22_050
  const blockAlign = (channels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign
  const dataSize = frames * blockAlign
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  return buffer
}

function createSettingsForMode(mode, options) {
  return {
    mode,
    sharedDeviceId: mode === 'shared' ? options.deviceId : '',
    deviceId: options.deviceId,
    bufferFrames: options.bufferFrames,
    fallbackToShared: mode === 'shared',
    bitPerfectRequired: false,
    voicemeeterBus: options.voicemeeterBus,
    voicemeeterHardwareOutBus: options.voicemeeterHardwareOutBus,
    voicemeeterHardwareOutDriver: options.voicemeeterHardwareOutDriver,
    voicemeeterHardwareOutDevice: options.voicemeeterHardwareOutDevice,
    diagnosticsEnabled: true
  }
}

function getPlaybackDetails(event) {
  if (event?.type === 'status') {
    const payload = event.payload ?? {}
    return {
      eventIndex: event.index,
      eventType: event.type,
      state: payload.nativePlaybackState,
      running: payload.nativePlaybackRunning,
      source: payload.nativePlaybackSource,
      token: payload.nativePlaybackToken,
      requestedMode: payload.requestedMode,
      activeMode: payload.activeMode,
      reason: payload.reason,
      nativePlaybackError: payload.nativePlaybackError
    }
  }

  if (event?.type === 'playback') {
    const payload = event.payload ?? {}
    return {
      eventIndex: event.index,
      eventType: event.type,
      state: payload.state,
      running: payload.running,
      source: payload.source,
      token: payload.playbackToken,
      requestedMode: undefined,
      activeMode: undefined,
      reason: payload.reason,
      nativePlaybackError: payload.nativePlaybackError
    }
  }

  return null
}

function eventMatchesPlaybackIdentity(event, step) {
  const details = getPlaybackDetails(event)
  if (!details) {
    return false
  }

  return Boolean(
    (details.token && details.token === step.playbackToken) ||
      (details.source && details.source === step.sample.path)
  )
}

function summarizePlaybackEvent(event) {
  const details = getPlaybackDetails(event)
  if (!details) {
    return {
      eventIndex: event?.index,
      eventType: event?.type
    }
  }

  return details
}

function findTransitionFindings(events, steps) {
  const staleEventFindings = []
  const doublePlaybackFindings = []

  for (let index = 0; index < steps.length - 1; index += 1) {
    const previousStep = steps[index]
    const nextStep = steps[index + 1]
    const scanFromIndex =
      nextStep.playEventIndex ??
      nextStep.playCommandIndex ??
      nextStep.configureCommandIndex ??
      0
    const eventsAfterNextStart = events.history.slice(scanFromIndex)

    for (const event of eventsAfterNextStart) {
      if (!eventMatchesPlaybackIdentity(event, previousStep)) {
        continue
      }

      const details = summarizePlaybackEvent(event)
      const finding = {
        previousMode: previousStep.mode,
        nextMode: nextStep.mode,
        previousPlaybackToken: previousStep.playbackToken,
        previousSource: previousStep.sample.path,
        ...details
      }

      if (playbackLiveStates.has(details.state)) {
        doublePlaybackFindings.push(finding)
      } else if (playbackTerminalStates.has(details.state)) {
        staleEventFindings.push(finding)
      }
    }
  }

  return {
    staleEventFindings,
    doublePlaybackFindings
  }
}

function createReport(sequence, steps, events, reportPath, options = {}) {
  const findings = findTransitionFindings(events, steps)
  const allModesAttempted = steps.length === sequence.length
  const allModesStarted = allModesAttempted && steps.every(step => step.started)
  const noDoublePlaybackFindings = findings.doublePlaybackFindings.length === 0
  const verdict = allModesStarted && noDoublePlaybackFindings ? 'switched' : 'not-switched'
  const failedSteps = steps.filter(step => !step.started)
  const unattemptedModes = sequence.slice(steps.length)
  const helperEventTail = events.history.slice(-12).map(event => {
    if (event.type !== 'status' && event.type !== 'playback' && event.type !== 'error') {
      return {
        eventIndex: event.index,
        type: event.type
      }
    }

    return {
      eventIndex: event.index,
      type: event.type,
      payload: event.payload,
      message: event.message
    }
  })

  return {
    verdict,
    proof: 'native-mode-switch-sequence',
    platform: process.platform,
    helperPath: options.helperPath ?? helperBinaryPath,
    helperPathSource: options.helperPathSource ?? 'debug-build',
    reportPath: reportPath ?? undefined,
    sequence,
    deviceId: options.deviceId,
    bufferFrames: options.bufferFrames,
    volume: options.volume,
    voicemeeterBus: options.voicemeeterBus,
    voicemeeterHardwareOut: {
      bus: options.voicemeeterHardwareOutBus,
      driver: options.voicemeeterHardwareOutDriver,
      device: options.voicemeeterHardwareOutDevice
    },
    sample: options.sample,
    steps,
    helperEventCount: events.history.length,
    helperEventTail,
    staleEventFindings: findings.staleEventFindings,
    doublePlaybackFindings: findings.doublePlaybackFindings,
    ...(unattemptedModes.length > 0 ? { unattemptedModes } : {}),
    missingProof: [
      'This verifies helper-level mode transition startup and stale-event evidence on this machine only.',
      'It does not prove Electron UI switching, manual Voicemeeter audibility, online URL refresh, or bit-perfect loopback/DAC output.'
    ],
    ...(failedSteps.length > 0
      ? {
          failedSteps: failedSteps.map(step => ({
            mode: step.mode,
            playbackToken: step.playbackToken,
            configureError: step.configureError,
            reason: step.reason,
            nativePlaybackError: step.nativePlaybackError,
            nativePlaybackState: step.nativePlaybackState,
            requestedMode: step.requestedMode,
            activeMode: step.activeMode
          }))
        }
      : {})
  }
}

function createSkippedReport(reportPath, platform = process.platform) {
  return {
    verdict: 'skipped',
    proof: 'native-mode-switch-sequence',
    platform,
    reportPath: reportPath ?? undefined,
    reason: 'Native mode switching across shared/exclusive/voicemeeter is Windows-only.'
  }
}

async function runModeStep(helper, events, mode, index, samplePath, options) {
  const playbackToken = `mode-switch-${Date.now()}-${index}-${mode}`
  const configureCommandIndex = events.history.length

  sendCommand(helper, {
    type: 'configure',
    payload: {
      enabled: true,
      settings: createSettingsForMode(mode, options)
    }
  })

  let configureEvent = null
  let configureError = null
  try {
    configureEvent = await waitForEvent(
      events,
      event =>
        event.type === 'status' &&
        event.payload?.requestedMode === mode &&
        Array.isArray(event.payload?.supportedModes),
      `${mode} configure status`,
      {
        fromIndex: configureCommandIndex,
        timeoutMs: mode === 'voicemeeter' ? Math.max(options.timeoutMs, 30_000) : options.timeoutMs
      }
    )
  } catch (error) {
    configureError = error instanceof Error ? error.message : String(error)
  }

  if (!configureEvent) {
    return {
      mode,
      configureCommandIndex,
      playbackToken,
      sample: {
        path: samplePath,
        byteSize: options.sample.byteSize,
        sha256: options.sample.sha256
      },
      started: false,
      configureError,
      reason: configureError ?? `No ${mode} configure status was received.`
    }
  }

  const playCommandIndex = events.history.length
  sendCommand(helper, {
    type: 'playFile',
    payload: {
      path: samplePath,
      startSeconds: 0,
      volume: options.volume,
      playbackToken
    }
  })

  let playEvent
  let playError = null
  try {
    playEvent = await waitForEvent(
      events,
      event =>
        event.type === 'status' &&
        event.payload?.nativePlaybackSource === samplePath &&
        event.payload?.nativePlaybackToken === playbackToken &&
        (playbackStartedStates.has(event.payload?.nativePlaybackState) ||
          event.payload?.nativePlaybackState === 'error'),
      `${mode} playback status`,
      { fromIndex: playCommandIndex, timeoutMs: options.timeoutMs }
    )
  } catch (error) {
    playError = error instanceof Error ? error.message : String(error)
  }

  const playStatus = playEvent?.payload
  const started =
    Boolean(playStatus) &&
    playbackStartedStates.has(playStatus.nativePlaybackState) &&
    playStatus.requestedMode === mode &&
    playStatus.activeMode === mode
  const stopCommandIndex = events.history.length
  sendCommand(helper, { type: 'stopPlayback' })

  let stopEvent = null
  let stopError = null
  try {
    stopEvent = await waitForEvent(
      events,
      event =>
        event.type === 'status' &&
        playbackTerminalStates.has(event.payload?.nativePlaybackState),
      `${mode} terminal playback status`,
      { fromIndex: stopCommandIndex, timeoutMs: 5_000 }
    )
  } catch (error) {
    stopError = error instanceof Error ? error.message : String(error)
  }

  return {
    mode,
    configureCommandIndex,
    configureEventIndex: configureEvent.index,
    playCommandIndex,
    playEventIndex: playEvent?.index,
    stopCommandIndex,
    stopEventIndex: stopEvent?.index,
    playbackToken,
    sample: {
      path: samplePath,
      byteSize: options.sample.byteSize,
      sha256: options.sample.sha256
    },
    started,
    requestedMode: playStatus?.requestedMode,
    activeMode: playStatus?.activeMode,
    nativePlaybackState: playStatus?.nativePlaybackState,
    nativePlaybackSource: playStatus?.nativePlaybackSource,
    nativePlaybackToken: playStatus?.nativePlaybackToken,
    nativePlaybackError: playStatus?.nativePlaybackError,
    configureError,
    reason: playError ?? playStatus?.reason,
    configureStatus: configureEvent.payload,
    playStatus,
    stopStatus: stopEvent?.payload,
    stopError
  }
}

async function main() {
  const reportPath = resolveReportPath()

  if (process.platform !== 'win32') {
    const report = createSkippedReport(reportPath)
    writeReportIfRequested(report)
    console.log(JSON.stringify(report, null, 2))
    return
  }

  const helperInfo = prepareAudioOutputHelper({ projectRoot })

  const sequence = normalizeModeSwitchSequence(process.env.LUO_AUDIO_OUTPUT_MODE_SWITCH_SEQUENCE)
  const deviceId = process.env.LUO_AUDIO_OUTPUT_TEST_DEVICE_ID || ''
  const bufferFrames = parseIntegerEnv('LUO_AUDIO_OUTPUT_TEST_BUFFER_FRAMES', 960)
  const timeoutMs = parseIntegerEnv('LUO_AUDIO_OUTPUT_MODE_SWITCH_TIMEOUT_MS', 15_000)
  const volume = parseVolumeEnv('LUO_AUDIO_OUTPUT_MODE_SWITCH_VOLUME', 0)
  const voicemeeterBus = normalizeVoicemeeterBus(
    process.env.LUO_AUDIO_OUTPUT_VOICEMEETER_BUS || 'A1'
  )
  const voicemeeterHardwareOutBus = normalizeVoicemeeterHardwareOutBus(
    process.env.LUO_AUDIO_OUTPUT_VOICEMEETER_HARDWARE_OUT_BUS || 'A1'
  )
  const voicemeeterHardwareOutDriver = normalizeVoicemeeterHardwareOutDriver(
    process.env.LUO_AUDIO_OUTPUT_VOICEMEETER_HARDWARE_OUT_DRIVER || 'wdm'
  )
  const voicemeeterHardwareOutDevice =
    process.env.LUO_AUDIO_OUTPUT_VOICEMEETER_HARDWARE_OUT_DEVICE || ''
  const wavBuffer = createTinyWavBuffer()
  const sample = {
    byteSize: wavBuffer.length,
    sha256: sha256(wavBuffer)
  }
  const sampleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luo-mode-switch-'))
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

    const options = {
      deviceId,
      bufferFrames,
      timeoutMs,
      volume,
      voicemeeterBus,
      voicemeeterHardwareOutBus,
      voicemeeterHardwareOutDriver,
      voicemeeterHardwareOutDevice,
      sample
    }
    const steps = []

    for (const [index, mode] of sequence.entries()) {
      const samplePath = path.join(sampleDir, `mode-switch-${index}-${mode}.wav`)
      fs.writeFileSync(samplePath, wavBuffer)
      const step = await runModeStep(helper, events, mode, index, samplePath, options)
      steps.push(step)
      if (step.configureError) {
        break
      }
    }

    const report = createReport(sequence, steps, events, reportPath, {
      ...options,
      helperPath: helperInfo.helperPath,
      helperPathSource: helperInfo.helperPathSource,
      sample: {
        ...sample,
        directory: sampleDir
      }
    })
    writeReportIfRequested(report)
    console.log(JSON.stringify(report, null, 2))

    if (report.verdict !== 'switched') {
      process.exitCode = 2
    }
  } finally {
    await stopHelper(helper)
  }
}

if (require.main === module) {
  main().catch(error => {
    fail(error?.message || 'Mode switch verification failed.', error)
  })
}

module.exports = {
  createReport,
  createSkippedReport,
  createSettingsForMode,
  createTinyWavBuffer,
  findTransitionFindings,
  normalizeModeSwitchSequence,
  normalizeVoicemeeterBus,
  normalizeVoicemeeterHardwareOutBus,
  normalizeVoicemeeterHardwareOutDriver
}
