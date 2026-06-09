import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  aliasSamples,
  getSamplesToPrepare,
  optionalOpusSamples,
  parseArgs,
  shouldIncludeOpusSamples,
  sourceSamples
} = require('../../scripts/test-audio-output-format-matrix-ffmpeg-samples.cjs') as {
  aliasSamples: Array<{ fileName: string; sourceFileName: string }>
  getSamplesToPrepare: (options?: { includeOpusSamples?: boolean }) => Array<{
    fileName: string
    sourcePath: string
  }>
  optionalOpusSamples: Array<{ fileName: string; sourcePath: string }>
  parseArgs: (argv: string[]) => {
    sampleDir?: string
    report?: string
    keepSamples?: boolean
    includeOpusSamples?: boolean
    requireAllSamples?: boolean
    help?: boolean
  }
  shouldIncludeOpusSamples: (
    options?: { includeOpusSamples?: boolean },
    env?: Record<string, string | undefined>
  ) => boolean
  sourceSamples: Array<{ fileName: string; sourcePath: string }>
}

const script = readFileSync(
  resolve(process.cwd(), 'scripts/test-audio-output-format-matrix-ffmpeg-samples.cjs'),
  'utf8'
)

describe('audio output FFmpeg sample matrix script', () => {
  it('declares a reproducible public sample set for every default helper extension', () => {
    const files = new Set([
      ...getSamplesToPrepare().map(sample => sample.fileName),
      ...aliasSamples.map(sample => sample.fileName)
    ])

    expect([...files].sort()).toEqual([
      'sample.aac',
      'sample.aif',
      'sample.aiff',
      'sample.ape',
      'sample.caf',
      'sample.flac',
      'sample.m2a',
      'sample.m4a',
      'sample.mka',
      'sample.mp1',
      'sample.mp2',
      'sample.mp3',
      'sample.mpa',
      'sample.oga',
      'sample.ogg',
      'sample.wav'
    ])
    expect(optionalOpusSamples.map(sample => sample.fileName).sort()).toEqual([
      'sample.opus',
      'sample.webm'
    ])
  })

  it('can prepare optional Opus/WebM samples when the helper is built with Opus support', () => {
    const files = new Set(
      getSamplesToPrepare({ includeOpusSamples: true }).map(sample => sample.fileName)
    )

    expect(files.has('sample.opus')).toBe(true)
    expect(files.has('sample.webm')).toBe(true)
    expect(shouldIncludeOpusSamples({}, { LUO_AUDIO_OUTPUT_HELPER_FEATURES: 'opus' })).toBe(true)
    expect(shouldIncludeOpusSamples({}, { LUO_AUDIO_OUTPUT_HELPER_FEATURES: 'opus-bundled' })).toBe(
      true
    )
    expect(
      shouldIncludeOpusSamples({}, { LUO_AUDIO_OUTPUT_FORMAT_INCLUDE_OPUS_SAMPLES: '1' })
    ).toBe(true)
    expect(shouldIncludeOpusSamples({}, {})).toBe(false)
  })

  it('aliases equivalent samples only after downloading their source files', () => {
    expect(aliasSamples).toEqual([
      { fileName: 'sample.aiff', sourceFileName: 'sample.aif' },
      { fileName: 'sample.m2a', sourceFileName: 'sample.mp2' },
      { fileName: 'sample.mpa', sourceFileName: 'sample.mp2' },
      { fileName: 'sample.oga', sourceFileName: 'sample.ogg' }
    ])
    for (const alias of aliasSamples) {
      expect(sourceSamples.some(sample => sample.fileName === alias.sourceFileName)).toBe(true)
    }
  })

  it('runs the sample startup matrix with optional strict full coverage', () => {
    expect(script).toContain('LUO_AUDIO_OUTPUT_FORMAT_SAMPLE_DIR')
    expect(script).toContain("'--require-all-samples'")
    expect(script).toContain("LUO_AUDIO_OUTPUT_FORMAT_REQUIRE_ALL_SAMPLES: '1'")
    expect(script).toContain('LUO_AUDIO_OUTPUT_HELPER_FEATURES')
    expect(script).toContain('LUO_AUDIO_OUTPUT_FORMAT_INCLUDE_OPUS_SAMPLES')
    expect(script).toContain('test-audio-output-format-matrix.cjs')
    expect(script).toContain('samples.ffmpeg.org')
  })

  it('parses CLI options without touching the network', () => {
    expect(
      parseArgs([
        '--sample-dir',
        'D:\\Samples',
        '--report',
        'D:\\Reports\\format.json',
        '--keep-samples',
        '--include-opus-samples',
        '--require-all-samples'
      ])
    ).toEqual({
      sampleDir: 'D:\\Samples',
      report: 'D:\\Reports\\format.json',
      keepSamples: true,
      includeOpusSamples: true,
      requireAllSamples: true
    })
    expect(parseArgs(['--help'])).toEqual({ help: true })
  })

  it('rejects unknown or incomplete CLI options', () => {
    expect(() => parseArgs(['--sample-dir'])).toThrow('Missing value for --sample-dir')
    expect(() => parseArgs(['--wat'])).toThrow('Unknown argument: --wat')
  })
})
