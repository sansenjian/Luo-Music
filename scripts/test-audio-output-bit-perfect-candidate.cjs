const { EventEmitter } = require('node:events')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { prepareAudioOutputHelper } = require('./audio-output-helper-path.cjs')
const { resolveReportPathFromEnv } = require('./audio-output-proof-dir.cjs')

const projectRoot = path.resolve(__dirname, '..')
const protocolVersion = 2
const playbackDiagnosticStates = new Set(['starting', 'playing', 'paused', 'ended'])
const autoWavEnv = 'LUO_AUDIO_OUTPUT_BIT_PERFECT_AUTO_WAV'
const autoWavPathEnv = 'LUO_AUDIO_OUTPUT_BIT_PERFECT_AUTO_WAV_PATH'

function fail(message, error) {
  console.error(`[audio-output-bit-perfect] ${message}`)
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

function parseBooleanEnv(name, fallback, env = process.env) {
  const value = env[name]
  if (!value) {
    return fallback
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => {
      hash.update(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      resolve(hash.digest('hex'))
    })
  })
}

function resolveReportPath() {
  return resolveReportPathFromEnv('LUO_AUDIO_OUTPUT_BIT_PERFECT_REPORT', 'bitPerfect')
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

function normalizeWaitOptions(options) {
  if (typeof options === 'number') {
    return {
      timeoutMs: options,
      fromIndex: 0
    }
  }

  return {
    timeoutMs: options.timeoutMs ?? 15_000,
    fromIndex: options.fromIndex ?? 0
  }
}

function waitForEvent(events, predicate, label, options = {}) {
  const { timeoutMs, fromIndex } = normalizeWaitOptions(options)
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

function createBitPerfectCandidateWavBuffer(options) {
  const sampleRate = Math.max(1, Math.floor(options.sampleRate))
  const channels = Math.max(1, Math.floor(options.channels))
  const bitDepth = Math.floor(options.bitDepth)
  const sampleFormat = normalizeAutoWavSampleFormat(options.sampleFormat)
  if (!Number.isInteger(bitDepth) || bitDepth <= 0) {
    throw new Error(`Unsupported auto WAV bit depth: ${options.bitDepth}`)
  }
  if (sampleFormat === 'float' && bitDepth !== 32) {
    throw new Error(`Unsupported auto WAV float bit depth: ${bitDepth}`)
  }
  if (sampleFormat === 'pcm' && ![16, 24, 32].includes(bitDepth)) {
    throw new Error(`Unsupported auto WAV PCM bit depth: ${bitDepth}`)
  }

  const durationSeconds = Number.isFinite(options.durationSeconds)
    ? Math.max(0.05, options.durationSeconds)
    : 0.5
  const frames = Math.max(1, Math.floor(sampleRate * durationSeconds))
  const bytesPerSample = bitDepth / 8
  const blockAlign = channels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = frames * blockAlign
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(sampleFormat === 'float' ? 3 : 1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitDepth, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  const frequencyHz = 997
  let offset = 44
  for (let frame = 0; frame < frames; frame += 1) {
    const sample = Math.sin((2 * Math.PI * frequencyHz * frame) / sampleRate) * 0.2
    for (let channel = 0; channel < channels; channel += 1) {
      if (sampleFormat === 'float') {
        buffer.writeFloatLE(sample, offset)
      } else if (bitDepth === 16) {
        buffer.writeInt16LE(Math.round(sample * 32767), offset)
      } else if (bitDepth === 24) {
        buffer.writeIntLE(Math.round(sample * 8388607), offset, 3)
      } else if (bitDepth === 32) {
        buffer.writeInt32LE(Math.round(sample * 2147483647), offset)
      } else {
        throw new Error(`Unsupported auto WAV PCM bit depth: ${bitDepth}`)
      }
      offset += bytesPerSample
    }
  }

  return buffer
}

function normalizeAutoWavSampleFormat(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (normalized === 'float' || normalized === 'f32') {
    return 'float'
  }
  if (normalized === 'pcm' || normalized === 'i16' || normalized === 'i24' || normalized === 'i32') {
    return 'pcm'
  }

  throw new Error(`Unsupported auto WAV sample format: ${value}`)
}

function normalizeAutoWavFormat(format) {
  if (!format || typeof format !== 'object') {
    throw new Error('WASAPI exclusive output format was not reported.')
  }

  const sampleRate = Number(format.sampleRate)
  const channels = Number(format.channels)
  const sampleFormat = normalizeAutoWavSampleFormat(format.sampleFormat)
  const bitDepth = Number(format.bitDepth)

  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error(`Invalid WASAPI exclusive sample rate: ${format.sampleRate}`)
  }

  if (!Number.isInteger(channels) || channels <= 0) {
    throw new Error(`Invalid WASAPI exclusive channel count: ${format.channels}`)
  }

  if (!Number.isInteger(bitDepth) || bitDepth <= 0) {
    throw new Error(`Invalid WASAPI exclusive bit depth: ${format.bitDepth}`)
  }

  if (sampleFormat === 'float' && bitDepth !== 32) {
    throw new Error(`Unsupported auto WAV float bit depth: ${bitDepth}`)
  }

  if (sampleFormat === 'pcm' && ![16, 24, 32].includes(bitDepth)) {
    throw new Error(`Unsupported auto WAV PCM bit depth: ${bitDepth}`)
  }

  return {
    sampleRate,
    channels,
    sampleFormat,
    bitDepth
  }
}

function resolveAutoGeneratedAudioFilePath(reportPath, env = process.env) {
  const explicitPath = env[autoWavPathEnv]
  if (explicitPath) {
    return {
      path: path.resolve(explicitPath),
      retained: true,
      source: autoWavPathEnv
    }
  }

  if (reportPath) {
    const extension = path.extname(reportPath)
    const baseName = path.basename(reportPath, extension)
    return {
      path: path.join(path.dirname(reportPath), `${baseName}.source.wav`),
      retained: true,
      source: 'report-path'
    }
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luo-bit-perfect-candidate-'))
  return {
    path: path.join(directory, 'candidate.wav'),
    retained: false,
    source: 'temp'
  }
}

function writeWavFile(filePath, buffer) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, buffer)
}

async function configureExclusive(helper, events, options) {
  const fromIndex = events.history.length
  sendCommand(helper, {
    type: 'configure',
    payload: {
      enabled: true,
      settings: {
        mode: 'exclusive',
        sharedDeviceId: '',
        deviceId: options.deviceId,
        bufferFrames: options.bufferFrames,
        fallbackToShared: false,
        bitPerfectRequired: options.bitPerfectRequired,
        voicemeeterBus: 'A1',
        diagnosticsEnabled: true
      }
    }
  })

  return waitForEvent(
    events,
    event => event.type === 'status' && event.payload?.requestedMode === 'exclusive',
    'exclusive configure status',
    { fromIndex }
  )
}

async function stopPlayback(helper, events, sourcePath) {
  const fromIndex = events.history.length
  sendCommand(helper, { type: 'stopPlayback' })
  await waitForEvent(
    events,
    event =>
      event.type === 'status' &&
      event.payload?.nativePlaybackState === 'stopped' &&
      (!sourcePath || !event.payload?.nativePlaybackSource || event.payload.nativePlaybackSource === sourcePath),
    `stop playback for ${sourcePath || 'native source'}`,
    { fromIndex, timeoutMs: 5_000 }
  ).catch(() => undefined)
}

async function discoverExclusiveOutputFormat(helper, events, options) {
  const probePath = path.join(
    os.tmpdir(),
    `luo-bit-perfect-format-probe-${process.pid}-${Date.now()}.wav`
  )
  writeWavFile(
    probePath,
    createBitPerfectCandidateWavBuffer({
      sampleRate: 48_000,
      channels: 2,
      sampleFormat: 'pcm',
      bitDepth: 16,
      durationSeconds: 0.2
    })
  )

  try {
    const fromIndex = events.history.length
    sendCommand(helper, {
      type: 'playFile',
      payload: {
        path: probePath,
        startSeconds: 0,
        volume: 0,
        playbackToken: `bit-perfect-auto-format-probe-${Date.now()}`
      }
    })
    const event = await waitForEvent(
      events,
      item =>
        item.type === 'status' &&
        item.payload?.nativePlaybackSource === probePath &&
        (item.payload?.bitPerfect || item.payload?.nativePlaybackState === 'error'),
      'WASAPI exclusive output format diagnostics',
      { fromIndex }
    )
    const outputFormat = event.payload?.bitPerfect?.outputFormat
    if (!outputFormat) {
      throw new Error(
        event.payload?.reason ||
          'WASAPI exclusive output format was not available from probe playback.'
      )
    }

    return {
      raw: outputFormat,
      normalized: normalizeAutoWavFormat(outputFormat)
    }
  } finally {
    await stopPlayback(helper, events, probePath)
    fs.rmSync(probePath, { force: true })
  }
}

async function createAutoGeneratedAudioFile(helper, events, options) {
  const discovered = await discoverExclusiveOutputFormat(helper, events, options)
  const destination = resolveAutoGeneratedAudioFilePath(options.reportPath, options.env)
  writeWavFile(
    destination.path,
    createBitPerfectCandidateWavBuffer({
      ...discovered.normalized,
      durationSeconds: 0.75
    })
  )

  return {
    path: destination.path,
    retained: destination.retained,
    source: destination.source,
    format: discovered.normalized,
    discoveredOutputFormat: discovered.raw
  }
}

async function main() {
  if (process.platform !== 'win32') {
    console.warn('[audio-output-bit-perfect] skipping: WASAPI exclusive mode is Windows-only')
    return
  }

  const audioFilePath = process.env.LUO_AUDIO_OUTPUT_BIT_PERFECT_FILE
  const autoGenerateWav = parseBooleanEnv(autoWavEnv, false)
  if (audioFilePath && autoGenerateWav) {
    fail(
      `Set either LUO_AUDIO_OUTPUT_BIT_PERFECT_FILE or ${autoWavEnv}=1, not both.`
    )
  }

  if (!audioFilePath && !autoGenerateWav) {
    fail(
      `Set LUO_AUDIO_OUTPUT_BIT_PERFECT_FILE to a local WAV/FLAC/MP3/AAC/M4A/OGG/etc. file, or set ${autoWavEnv}=1 to generate a WASAPI-format-matched WAV before running this check.`
    )
  }

  let resolvedAudioFilePath = audioFilePath ? path.resolve(audioFilePath) : null
  if (resolvedAudioFilePath && !fs.existsSync(resolvedAudioFilePath)) {
    fail(`Audio file does not exist: ${resolvedAudioFilePath}`)
  }

  const helperInfo = prepareAudioOutputHelper({ projectRoot })

  const deviceId = process.env.LUO_AUDIO_OUTPUT_TEST_DEVICE_ID || ''
  const bufferFrames = parseIntegerEnv('LUO_AUDIO_OUTPUT_TEST_BUFFER_FRAMES', 960)
  const volume = parseVolumeEnv('LUO_AUDIO_OUTPUT_BIT_PERFECT_VOLUME', 1)
  const bitPerfectRequired = parseBooleanEnv(
    'LUO_AUDIO_OUTPUT_BIT_PERFECT_REQUIRE_CANDIDATE',
    false
  )
  const reportPath = resolveReportPath()
  let autoGeneratedAudioFile = null
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
    await configureExclusive(helper, events, {
      deviceId,
      bufferFrames,
      bitPerfectRequired: false
    })

    if (autoGenerateWav) {
      autoGeneratedAudioFile = await createAutoGeneratedAudioFile(helper, events, {
        deviceId,
        bufferFrames,
        reportPath,
        env: process.env
      })
      resolvedAudioFilePath = autoGeneratedAudioFile.path
    }

    await configureExclusive(helper, events, {
      deviceId,
      bufferFrames,
      bitPerfectRequired
    })

    const probeFromIndex = events.history.length
    sendCommand(helper, { type: 'probeExclusiveLock' })
    const probeEvent = await waitForEvent(
      events,
      event => event.type === 'status' && event.payload?.exclusiveProbe,
      'exclusive lock probe',
      { fromIndex: probeFromIndex }
    )

    const audioFileStat = fs.statSync(resolvedAudioFilePath)
    const audioFileIdentity = {
      path: resolvedAudioFilePath,
      byteSize: audioFileStat.size,
      sha256: await hashFile(resolvedAudioFilePath)
    }
    const playbackFromIndex = events.history.length
    sendCommand(helper, {
      type: 'playFile',
      payload: {
        path: resolvedAudioFilePath,
        startSeconds: 0,
        volume
      }
    })
    const playbackEvent = await waitForEvent(
      events,
      event =>
        event.type === 'status' &&
        event.payload?.nativePlaybackSource === resolvedAudioFilePath &&
        ((event.payload?.bitPerfect &&
          playbackDiagnosticStates.has(event.payload?.nativePlaybackState)) ||
          event.payload?.nativePlaybackState === 'error'),
      'bit-perfect candidate diagnostics for the requested playback',
      { fromIndex: playbackFromIndex }
    )

    const exclusiveProbe = probeEvent.payload.exclusiveProbe
    const bitPerfect = playbackEvent.payload.bitPerfect
    const exclusivePassed = exclusiveProbe?.status === 'passed'
    const candidate = bitPerfect?.status === 'candidate'
    const report = {
      verdict: exclusivePassed && candidate ? 'candidate' : 'not-candidate',
      proof: 'candidate-only',
      requiresExternalVerification: true,
      exclusiveProbe,
      bitPerfect,
      deviceId: playbackEvent.payload.deviceId,
      activeMode: playbackEvent.payload.activeMode,
      bitPerfectRequired,
      nativePlaybackState: playbackEvent.payload.nativePlaybackState,
      nativePlaybackSource: playbackEvent.payload.nativePlaybackSource,
      reason: playbackEvent.payload.reason,
      audioFile: resolvedAudioFilePath,
      audioFileIdentity,
      autoGeneratedAudioFile: autoGeneratedAudioFile
        ? {
            path: autoGeneratedAudioFile.path,
            retained: autoGeneratedAudioFile.retained,
            pathSource: autoGeneratedAudioFile.source,
            format: autoGeneratedAudioFile.format,
            discoveredOutputFormat: autoGeneratedAudioFile.discoveredOutputFormat
          }
        : undefined,
      helperPath: helperInfo.helperPath,
      helperPathSource: helperInfo.helperPathSource,
      reportPath: reportPath ?? undefined,
      missingProof: [
        'loopback capture comparison',
        'DAC hardware sample-rate/bit-depth confirmation',
        'driver/DSP end-to-end bypass confirmation'
      ]
    }

    writeReportIfRequested(report)
    console.log(JSON.stringify(report, null, 2))

    if (!exclusivePassed || !candidate) {
      process.exitCode = 2
    }
  } finally {
    await stopHelper(helper)
    if (autoGeneratedAudioFile && !autoGeneratedAudioFile.retained) {
      fs.rmSync(path.dirname(autoGeneratedAudioFile.path), { recursive: true, force: true })
    }
  }
}

if (require.main === module) {
  main().catch(error => {
    fail('bit-perfect candidate verification failed', error)
  })
}

module.exports = {
  createBitPerfectCandidateWavBuffer,
  normalizeAutoWavFormat,
  parseBooleanEnv,
  resolveAutoGeneratedAudioFilePath
}
