import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createWindowsProofNextSteps, proofDirReportNames, resolveWindowsProofOptions, runCli } =
  require('../../scripts/check-audio-output-windows-proof.cjs') as {
    createWindowsProofNextSteps: (
      report: {
        complete: boolean
        reports: Array<{
          type: string
          accepted: boolean
        }>
        missingProof: string[]
      },
      proofDir?: string
    ) => Array<{
      type: string
      title: string
      command: string
      requires: string[]
    }>
    proofDirReportNames: Record<string, string>
    resolveWindowsProofOptions: (
      options?: Record<string, unknown>,
      env?: Record<string, string | undefined>
    ) => {
      proofDir?: string
      options: {
        remote?: string
        voicemeeter?: string
        bitPerfect?: string
        loopback?: string
        format: string[]
        report?: string
        requiredFormatPlatforms: string[]
        minFormatSampleCoverage: number
        requiredRemoteNativeMode?: string
        requireAllFormatSamples?: boolean
      }
    }
    runCli: (
      argv: string[],
      streams?: {
        stdout?: { write: (value: string) => void }
        stderr?: { write: (value: string) => void }
      },
      env?: Record<string, string | undefined>
    ) => number
  }

const proofSha256 = 'a'.repeat(64)
const sampleSha256 = 'b'.repeat(64)

