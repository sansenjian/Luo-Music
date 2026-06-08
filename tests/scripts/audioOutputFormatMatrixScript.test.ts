import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createFileIdentity, createReport, createSampleCoverage, parseExpectedExtensionsList } =
  require('../../scripts/test-audio-output-format-matrix.cjs') as {
    createFileIdentity: (filePath: string) => Promise<{ byteSize: number; sha256: string }>
    createSampleCoverage: (
      supportedExtensions: string[],
      sampleResults: Array<{ extension: string; status: string }>
    ) => Record<string, { total: number; started: number; failed: number }>
    createReport: (
      status: { supportedExtensions?: string[]; supportedModes?: string[] },
      sampleResults: Array<{ extension: string; status: string }>,
      sampleDir: string,
      reportPath?: string | null,
      options?: {
        expectedExtensions?: string[]
        requireAllSamples?: boolean
      }
    ) => {
      verdict: string
      missingSampleExtensions: string[]
      missingExpectedSampleExtensions: string[]
      missingRequiredSampleExtensions: string[]
      failedRequiredSampleExtensions: string[]
      unsupportedExpectedExtensions: string[]
      completeSampleCoverage: boolean
      startedSampleExtensions: string[]
      failedSampleExtensions: string[]
      sampleCoverage: Record<string, { total: number; started: number; failed: number }>
    }
    parseExpectedExtensionsList: (value: string) => string[]
  }

const script = readFileSync(
  resolve(process.cwd(), 'scripts/test-audio-output-format-matrix.cjs'),
  'utf8'
)

describe('audio output format matrix script', () => {
  it('reads helper-supported extensions before checking samples', () => {
    expect(script).toContain('supportedExtensions')
    expect(script).toContain('supportedModes')
    expect(script).toContain('platformModeCapabilities')
    expect(script).toContain('LUO_AUDIO_OUTPUT_FORMAT_MATRIX_REPORT')
    expect(script).toContain('resolveReportPathFromEnv')
    expect(script).toContain("'format'")
    expect(script).toContain('writeReportIfRequested')
    expect(script).toContain('reportPath: reportPath ?? undefined')
    expect(script).toContain('prepareAudioOutputHelper')
    expect(script).toContain('helperPathSource')
    expect(script).toContain(
      "proof: sampleDir ? 'format-sample-startup' : 'format-capability-manifest'"
    )
    expect(script).toContain("'manifest-only'")
    expect(script).toContain('fromIndex: afterInitializeIndex')
  })

  it('uses an optional sample directory for real decode/playback startup checks', () => {
    expect(script).toContain('LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_DIR')
    expect(script).toContain('LUO_AUDIO_OUTPUT_FORMAT_EXPECTED_EXTENSIONS')
    expect(script).toContain('LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_MANIFEST')
    expect(script).toContain('LUO_AUDIO_OUTPUT_FORMAT_REQUIRE_ALL_SAMPLES')
    expect(script).toContain('listSampleFiles')
    expect(script).toContain('verifySamplePlayback')
    expect(script).toContain("status: started ? 'started' : 'failed'")
    expect(script).toContain("'missing-samples'")
    expect(script).toContain("'unsupported-expected-formats'")
  })

  it('keeps sample playback quiet by default and documents proof limits', () => {
    expect(script).toContain("parseVolumeEnv('LUO_AUDIO_OUTPUT_FORMAT_VOLUME', 0)")
    expect(script).toContain('sample startup proves helper decode/playback initialization')
    expect(script).toContain('manifest-only mode does not prove actual sample playback')
  })

  it('normalizes expected extension lists for sample coverage checks', () => {
    expect(parseExpectedExtensionsList('wav, .FLAC;ogg mp3')).toEqual([
      '.flac',
      '.mp3',
      '.ogg',
      '.wav'
    ])
  })

  it('computes stable sample file identities for format evidence', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-format-identity-'))

    try {
      const samplePath = join(tempRoot, 'sample.wav')
      const sampleBytes = Buffer.from('format sample bytes')
      await writeFile(samplePath, sampleBytes)

      await expect(createFileIdentity(samplePath)).resolves.toEqual({
        byteSize: sampleBytes.length,
        sha256: createHash('sha256').update(sampleBytes).digest('hex')
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('summarizes per-extension sample startup coverage', () => {
    expect(
      createSampleCoverage(
        ['.wav', '.flac'],
        [
          { extension: '.wav', status: 'started' },
          { extension: '.wav', status: 'failed' },
          { extension: '.mp3', status: 'started' }
        ]
      )
    ).toEqual({
      '.flac': {
        total: 0,
        started: 0,
        failed: 0
      },
      '.mp3': {
        total: 1,
        started: 1,
        failed: 0
      },
      '.wav': {
        total: 2,
        started: 1,
        failed: 1
      }
    })
  })

  it('marks expected extensions without samples as missing sample coverage', () => {
    expect(
      createReport(
        { supportedExtensions: ['.wav', '.flac'], supportedModes: ['shared'] },
        [{ extension: '.wav', status: 'started' }],
        'D:\\Samples',
        null,
        { expectedExtensions: ['.wav', '.flac'] }
      )
    ).toMatchObject({
      verdict: 'missing-samples',
      startedSampleExtensions: ['.wav'],
      failedSampleExtensions: [],
      missingExpectedSampleExtensions: ['.flac'],
      missingRequiredSampleExtensions: ['.flac'],
      completeSampleCoverage: false,
      sampleCoverage: {
        '.flac': {
          total: 0,
          started: 0,
          failed: 0
        },
        '.wav': {
          total: 1,
          started: 1,
          failed: 0
        }
      }
    })
  })

  it('can require sample coverage for every helper-declared extension', () => {
    expect(
      createReport(
        { supportedExtensions: ['.wav', '.flac'], supportedModes: ['shared'] },
        [{ extension: '.wav', status: 'started' }],
        'D:\\Samples',
        null,
        { requireAllSamples: true }
      )
    ).toMatchObject({
      verdict: 'missing-samples',
      missingSampleExtensions: ['.flac'],
      missingRequiredSampleExtensions: ['.flac'],
      completeSampleCoverage: false
    })
  })

  it('records unrequired failed samples without failing majority-oriented reports', () => {
    expect(
      createReport(
        { supportedExtensions: ['.wav', '.flac'], supportedModes: ['shared'] },
        [
          { extension: '.wav', status: 'started' },
          { extension: '.flac', status: 'failed' }
        ],
        'D:\\Samples',
        null
      )
    ).toMatchObject({
      verdict: 'samples-started',
      failedSampleExtensions: ['.flac'],
      failedRequiredSampleExtensions: []
    })
  })

  it('fails when strict full coverage has failed samples', () => {
    expect(
      createReport(
        { supportedExtensions: ['.wav', '.flac'], supportedModes: ['shared'] },
        [
          { extension: '.wav', status: 'started' },
          { extension: '.flac', status: 'failed' }
        ],
        'D:\\Samples',
        null,
        { requireAllSamples: true }
      )
    ).toMatchObject({
      verdict: 'sample-failures',
      failedSampleExtensions: ['.flac'],
      failedRequiredSampleExtensions: ['.flac']
    })
  })

  it('rejects expected extensions that the helper does not declare as supported', () => {
    expect(
      createReport(
        { supportedExtensions: ['.wav'], supportedModes: ['shared'] },
        [{ extension: '.wav', status: 'started' }],
        'D:\\Samples',
        null,
        { expectedExtensions: ['.wv'] }
      )
    ).toMatchObject({
      verdict: 'unsupported-expected-formats',
      unsupportedExpectedExtensions: ['.wv']
    })
  })
})
