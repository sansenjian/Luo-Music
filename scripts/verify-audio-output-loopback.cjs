const fs = require('node:fs')
const { createHash } = require('node:crypto')
const path = require('node:path')

const { resolveReportPathFromEnv } = require('./audio-output-proof-dir.cjs')

const WAVE_FORMAT_PCM = 0x0001
const WAVE_FORMAT_IEEE_FLOAT = 0x0003

function usage() {
  return [
    'Usage:',
    '  node scripts/verify-audio-output-loopback.cjs --source <source.wav> --capture <loopback.wav> [options]',
    '',
    'Options:',
    '  --tolerance <number>          Maximum allowed normalized sample error. Default: 0',
    '  --max-offset-frames <number>  Search this many leading capture frames for alignment. Default: 0',
    '  --align-window-frames <number> Number of frames used while searching offsets. Default: 4096',
    '  --compare-frames <number>     Limit compared frames after alignment. Default: all overlapping frames',
    '  --allow-format-conversion     Allow sample format / bit-depth differences and compare normalized values only',
    '  --candidate <report.json>     Merge a saved bit-perfect candidate report into the proof',
    '  --report <report.json>        Save the JSON report to this path. Env: LUO_AUDIO_OUTPUT_LOOPBACK_REPORT'
  ].join('\n')
}

function parseNonNegativeNumber(value, name) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number`)
  }

  return parsed
}

function parsePositiveInteger(value, name) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }

  return parsed
}

function parseNonNegativeInteger(value, name) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }

  return parsed
}

function parseArgs(argv) {
  const options = {
    tolerance: 0,
    maxOffsetFrames: 0,
    alignWindowFrames: 4096,
    compareFrames: undefined
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`)
      }
      index += 1
      return value
    }

    switch (arg) {
      case '--source':
        options.source = next()
        break
      case '--capture':
        options.capture = next()
        break
      case '--tolerance':
        options.tolerance = parseNonNegativeNumber(next(), '--tolerance')
        break
      case '--max-offset-frames':
        options.maxOffsetFrames = parseNonNegativeInteger(next(), '--max-offset-frames')
        break
      case '--align-window-frames':
        options.alignWindowFrames = parsePositiveInteger(next(), '--align-window-frames')
        break
      case '--compare-frames':
        options.compareFrames = parsePositiveInteger(next(), '--compare-frames')
        break
      case '--allow-format-conversion':
        options.allowFormatConversion = true
        break
      case '--candidate':
        options.candidate = next()
        break
      case '--report':
        options.report = next()
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function readAscii(buffer, offset, length) {
  return buffer.toString('ascii', offset, offset + length)
}

function findWaveChunk(buffer, chunkId) {
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const id = readAscii(buffer, offset, 4)
    const size = buffer.readUInt32LE(offset + 4)
    const dataOffset = offset + 8
    if (dataOffset + size > buffer.length) {
      throw new Error(`Invalid WAV chunk size for ${id}`)
    }

    if (id === chunkId) {
      return { offset: dataOffset, size }
    }

    offset = dataOffset + size + (size % 2)
  }

  return null
}

function decodePcmSample(buffer, offset, bitsPerSample) {
  switch (bitsPerSample) {
    case 8:
      return (buffer.readUInt8(offset) - 128) / 128
    case 16:
      return buffer.readInt16LE(offset) / 32768
    case 24: {
      let value =
        buffer.readUInt8(offset) |
        (buffer.readUInt8(offset + 1) << 8) |
        (buffer.readUInt8(offset + 2) << 16)
      if (value & 0x800000) {
        value |= 0xff000000
      }
      return value / 8388608
    }
    case 32:
      return buffer.readInt32LE(offset) / 2147483648
    default:
      throw new Error(`Unsupported PCM bit depth: ${bitsPerSample}`)
  }
}

function decodeFloatSample(buffer, offset, bitsPerSample) {
  switch (bitsPerSample) {
    case 32:
      return buffer.readFloatLE(offset)
    case 64:
      return buffer.readDoubleLE(offset)
    default:
      throw new Error(`Unsupported IEEE float bit depth: ${bitsPerSample}`)
  }
}

