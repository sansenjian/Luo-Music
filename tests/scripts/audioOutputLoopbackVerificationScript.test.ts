import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { compareWaveLoopback, readWaveFile, runCli } =
  require('../../scripts/verify-audio-output-loopback.cjs') as {
    compareWaveLoopback: (
      source: string,
      capture: string,
      options?: {
        tolerance?: number
        maxOffsetFrames?: number
        alignWindowFrames?: number
        compareFrames?: number
        allowFormatConversion?: boolean
      }
    ) => {
      verdict: 'verified' | 'not-verified'
      verified: boolean
      source: { path?: string; byteSize?: number; sha256?: string }
      capture: { path?: string; byteSize?: number; sha256?: string }
      offsetFrames?: number
      comparedFrames?: number
      mismatchedSamples?: number
      reason: string
    }
    readWaveFile: (filePath: string) => {
      sha256: string
      sampleRate: number
      channels: number
      bitsPerSample: number
      sampleFormat: string
      frames: number
    }
    runCli: (
      argv: string[],
      streams?: {
        stdout?: { write: (value: string) => void }
        stderr?: { write: (value: string) => void }
      }
    ) => number
  }

function createPcm16Wave(samples: number[], sampleRate = 48_000, channels = 1): Buffer {
  const bytesPerSample = 2
  const dataSize = samples.length * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  buffer.writeUInt16LE(channels * bytesPerSample, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataSize, 40)

  samples.forEach((sample, index) => {
    buffer.writeInt16LE(sample, 44 + index * bytesPerSample)
  })

  return buffer
}