const completeReports = {
  remote: {
    verdict: 'refreshable',
    proof: 'remote-refresh-range',
    mode: 'live',
    expired: {
      status: 403,
      rejectedAsExpiredAuth: true
    },
    fresh: {
      status: 206,
      acceptedAfterRefresh: true,
      cacheableAfterRefresh: true,
      rangeSupported: true,
      contentRange: 'bytes 0-1023/4096',
      bytesReceived: 1024,
      contentType: 'audio/mpeg',
      bodySha256: 'c'.repeat(64)
    },
    nativePlayback: {
      attempted: true,
      started: true,
      extension: '.mp3',
      bytesReceived: 1024,
      bodySha256: 'c'.repeat(64),
      contentType: 'audio/mpeg',
      requestedMode: 'exclusive',
      nativePlaybackState: 'playing',
      nativePlaybackSource: 'D:\\Cache\\fresh-audio.mp3',
      activeMode: 'exclusive'
    }
  },
  voicemeeter: {
    verdict: 'routed-and-restored',
    proof: 'voicemeeter-remote-route-and-restore',
    bus: 'A1',
    routeBus: 'A1',
    routeApplied: true,
    routeManaged: true,
    routeRestored: true,
    remoteKind: 'banana',
    virtualInputStrip: 3,
    levelActivityDetected: true,
    levelProbe: {
      active: true,
      target: 'virtualInput',
      bus: 'A1',
      strip: 3,
      channelStart: 0,
      channels: 2,
      samples: 25,
      activeSamples: 8,
      maxLevel: 0.09,
      threshold: 0.001
    },
    nativePlayback: {
      attempted: true,
      started: true,
      path: 'D:\\Samples\\voicemeeter-native-playback.wav',
      byteSize: 96044,
      sha256: 'e'.repeat(64),
      playbackToken: 'voicemeeter-native-proof',
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      nativePlaybackState: 'playing',
      nativePlaybackSource: 'D:\\Samples\\voicemeeter-native-playback.wav'
    },
    requiresManualAudibilityCheck: true,
    manualAudibilityConfirmed: true,
    restoreStatus: {
      voicemeeterRemote: {
        kind: 'banana',
        routeApplied: true,
        routeManaged: false,
        routeBus: 'A1'
      }
    }
  },
  bitPerfect: {
    verdict: 'candidate',
    proof: 'candidate-only',
    requiresExternalVerification: true,
    bitPerfectRequired: true,
    audioFileIdentity: {
      sha256: proofSha256
    }
  },
  loopback: {
    verdict: 'verified',
    proof: 'candidate-plus-loopback',
    verified: true,
    candidateMatchedSource: true,
    requiresExternalVerification: false,
    partialComparison: false,
    allowFormatConversion: false,
    source: {
      sha256: proofSha256
    },
    candidate: {
      audioFileIdentity: {
        sha256: proofSha256
      }
    }
  },
  format: {
    verdict: 'samples-started',
    proof: 'format-sample-startup',
    platform: 'win32',
    platformModeCapabilities: {
      shared: true,
      exclusive: true,
      voicemeeter: true
    },
    supportedExtensions: ['.flac', '.wav'],
    sampledExtensions: ['.flac', '.wav'],
    startedSampleExtensions: ['.flac', '.wav'],
    failedSampleExtensions: [],
    missingSampleExtensions: [],
    samples: [
      {
        extension: '.flac',
        status: 'started',
        path: 'D:\\Samples\\proof.flac',
        byteSize: 2048,
        sha256: sampleSha256
      },
      {
        extension: '.wav',
        status: 'started',
        path: 'D:\\Samples\\proof.wav',
        byteSize: 4096,
        sha256: 'd'.repeat(64)
      }
    ]
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeProofDir(
  tempRoot: string,
  overrides: Partial<typeof completeReports> = {}
): Promise<void> {
  await writeJson(
    join(tempRoot, proofDirReportNames.remote),
    overrides.remote ?? completeReports.remote
  )
  await writeJson(
    join(tempRoot, proofDirReportNames.voicemeeter),
    overrides.voicemeeter ?? completeReports.voicemeeter
  )
  await writeJson(
    join(tempRoot, proofDirReportNames.bitPerfect),
    overrides.bitPerfect ?? completeReports.bitPerfect
  )
  await writeJson(
    join(tempRoot, proofDirReportNames.loopback),
    overrides.loopback ?? completeReports.loopback
  )
  await writeJson(
    join(tempRoot, proofDirReportNames.format),
    overrides.format ?? completeReports.format
  )
}

describe('check-audio-output-windows-proof.cjs', () => {
  it('resolves standard proof-dir report names and requires win32 format proof', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-windows-proof-options-'))

    try {
      const resolved = resolveWindowsProofOptions({ proofDir: tempRoot }, {})

      expect(resolved.proofDir).toBe(tempRoot)
      expect(resolved.options).toMatchObject({
        remote: join(tempRoot, proofDirReportNames.remote),
        voicemeeter: join(tempRoot, proofDirReportNames.voicemeeter),
        bitPerfect: join(tempRoot, proofDirReportNames.bitPerfect),
        loopback: join(tempRoot, proofDirReportNames.loopback),
        format: [join(tempRoot, proofDirReportNames.format)],
        report: join(tempRoot, proofDirReportNames.report),
        requiredRemoteNativeMode: 'exclusive',
        requiredFormatPlatforms: ['win32'],
        minFormatSampleCoverage: 0.75
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('can pass through a stricter format sample coverage policy', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-windows-proof-strict-options-'))

    try {
      const resolved = resolveWindowsProofOptions(
        {
          proofDir: tempRoot,
          minFormatSampleCoverage: 0.9,
          requireAllFormatSamples: true
        },
        {}
      )

      expect(resolved.options).toMatchObject({
        minFormatSampleCoverage: 0.9,
        requireAllFormatSamples: true
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('writes a complete Windows proof bundle from a standard proof directory', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-windows-proof-complete-'))

    try {
      await writeProofDir(tempRoot)

      let stdout = ''
      const exitCode = runCli(
        ['--proof-dir', tempRoot],
        {
          stdout: { write: value => (stdout += value) },
          stderr: { write: () => undefined }
        },
        {}
      )

      expect(exitCode).toBe(0)
      expect(JSON.parse(stdout)).toMatchObject({
        verdict: 'complete',
        complete: true,
        scope: 'windows-native-audio-output-proof',
        requiredFormatPlatforms: ['win32'],
        minimumFormatSampleCoverageRatio: 0.75,
        requireAllFormatSamples: false,
        nextSteps: [],
        proofDir: tempRoot,
        reportPath: join(tempRoot, proofDirReportNames.report)
      })

      const savedReport = JSON.parse(
        await readFile(join(tempRoot, proofDirReportNames.report), 'utf8')
      )
      expect(savedReport).toMatchObject({
        verdict: 'complete',
        complete: true,
        scope: 'windows-native-audio-output-proof'
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept a non-Windows format report as Windows completion proof', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-windows-proof-platform-'))

    try {
      await writeProofDir(tempRoot, {
        format: {
          ...completeReports.format,
          platform: 'linux',
          platformModeCapabilities: {
            shared: true,
            exclusive: false,
            voicemeeter: false
          }
        }
      })

      let stdout = ''
      const exitCode = runCli(
        ['--proof-dir', tempRoot],
        {
          stdout: { write: value => (stdout += value) },
          stderr: { write: () => undefined }
        },
        {}
      )

      expect(exitCode).toBe(2)
      const report = JSON.parse(stdout)
      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false,
        scope: 'windows-native-audio-output-proof'
      })
      expect(report.missingProof).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'Missing accepted format matrix report for required platform: win32'
          )
        ])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept shared remote native playback as Windows exclusive completion proof', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-windows-proof-remote-mode-'))

    try {
      await writeProofDir(tempRoot, {
        remote: {
          ...completeReports.remote,
          nativePlayback: {
            ...completeReports.remote.nativePlayback,
            requestedMode: 'shared',
            activeMode: 'shared'
          }
        }
      })

      let stdout = ''
      const exitCode = runCli(
        ['--proof-dir', tempRoot],
        {
          stdout: { write: value => (stdout += value) },
          stderr: { write: () => undefined }
        },
        {}
      )

      expect(exitCode).toBe(2)
      const report = JSON.parse(stdout)
      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false,
        scope: 'windows-native-audio-output-proof'
      })
      expect(report.nextSteps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'remote',
            command: expect.stringContaining('LUO_AUDIO_OUTPUT_REMOTE_NATIVE_MODE')
          })
        ])
      )
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'remote',
            accepted: false,
            nativePlaybackRequestedMode: 'shared',
            nativePlaybackActiveMode: 'shared',
            requiredRemoteNativeMode: 'exclusive'
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'Remote refresh report must prove the refreshed audio bytes started through the native helper in exclusive mode.'
          )
        ])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('suggests concrete proof commands for missing Windows proof items', () => {
    const nextSteps = createWindowsProofNextSteps(
      {
        complete: false,
        reports: [
          { type: 'remote', accepted: false },
          { type: 'voicemeeter', accepted: false },
          { type: 'bitPerfect', accepted: true },
          { type: 'loopback', accepted: false },
          { type: 'format', accepted: true }
        ],
        missingProof: [
          'Remote refresh report must prove the refreshed audio bytes started through the native helper in exclusive mode.',
          'Voicemeeter report must record manual confirmation that the test tone was heard on the selected bus.',
          'Missing bit-perfect loopback report.'
        ]
      },
      'D:\\Captures\\luo-audio-output'
    )

    expect(nextSteps).toEqual([
      expect.objectContaining({
        type: 'remote',
        command: expect.stringContaining('test:audio-output:remote-refresh'),
        requires: expect.arrayContaining([
          expect.stringContaining('LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_URL')
        ])
      }),
      expect.objectContaining({
        type: 'voicemeeter',
        command: expect.stringContaining('LUO_AUDIO_OUTPUT_VOICEMEETER_AUDIBILITY_CONFIRMED')
      }),
      expect.objectContaining({
        type: 'loopback',
        command: expect.stringContaining('test:audio-output:loopback')
      })
    ])
  })
})