function decodeSamples(buffer, dataChunk, format) {
  const bytesPerSample = format.bitsPerSample / 8
  if (!Number.isInteger(bytesPerSample) || bytesPerSample <= 0) {
    throw new Error(`Invalid WAV bit depth: ${format.bitsPerSample}`)
  }

  const sampleCount = Math.floor(dataChunk.size / bytesPerSample)
  const samples = new Float64Array(sampleCount)
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const offset = dataChunk.offset + sampleIndex * bytesPerSample
    samples[sampleIndex] =
      format.sampleFormat === 'float'
        ? decodeFloatSample(buffer, offset, format.bitsPerSample)
        : decodePcmSample(buffer, offset, format.bitsPerSample)
  }

  return samples
}

function readWaveFile(filePath) {
  const buffer = fs.readFileSync(filePath)
  if (readAscii(buffer, 0, 4) !== 'RIFF' || readAscii(buffer, 8, 4) !== 'WAVE') {
    throw new Error(`Not a RIFF/WAVE file: ${filePath}`)
  }

  const fmtChunk = findWaveChunk(buffer, 'fmt ')
  const dataChunk = findWaveChunk(buffer, 'data')
  if (!fmtChunk || !dataChunk) {
    throw new Error(`WAV file must contain fmt and data chunks: ${filePath}`)
  }
  if (fmtChunk.size < 16) {
    throw new Error(`Invalid WAV fmt chunk: ${filePath}`)
  }

  const audioFormat = buffer.readUInt16LE(fmtChunk.offset)
  const channels = buffer.readUInt16LE(fmtChunk.offset + 2)
  const sampleRate = buffer.readUInt32LE(fmtChunk.offset + 4)
  const blockAlign = buffer.readUInt16LE(fmtChunk.offset + 12)
  const bitsPerSample = buffer.readUInt16LE(fmtChunk.offset + 14)
  const sampleFormat =
    audioFormat === WAVE_FORMAT_IEEE_FLOAT
      ? 'float'
      : audioFormat === WAVE_FORMAT_PCM
        ? 'pcm'
        : null

  if (!sampleFormat) {
    throw new Error(`Unsupported WAV format tag ${audioFormat}: ${filePath}`)
  }
  if (!channels || !sampleRate || !blockAlign || !bitsPerSample) {
    throw new Error(`Invalid WAV format metadata: ${filePath}`)
  }

  const samples = decodeSamples(buffer, dataChunk, {
    sampleFormat,
    bitsPerSample
  })
  const frames = Math.floor(samples.length / channels)

  return {
    filePath,
    byteSize: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    sampleRate,
    channels,
    bitsPerSample,
    sampleFormat,
    frames,
    samples
  }
}

function readCandidateReport(filePath) {
  const rawReport = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!rawReport || typeof rawReport !== 'object') {
    throw new Error(`Candidate report must be a JSON object: ${filePath}`)
  }

  return rawReport
}

function resolveReportPath(options = {}) {
  const reportPath =
    options.report || resolveReportPathFromEnv('LUO_AUDIO_OUTPUT_LOOPBACK_REPORT', 'loopback')
  return reportPath ? path.resolve(reportPath) : null
}