function createFloat32Wave(samples: number[], sampleRate = 48_000, channels = 1): Buffer {
  const bytesPerSample = 4
  const dataSize = samples.length * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(3, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  buffer.writeUInt16LE(channels * bytesPerSample, 32)
  buffer.writeUInt16LE(32, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataSize, 40)

  samples.forEach((sample, index) => {
    buffer.writeFloatLE(sample, 44 + index * bytesPerSample)
  })

  return buffer
}

describe('audio output loopback verification script', () => {
  it('verifies a loopback WAV capture after leading latency alignment', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-'))

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      const capturePath = join(tempRoot, 'capture.wav')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000, 2000, -2000]))
      await writeFile(capturePath, createPcm16Wave([0, 0, 1000, -1000, 2000, -2000]))

      const report = compareWaveLoopback(sourcePath, capturePath, {
        maxOffsetFrames: 4,
        alignWindowFrames: 2
      })

      expect(report).toMatchObject({
        verdict: 'verified',
        verified: true,
        source: {
          path: sourcePath,
          byteSize: 52,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
        },
        capture: {
          path: capturePath,
          byteSize: 56,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
        },
        offsetFrames: 2,
        comparedFrames: 4,
        mismatchedSamples: 0
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects captures with sample differences beyond the configured tolerance', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-mismatch-'))

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      const capturePath = join(tempRoot, 'capture.wav')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000, 2000, -2000]))
      await writeFile(capturePath, createPcm16Wave([1000, -1000, 2001, -2000]))

      const report = compareWaveLoopback(sourcePath, capturePath)

      expect(report).toMatchObject({
        verdict: 'not-verified',
        verified: false,
        mismatchedSamples: 1
      })
      expect(report.reason).toContain('differs')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects using the source WAV itself as the loopback capture', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-same-file-'))

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000]))

      const report = compareWaveLoopback(sourcePath, sourcePath)

      expect(report).toMatchObject({
        verdict: 'not-verified',
        verified: false,
        sameFileProofRejected: true,
        reason:
          'Source and capture paths are identical; provide an independently captured loopback WAV.'
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects truncated captures by default and marks explicit subset comparisons as partial', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-truncated-'))

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      const capturePath = join(tempRoot, 'capture.wav')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000, 2000, -2000]))
      await writeFile(capturePath, createPcm16Wave([1000, -1000]))

      expect(compareWaveLoopback(sourcePath, capturePath)).toMatchObject({
        verdict: 'not-verified',
        verified: false,
        reason:
          'Capture does not contain enough aligned frames to verify the requested source range.',
        overlappingFrames: 2,
        requiredFrames: 4
      })

      expect(compareWaveLoopback(sourcePath, capturePath, { compareFrames: 2 })).toMatchObject({
        verdict: 'verified',
        verified: true,
        partialComparison: true,
        comparedFrames: 2
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects sample format conversion by default and allows it only when requested', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-format-'))

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      const capturePath = join(tempRoot, 'capture.wav')
      await writeFile(sourcePath, createPcm16Wave([0, 16384]))
      await writeFile(capturePath, createFloat32Wave([0, 0.5]))

      const strictReport = compareWaveLoopback(sourcePath, capturePath)

      expect(strictReport).toMatchObject({
        verdict: 'not-verified',
        verified: false,
        reason:
          'Source and capture sample formats differ. Use --allow-format-conversion to compare normalized sample values only.'
      })

      expect(
        compareWaveLoopback(sourcePath, capturePath, { allowFormatConversion: true })
      ).toMatchObject({
        verdict: 'verified',
        verified: true,
        allowFormatConversion: true,
        mismatchedSamples: 0
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects captures with a different sample rate', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-rate-'))

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      const capturePath = join(tempRoot, 'capture.wav')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000], 48_000))
      await writeFile(capturePath, createPcm16Wave([1000, -1000], 44_100))

      const report = compareWaveLoopback(sourcePath, capturePath)

      expect(report).toMatchObject({
        verdict: 'not-verified',
        verified: false,
        reason: 'Source and capture sample rates differ.'
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('exposes a CLI exit code for verified and non-verified reports', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-cli-'))

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      const capturePath = join(tempRoot, 'capture.wav')
      const mismatchPath = join(tempRoot, 'mismatch.wav')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000]))
      await writeFile(capturePath, createPcm16Wave([1000, -1000]))
      await writeFile(mismatchPath, createPcm16Wave([1000, -999]))
      const stdout: string[] = []
      const stderr: string[] = []

      expect(
        runCli(['--source', sourcePath, '--capture', capturePath], {
          stdout: { write: value => stdout.push(value) },
          stderr: { write: value => stderr.push(value) }
        })
      ).toBe(0)
      expect(JSON.parse(stdout.at(-1) ?? '{}')).toMatchObject({ verdict: 'verified' })

      expect(
        runCli(['--source', sourcePath, '--capture', mismatchPath], {
          stdout: { write: value => stdout.push(value) },
          stderr: { write: value => stderr.push(value) }
        })
      ).toBe(2)
      expect(JSON.parse(stdout.at(-1) ?? '{}')).toMatchObject({ verdict: 'not-verified' })
      expect(stderr).toEqual([])
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('persists loopback reports when a CLI report path is provided', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-report-'))

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      const capturePath = join(tempRoot, 'capture.wav')
      const reportPath = join(tempRoot, 'reports', 'loopback.json')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000]))
      await writeFile(capturePath, createPcm16Wave([1000, -1000]))
      const stdout: string[] = []

      expect(
        runCli(['--source', sourcePath, '--capture', capturePath, '--report', reportPath], {
          stdout: { write: value => stdout.push(value) }
        })
      ).toBe(0)

      const printedReport = JSON.parse(stdout.at(-1) ?? '{}')
      const savedReport = JSON.parse(await readFile(reportPath, 'utf8'))
      expect(savedReport).toEqual(printedReport)
      expect(savedReport).toMatchObject({
        verdict: 'verified',
        verified: true,
        reportPath
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('persists loopback reports from LUO_AUDIO_OUTPUT_LOOPBACK_REPORT', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-env-report-'))
    const previousReportPath = process.env.LUO_AUDIO_OUTPUT_LOOPBACK_REPORT

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      const capturePath = join(tempRoot, 'capture.wav')
      const reportPath = join(tempRoot, 'loopback-env.json')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000]))
      await writeFile(capturePath, createPcm16Wave([1000, -1000]))
      process.env.LUO_AUDIO_OUTPUT_LOOPBACK_REPORT = reportPath
      const stdout: string[] = []

      expect(
        runCli(['--source', sourcePath, '--capture', capturePath], {
          stdout: { write: value => stdout.push(value) }
        })
      ).toBe(0)

      expect(JSON.parse(await readFile(reportPath, 'utf8'))).toMatchObject({
        verdict: 'verified',
        verified: true,
        reportPath
      })
    } finally {
      if (previousReportPath === undefined) {
        delete process.env.LUO_AUDIO_OUTPUT_LOOPBACK_REPORT
      } else {
        process.env.LUO_AUDIO_OUTPUT_LOOPBACK_REPORT = previousReportPath
      }
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('persists loopback reports to the standard Windows proof directory fallback', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-proof-dir-'))
    const previousReportPath = process.env.LUO_AUDIO_OUTPUT_LOOPBACK_REPORT
    const previousProofDir = process.env.LUO_AUDIO_OUTPUT_WINDOWS_PROOF_DIR

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      const capturePath = join(tempRoot, 'capture.wav')
      const reportPath = join(tempRoot, 'candidate-plus-loopback.json')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000]))
      await writeFile(capturePath, createPcm16Wave([1000, -1000]))
      delete process.env.LUO_AUDIO_OUTPUT_LOOPBACK_REPORT
      process.env.LUO_AUDIO_OUTPUT_WINDOWS_PROOF_DIR = tempRoot
      const stdout: string[] = []

      expect(
        runCli(['--source', sourcePath, '--capture', capturePath], {
          stdout: { write: value => stdout.push(value) }
        })
      ).toBe(0)

      expect(JSON.parse(await readFile(reportPath, 'utf8'))).toMatchObject({
        verdict: 'verified',
        verified: true,
        reportPath
      })
    } finally {
      if (previousReportPath === undefined) {
        delete process.env.LUO_AUDIO_OUTPUT_LOOPBACK_REPORT
      } else {
        process.env.LUO_AUDIO_OUTPUT_LOOPBACK_REPORT = previousReportPath
      }
      if (previousProofDir === undefined) {
        delete process.env.LUO_AUDIO_OUTPUT_WINDOWS_PROOF_DIR
      } else {
        process.env.LUO_AUDIO_OUTPUT_WINDOWS_PROOF_DIR = previousProofDir
      }
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('merges a saved candidate report into the loopback proof when the source hash matches', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-candidate-'))

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      const capturePath = join(tempRoot, 'capture.wav')
      const candidatePath = join(tempRoot, 'candidate.json')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000]))
      await writeFile(capturePath, createPcm16Wave([1000, -1000]))
      const sourceSha256 = readWaveFile(sourcePath).sha256
      await writeFile(
        candidatePath,
        JSON.stringify({
          verdict: 'candidate',
          proof: 'candidate-only',
          requiresExternalVerification: true,
          audioFileIdentity: {
            path: sourcePath,
            sha256: sourceSha256
          }
        })
      )
      const stdout: string[] = []

      expect(
        runCli(['--source', sourcePath, '--capture', capturePath, '--candidate', candidatePath], {
          stdout: { write: value => stdout.push(value) }
        })
      ).toBe(0)
      expect(JSON.parse(stdout.at(-1) ?? '{}')).toMatchObject({
        verdict: 'verified',
        proof: 'candidate-plus-loopback',
        verified: true,
        candidateMatchedSource: true,
        requiresExternalVerification: false,
        candidate: {
          verdict: 'candidate',
          proof: 'candidate-only',
          audioFileIdentity: {
            sha256: sourceSha256
          }
        }
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects a candidate report whose source hash differs from the compared source WAV', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-candidate-mismatch-'))

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      const capturePath = join(tempRoot, 'capture.wav')
      const candidatePath = join(tempRoot, 'candidate.json')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000]))
      await writeFile(capturePath, createPcm16Wave([1000, -1000]))
      await writeFile(
        candidatePath,
        JSON.stringify({
          verdict: 'candidate',
          proof: 'candidate-only',
          requiresExternalVerification: true,
          audioFileIdentity: {
            sha256: '0'.repeat(64)
          }
        })
      )
      const stdout: string[] = []

      expect(
        runCli(['--source', sourcePath, '--capture', capturePath, '--candidate', candidatePath], {
          stdout: { write: value => stdout.push(value) }
        })
      ).toBe(2)
      expect(JSON.parse(stdout.at(-1) ?? '{}')).toMatchObject({
        verdict: 'not-verified',
        proof: 'candidate-plus-loopback',
        verified: false,
        candidateMatchedSource: false,
        reason: 'Bit-perfect candidate source hash does not match the compared source WAV.'
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects candidate reports without a source hash before marking loopback proof verified', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-candidate-missing-sha-'))

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      const capturePath = join(tempRoot, 'capture.wav')
      const candidatePath = join(tempRoot, 'candidate.json')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000]))
      await writeFile(capturePath, createPcm16Wave([1000, -1000]))
      await writeFile(
        candidatePath,
        JSON.stringify({
          verdict: 'candidate',
          proof: 'candidate-only',
          requiresExternalVerification: true,
          audioFileIdentity: {
            path: sourcePath
          }
        })
      )
      const stdout: string[] = []

      expect(
        runCli(['--source', sourcePath, '--capture', capturePath, '--candidate', candidatePath], {
          stdout: { write: value => stdout.push(value) }
        })
      ).toBe(2)
      expect(JSON.parse(stdout.at(-1) ?? '{}')).toMatchObject({
        verdict: 'not-verified',
        proof: 'candidate-plus-loopback',
        verified: false,
        candidateMatchedSource: false,
        reason: 'Bit-perfect candidate report must include source audioFileIdentity.sha256.'
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects non candidate-only reports passed as bit-perfect candidates', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-candidate-proof-'))

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      const capturePath = join(tempRoot, 'capture.wav')
      const candidatePath = join(tempRoot, 'candidate.json')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000]))
      await writeFile(capturePath, createPcm16Wave([1000, -1000]))
      const sourceSha256 = readWaveFile(sourcePath).sha256
      await writeFile(
        candidatePath,
        JSON.stringify({
          verdict: 'verified',
          proof: 'candidate-plus-loopback',
          requiresExternalVerification: false,
          audioFileIdentity: {
            sha256: sourceSha256
          }
        })
      )
      const stdout: string[] = []

      expect(
        runCli(['--source', sourcePath, '--capture', capturePath, '--candidate', candidatePath], {
          stdout: { write: value => stdout.push(value) }
        })
      ).toBe(2)
      expect(JSON.parse(stdout.at(-1) ?? '{}')).toMatchObject({
        verdict: 'not-verified',
        proof: 'candidate-plus-loopback',
        verified: false,
        candidateMatchedSource: false,
        reason: 'Bit-perfect candidate report is not a successful candidate.'
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('reads PCM16 WAV metadata', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-loopback-metadata-'))

    try {
      const sourcePath = join(tempRoot, 'source.wav')
      await writeFile(sourcePath, createPcm16Wave([1000, -1000, 2000, -2000], 48_000, 2))

      expect(readWaveFile(sourcePath)).toMatchObject({
        filePath: sourcePath,
        byteSize: 52,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        sampleRate: 48_000,
        channels: 2,
        bitsPerSample: 16,
        sampleFormat: 'pcm',
        frames: 2
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