function writeReportIfRequested(report, reportPath) {
  if (!reportPath) {
    return
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
}

function formatSummary(wave) {
  const summary = {
    sampleRate: wave.sampleRate,
    channels: wave.channels,
    sampleFormat: wave.sampleFormat,
    bitDepth: wave.bitsPerSample,
    frames: wave.frames
  }

  if (wave.filePath) {
    summary.path = wave.filePath
  }
  if (Number.isFinite(wave.byteSize)) {
    summary.byteSize = wave.byteSize
  }
  if (wave.sha256) {
    summary.sha256 = wave.sha256
  }

  return summary
}

function summarizeCandidateReport(candidateReport) {
  const audioFileIdentity =
    candidateReport.audioFileIdentity && typeof candidateReport.audioFileIdentity === 'object'
      ? candidateReport.audioFileIdentity
      : undefined

  return {
    verdict: candidateReport.verdict,
    proof: candidateReport.proof,
    requiresExternalVerification: candidateReport.requiresExternalVerification,
    audioFileIdentity,
    bitPerfect: candidateReport.bitPerfect,
    exclusiveProbe: candidateReport.exclusiveProbe
  }
}

function isCandidateReportAccepted(candidateReport) {
  return candidateReport.verdict === 'candidate'
}

function getCandidateReportIssue(candidateReport) {
  const audioFileIdentity =
    candidateReport.audioFileIdentity && typeof candidateReport.audioFileIdentity === 'object'
      ? candidateReport.audioFileIdentity
      : undefined

  if (!isCandidateReportAccepted(candidateReport)) {
    return 'Bit-perfect candidate report is not a successful candidate.'
  }
  if (candidateReport.proof !== 'candidate-only') {
    return 'Bit-perfect candidate report must use proof "candidate-only".'
  }
  if (candidateReport.requiresExternalVerification !== true) {
    return 'Bit-perfect candidate report must still require external verification.'
  }
  if (typeof audioFileIdentity?.sha256 !== 'string') {
    return 'Bit-perfect candidate report must include source audioFileIdentity.sha256.'
  }

  return null
}

function mergeCandidateReport(loopbackReport, candidateReport) {
  const candidate = summarizeCandidateReport(candidateReport)
  const sourceSha256 = loopbackReport.source?.sha256
  const candidateSha256 =
    candidate.audioFileIdentity && typeof candidate.audioFileIdentity.sha256 === 'string'
      ? candidate.audioFileIdentity.sha256
      : undefined
  const candidateIssue = getCandidateReportIssue(candidateReport)

  if (candidateIssue) {
    return {
      ...loopbackReport,
      verdict: 'not-verified',
      proof: 'candidate-plus-loopback',
      verified: false,
      reason: candidateIssue,
      candidate,
      candidateMatchedSource: false
    }
  }

  if (candidateSha256 && sourceSha256 && candidateSha256 !== sourceSha256) {
    return {
      ...loopbackReport,
      verdict: 'not-verified',
      proof: 'candidate-plus-loopback',
      verified: false,
      reason: 'Bit-perfect candidate source hash does not match the compared source WAV.',
      candidate,
      candidateMatchedSource: false
    }
  }

  return {
    ...loopbackReport,
    verdict: loopbackReport.verified ? 'verified' : 'not-verified',
    proof: 'candidate-plus-loopback',
    reason: loopbackReport.verified
      ? 'Bit-perfect candidate diagnostics and loopback capture comparison both passed.'
      : loopbackReport.reason,
    candidate,
    candidateMatchedSource: Boolean(candidateSha256 && sourceSha256),
    requiresExternalVerification: !loopbackReport.verified
  }
}

function createNotVerified(reason, source, capture, extra = {}) {
  return {
    verdict: 'not-verified',
    proof: 'loopback-wav-comparison',
    verified: false,
    reason,
    source: formatSummary(source),
    capture: formatSummary(capture),
    ...extra
  }
}

function scoreOffset(source, capture, offsetFrames, windowFrames) {
  const channels = source.channels
  const sourceSampleOffset = 0
  const captureSampleOffset = offsetFrames * channels
  const sampleCount = windowFrames * channels
  let sumSquaredError = 0

  for (let index = 0; index < sampleCount; index += 1) {
    const delta =
      source.samples[sourceSampleOffset + index] - capture.samples[captureSampleOffset + index]
    sumSquaredError += delta * delta
  }

  return sumSquaredError / Math.max(sampleCount, 1)
}

function findBestOffset(source, capture, maxOffsetFrames, alignWindowFrames) {
  const maxOffset = Math.min(maxOffsetFrames, Math.max(capture.frames - 1, 0))
  let bestOffsetFrames = 0
  let bestScore = Number.POSITIVE_INFINITY

  for (let offsetFrames = 0; offsetFrames <= maxOffset; offsetFrames += 1) {
    const windowFrames = Math.min(alignWindowFrames, source.frames, capture.frames - offsetFrames)
    if (windowFrames <= 0) {
      continue
    }

    const score = scoreOffset(source, capture, offsetFrames, windowFrames)
    if (score < bestScore) {
      bestScore = score
      bestOffsetFrames = offsetFrames
    }
  }

  return bestOffsetFrames
}

function compareWaveLoopback(sourceInput, captureInput, options = {}) {
  const source = typeof sourceInput === 'string' ? readWaveFile(sourceInput) : sourceInput
  const capture = typeof captureInput === 'string' ? readWaveFile(captureInput) : captureInput
  const tolerance = options.tolerance ?? 0
  const maxOffsetFrames = options.maxOffsetFrames ?? 0
  const alignWindowFrames = options.alignWindowFrames ?? 4096
  const samePath =
    typeof source.filePath === 'string' &&
    typeof capture.filePath === 'string' &&
    path.resolve(source.filePath).toLowerCase() === path.resolve(capture.filePath).toLowerCase()

  if (samePath) {
    return createNotVerified(
      'Source and capture paths are identical; provide an independently captured loopback WAV.',
      source,
      capture,
      {
        sameFileProofRejected: true
      }
    )
  }

  if (source.sampleRate !== capture.sampleRate) {
    return createNotVerified('Source and capture sample rates differ.', source, capture)
  }
  if (source.channels !== capture.channels) {
    return createNotVerified('Source and capture channel counts differ.', source, capture)
  }
  if (!options.allowFormatConversion && source.sampleFormat !== capture.sampleFormat) {
    return createNotVerified(
      'Source and capture sample formats differ. Use --allow-format-conversion to compare normalized sample values only.',
      source,
      capture
    )
  }
  if (!options.allowFormatConversion && source.bitsPerSample !== capture.bitsPerSample) {
    return createNotVerified(
      'Source and capture bit depths differ. Use --allow-format-conversion to compare normalized sample values only.',
      source,
      capture
    )
  }
  if (source.frames === 0 || capture.frames === 0) {
    return createNotVerified('Source and capture must both contain audio frames.', source, capture)
  }

  const offsetFrames = findBestOffset(source, capture, maxOffsetFrames, alignWindowFrames)
  const overlappingFrames = Math.min(source.frames, capture.frames - offsetFrames)
  const requiredFrames = options.compareFrames ?? source.frames
  if (requiredFrames <= 0) {
    return createNotVerified(
      'Source and capture do not overlap after alignment.',
      source,
      capture,
      {
        offsetFrames
      }
    )
  }
  if (overlappingFrames < requiredFrames) {
    return createNotVerified(
      'Capture does not contain enough aligned frames to verify the requested source range.',
      source,
      capture,
      {
        offsetFrames,
        overlappingFrames,
        requiredFrames
      }
    )
  }

  const comparedFrames = requiredFrames
  const partialComparison = comparedFrames < source.frames

  const channels = source.channels
  const comparedSamples = comparedFrames * channels
  const captureStartSample = offsetFrames * channels
  let maxAbsError = 0
  let sumSquaredError = 0
  let mismatchedSamples = 0

  for (let index = 0; index < comparedSamples; index += 1) {
    const delta = source.samples[index] - capture.samples[captureStartSample + index]
    const absError = Math.abs(delta)
    maxAbsError = Math.max(maxAbsError, absError)
    sumSquaredError += delta * delta
    if (absError > tolerance) {
      mismatchedSamples += 1
    }
  }

  const rmsError = Math.sqrt(sumSquaredError / comparedSamples)
  const verified = mismatchedSamples === 0

  return {
    verdict: verified ? 'verified' : 'not-verified',
    proof: 'loopback-wav-comparison',
    verified,
    reason: verified
      ? 'Loopback capture matches the source within the configured tolerance.'
      : 'Loopback capture differs from the source beyond the configured tolerance.',
    source: formatSummary(source),
    capture: formatSummary(capture),
    tolerance,
    allowFormatConversion: Boolean(options.allowFormatConversion),
    partialComparison,
    offsetFrames,
    overlappingFrames,
    comparedFrames,
    comparedSamples,
    mismatchedSamples,
    maxAbsError,
    rmsError
  }
}

function runCli(argv = process.argv.slice(2), streams = {}) {
  const stdout = streams.stdout ?? process.stdout
  const stderr = streams.stderr ?? process.stderr

  try {
    const options = parseArgs(argv)
    if (options.help) {
      stdout.write(`${usage()}\n`)
      return 0
    }
    if (!options.source || !options.capture) {
      stderr.write(`${usage()}\n`)
      return 1
    }

    const reportPath = resolveReportPath(options)
    let report = compareWaveLoopback(options.source, options.capture, options)
    if (options.candidate) {
      report = mergeCandidateReport(report, readCandidateReport(options.candidate))
    }
    if (reportPath) {
      report = {
        ...report,
        reportPath
      }
      writeReportIfRequested(report, reportPath)
    }
    stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return report.verified ? 0 : 2
  } catch (error) {
    stderr.write(`[audio-output-loopback] ${error.message}\n`)
    return 1
  }
}

if (require.main === module) {
  process.exitCode = runCli()
}

module.exports = {
  compareWaveLoopback,
  mergeCandidateReport,
  parseArgs,
  readCandidateReport,
  readWaveFile,
  resolveReportPath,
  runCli
}
