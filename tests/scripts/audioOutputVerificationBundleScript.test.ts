import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { checkVerificationBundle, runCli } =
  require('../../scripts/check-audio-output-verification-bundle.cjs') as {
    checkVerificationBundle: (
      options?: Record<string, unknown>,
      env?: Record<string, string | undefined>
    ) => {
      verdict: 'complete' | 'incomplete'
      complete: boolean
      reportPath?: string
      reports: Array<{
        type: string
        accepted: boolean
        reason: string
        proofStrength?: string
        expiredStatus?: number
        freshStatus?: number
        freshBytesReceived?: number
        freshContentType?: string
        freshContentTypeAccepted?: boolean
        freshRangeSupported?: boolean
        nativePlaybackStarted?: boolean
        nativePlaybackState?: string
        nativePlaybackRequestedMode?: string
        nativePlaybackActiveMode?: string
        nativePlaybackBytesReceived?: number
        requiredRemoteNativeMode?: string
        requestedBus?: string
        routeBus?: string
        remoteKind?: string
        restoreRemoteKind?: string
        virtualInputStrip?: number
        levelActivityDetected?: boolean
        levelProbeTarget?: string
        levelProbeMaxLevel?: number
        levelProbeActiveSamples?: number
        nativePlaybackProofAccepted?: boolean
        nativePlaybackSource?: string
        nativePlaybackSha256?: string
        routeRestored?: boolean
        requiresManualAudibilityCheck?: boolean
        manualAudibilityConfirmed?: boolean
        audioFileSha256?: string
        bitPerfectRequired?: boolean
        sourceSha256?: string
        candidateSha256?: string
        allowFormatConversion?: boolean
        missingSampleExtensions?: string[]
        missingStartedSampleExtensions?: string[]
        missingStartedSampleIdentityCount?: number
        startedSupportedSampleExtensions?: string[]
        startedSampleCoverageRatio?: number
        minimumStartedSampleCoverageRatio?: number
        majoritySampleCoverage?: boolean
        failedSampleCount?: number
        malformedSampleCount?: number
        overclaimedSampleExtensions?: string[]
        platform?: string
        platformModeCapabilities?: {
          shared?: boolean
          exclusive?: boolean
          voicemeeter?: boolean
        }
      }>
      missingProof: string[]
    }
    runCli: (
      argv: string[],
      streams?: {
        stdout?: { write: (value: string) => void }
        stderr?: { write: (value: string) => void }
      }
    ) => number
  }

const proofSha256 = 'a'.repeat(64)
const otherProofSha256 = 'b'.repeat(64)

const successfulReports = {
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
      requestedMode: 'shared',
      nativePlaybackState: 'playing',
      nativePlaybackSource: 'D:\\Cache\\fresh-audio.mp3',
      activeMode: 'shared'
    }
  },
  voicemeeter: {
    verdict: 'routed-and-restored',
    proof: 'voicemeeter-remote-route-and-restore',
    routeApplied: true,
    routeManaged: true,
    routeRestored: true,
    requiresManualAudibilityCheck: true,
    manualAudibilityConfirmed: true,
    bus: 'A1',
    routeBus: 'A1',
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
      sha256: 'f'.repeat(64),
      playbackToken: 'voicemeeter-native-proof',
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      nativePlaybackState: 'playing',
      nativePlaybackSource: 'D:\\Samples\\voicemeeter-native-playback.wav'
    },
    restoreStatus: {
      voicemeeterRemote: {
        routeApplied: true,
        routeManaged: false,
        routeBus: 'A1',
        kind: 'banana'
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
    comparedFrames: 4,
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
    missingSampleExtensions: [] as string[],
    samples: [
      {
        path: 'D:\\Samples\\proof.flac',
        extension: '.flac',
        byteSize: 1024,
        sha256: 'd'.repeat(64),
        status: 'started',
        nativePlaybackState: 'playing',
        activeMode: 'shared'
      },
      {
        path: 'D:\\Samples\\proof.wav',
        extension: '.wav',
        byteSize: 2048,
        sha256: 'e'.repeat(64),
        status: 'started',
        nativePlaybackState: 'playing',
        activeMode: 'shared'
      }
    ]
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

type ReportBundleKey = keyof typeof successfulReports

async function createReportBundle(
  tempRoot: string,
  overrides: Partial<Record<ReportBundleKey, unknown>> = {}
): Promise<Record<ReportBundleKey, string>> {
  const paths = {
    remote: join(tempRoot, 'remote-refresh.json'),
    voicemeeter: join(tempRoot, 'voicemeeter-route.json'),
    bitPerfect: join(tempRoot, 'candidate.json'),
    loopback: join(tempRoot, 'candidate-plus-loopback.json'),
    format: join(tempRoot, 'format-matrix.json')
  }

  await Promise.all(
    Object.entries(paths).map(([key, filePath]) =>
      writeJson(
        filePath,
        overrides[key as ReportBundleKey] ?? successfulReports[key as ReportBundleKey]
      )
    )
  )

  return paths
}

describe('audio output verification bundle script', () => {
  it('accepts a complete set of strong audio-output verification reports', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-'))

    try {
      const paths = await createReportBundle(tempRoot)
      const stdout: string[] = []

      expect(
        runCli(
          [
            '--remote',
            paths.remote,
            '--voicemeeter',
            paths.voicemeeter,
            '--bit-perfect',
            paths.bitPerfect,
            '--loopback',
            paths.loopback,
            '--format',
            paths.format
          ],
          {
            stdout: { write: value => stdout.push(value) }
          }
        )
      ).toBe(0)

      const report = JSON.parse(stdout.at(-1) ?? '{}')
      expect(report).toMatchObject({
        verdict: 'complete',
        complete: true,
        proof: 'audio-output-verification-bundle'
      })
      expect(report.reports).toHaveLength(5)
      expect(report.reports.every((entry: { accepted: boolean }) => entry.accepted)).toBe(true)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('saves the final verification bundle report when requested', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-report-'))

    try {
      const paths = await createReportBundle(tempRoot)
      const reportPath = join(tempRoot, 'final', 'verification-bundle.json')
      const stdout: string[] = []

      expect(
        runCli(
          [
            '--remote',
            paths.remote,
            '--voicemeeter',
            paths.voicemeeter,
            '--bit-perfect',
            paths.bitPerfect,
            '--loopback',
            paths.loopback,
            '--format',
            paths.format,
            '--report',
            reportPath
          ],
          {
            stdout: { write: value => stdout.push(value) }
          }
        )
      ).toBe(0)

      const printedReport = JSON.parse(stdout.at(-1) ?? '{}')
      const savedReport = JSON.parse(await readFile(reportPath, 'utf8'))
      expect(savedReport).toEqual(printedReport)
      expect(savedReport).toMatchObject({
        verdict: 'complete',
        complete: true,
        reportPath
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept mock remote or manifest-only format reports as completion proof by default', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-weak-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        remote: {
          ...successfulReports.remote,
          mode: 'mock'
        },
        format: {
          ...successfulReports.format,
          verdict: 'manifest-only',
          proof: 'format-capability-manifest'
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'remote',
            accepted: false,
            proofStrength: 'mock'
          }),
          expect.objectContaining({
            type: 'format',
            accepted: false
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([
          expect.stringContaining('mock mode'),
          expect.stringContaining('samples-started evidence')
        ])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept live remote reports without native helper playback proof', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-remote-native-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        remote: {
          ...successfulReports.remote,
          nativePlayback: {
            attempted: true,
            started: false,
            bytesReceived: 1024,
            bodySha256: 'c'.repeat(64),
            contentType: 'audio/mpeg',
            nativePlaybackState: 'error',
            activeMode: 'shared'
          }
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'remote',
            accepted: false,
            nativePlaybackStarted: false,
            nativePlaybackState: 'error'
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('native helper')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('can require online native remote playback proof in WASAPI exclusive mode', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-remote-exclusive-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        remote: {
          ...successfulReports.remote,
          nativePlayback: {
            ...successfulReports.remote.nativePlayback,
            requestedMode: 'exclusive',
            activeMode: 'exclusive'
          }
        }
      })

      const accepted = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format],
        requiredRemoteNativeMode: 'exclusive'
      })

      expect(accepted).toMatchObject({
        verdict: 'complete',
        complete: true
      })
      expect(accepted.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'remote',
            accepted: true,
            nativePlaybackRequestedMode: 'exclusive',
            nativePlaybackActiveMode: 'exclusive',
            requiredRemoteNativeMode: 'exclusive'
          })
        ])
      )

      const rejected = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format],
        requiredRemoteNativeMode: 'shared'
      })

      expect(rejected).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(rejected.missingProof).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'Remote refresh report must prove the refreshed audio bytes started through the native helper in shared mode.'
          )
        ])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('can accept mock remote and manifest-only format reports for explicit dry runs', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-dry-run-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        remote: {
          ...successfulReports.remote,
          mode: 'mock'
        },
        format: {
          ...successfulReports.format,
          verdict: 'manifest-only',
          proof: 'format-capability-manifest'
        }
      })

      expect(
        checkVerificationBundle({
          remote: paths.remote,
          voicemeeter: paths.voicemeeter,
          bitPerfect: paths.bitPerfect,
          loopback: paths.loopback,
          format: [paths.format],
          allowMockRemote: true,
          allowRemoteRefreshOnly: true,
          allowFormatManifestOnly: true
        })
      ).toMatchObject({
        verdict: 'complete',
        complete: true,
        missingProof: []
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept remote refresh reports without cacheable refreshed audio bytes', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-remote-bytes-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        remote: {
          ...successfulReports.remote,
          fresh: {
            ...successfulReports.remote.fresh,
            bytesReceived: 0,
            cacheableAfterRefresh: false
          }
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'remote',
            accepted: false,
            freshBytesReceived: 0
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('cacheable audio bytes')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept remote refresh reports that return an HTML or JSON payload', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-remote-content-type-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        remote: {
          ...successfulReports.remote,
          fresh: {
            ...successfulReports.remote.fresh,
            contentType: 'text/html; charset=utf-8'
          }
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'remote',
            accepted: false,
            freshContentType: 'text/html; charset=utf-8',
            freshContentTypeAccepted: false
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('audio content type')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept Voicemeeter reports whose applied route bus differs from the request', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-voicemeeter-bus-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        voicemeeter: {
          ...successfulReports.voicemeeter,
          bus: 'A1',
          routeBus: 'A2'
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'voicemeeter',
            accepted: false,
            requestedBus: 'A1',
            routeBus: 'A2'
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('route bus matches the requested bus')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept Voicemeeter reports without explicit restore release proof', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-voicemeeter-restore-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        voicemeeter: {
          ...successfulReports.voicemeeter,
          restoreStatus: {
            voicemeeterRemote: {
              routeApplied: true,
              routeManaged: true,
              routeBus: 'A1'
            }
          }
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'voicemeeter',
            accepted: false,
            routeRestored: true
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('managed route was released')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('accepts Voicemeeter restore proof when the managed bus is restored to off', async () => {
    const tempRoot = await mkdtemp(
      join(tmpdir(), 'luo-audio-proof-bundle-voicemeeter-restore-off-')
    )

    try {
      const paths = await createReportBundle(tempRoot, {
        voicemeeter: {
          ...successfulReports.voicemeeter,
          restoreStatus: {
            voicemeeterRemote: {
              kind: 'banana',
              routeApplied: false,
              routeManaged: false,
              routeBus: 'A1'
            }
          }
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'complete',
        complete: true
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'voicemeeter',
            accepted: true,
            routeRestored: true
          })
        ])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('accepts Voicemeeter reports with native playback proof when Remote API level activity is silent', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-voicemeeter-level-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        voicemeeter: {
          ...successfulReports.voicemeeter,
          levelActivityDetected: false,
          levelProbe: {
            active: false,
            target: 'virtualInput',
            bus: 'A1',
            strip: 3,
            channelStart: 0,
            channels: 2,
            samples: 25,
            activeSamples: 0,
            maxLevel: 0,
            threshold: 0.001
          }
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'complete',
        complete: true
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'voicemeeter',
            accepted: true,
            levelActivityDetected: false,
            levelProbeActiveSamples: 0,
            nativePlaybackProofAccepted: true,
            nativePlaybackStarted: true,
            nativePlaybackState: 'playing',
            nativePlaybackSha256: 'f'.repeat(64)
          })
        ])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept Voicemeeter reports without level activity or native playback proof', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-voicemeeter-output-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        voicemeeter: {
          ...successfulReports.voicemeeter,
          levelActivityDetected: false,
          levelProbe: {
            active: false,
            target: 'virtualInput',
            bus: 'A1',
            strip: 3,
            channelStart: 0,
            channels: 2,
            samples: 25,
            activeSamples: 0,
            maxLevel: 0,
            threshold: 0.001
          },
          nativePlayback: {
            ...successfulReports.voicemeeter.nativePlayback,
            started: false,
            nativePlaybackState: 'error'
          }
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'voicemeeter',
            accepted: false,
            levelActivityDetected: false,
            nativePlaybackProofAccepted: false,
            nativePlaybackStarted: false,
            nativePlaybackState: 'error'
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('native Voicemeeter playFile startup')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept Voicemeeter reports without recorded manual audibility confirmation', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-voicemeeter-audibility-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        voicemeeter: {
          ...successfulReports.voicemeeter,
          manualAudibilityConfirmed: false
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'voicemeeter',
            accepted: false,
            manualAudibilityConfirmed: false
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('manual confirmation')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept Voicemeeter reports without a recognized Remote API kind', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-voicemeeter-kind-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        voicemeeter: {
          ...successfulReports.voicemeeter,
          remoteKind: 'unknown'
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'voicemeeter',
            accepted: false,
            remoteKind: ''
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('recognized Remote API kind')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept Voicemeeter reports whose restore kind differs from the routed kind', async () => {
    const tempRoot = await mkdtemp(
      join(tmpdir(), 'luo-audio-proof-bundle-voicemeeter-kind-restore-')
    )

    try {
      const paths = await createReportBundle(tempRoot, {
        voicemeeter: {
          ...successfulReports.voicemeeter,
          remoteKind: 'banana',
          restoreStatus: {
            voicemeeterRemote: {
              routeApplied: true,
              routeManaged: false,
              routeBus: 'A1',
              kind: 'potato'
            }
          }
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'voicemeeter',
            accepted: false,
            remoteKind: 'banana',
            restoreRemoteKind: 'potato'
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('preserve it through restore')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept partial format sample coverage by default', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-partial-format-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        format: {
          ...successfulReports.format,
          sampledExtensions: ['.wav'],
          startedSampleExtensions: ['.wav'],
          missingSampleExtensions: ['.flac'],
          samples: [successfulReports.format.samples[1]]
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'format',
            accepted: false,
            missingSampleExtensions: ['.flac']
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('at least 75% coverage')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('accepts majority format sample coverage for final proof', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-majority-format-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        format: {
          ...successfulReports.format,
          supportedExtensions: ['.aac', '.flac', '.mp3', '.wav'],
          sampledExtensions: ['.aac', '.flac', '.mp3', '.wav'],
          startedSampleExtensions: ['.flac', '.mp3', '.wav'],
          failedSampleExtensions: ['.aac'],
          missingSampleExtensions: [],
          samples: [
            successfulReports.format.samples[0],
            {
              ...successfulReports.format.samples[1],
              extension: '.mp3',
              path: 'D:\\Samples\\proof.mp3'
            },
            {
              ...successfulReports.format.samples[1],
              extension: '.wav',
              path: 'D:\\Samples\\proof.wav'
            },
            {
              ...successfulReports.format.samples[1],
              extension: '.aac',
              path: 'D:\\Samples\\proof.aac',
              status: 'failed',
              nativePlaybackState: 'error'
            }
          ]
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'complete',
        complete: true
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'format',
            accepted: true,
            completeSampleCoverage: false,
            majoritySampleCoverage: true,
            startedSupportedSampleExtensions: ['.flac', '.mp3', '.wav'],
            startedSampleCoverageRatio: 0.75,
            minimumStartedSampleCoverageRatio: 0.75,
            failedSampleCount: 1,
            missingSampleExtensions: []
          })
        ])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('can still require full format sample coverage for strict final proof', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-strict-format-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        format: {
          ...successfulReports.format,
          supportedExtensions: ['.aac', '.flac', '.mp3', '.wav'],
          sampledExtensions: ['.flac', '.mp3', '.wav'],
          startedSampleExtensions: ['.flac', '.mp3', '.wav'],
          missingSampleExtensions: ['.aac'],
          samples: [
            successfulReports.format.samples[0],
            {
              ...successfulReports.format.samples[1],
              extension: '.mp3',
              path: 'D:\\Samples\\proof.mp3'
            },
            {
              ...successfulReports.format.samples[1],
              extension: '.wav',
              path: 'D:\\Samples\\proof.wav'
            }
          ]
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format],
        requireAllFormatSamples: true
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'format',
            accepted: false,
            majoritySampleCoverage: true,
            missingSampleExtensions: ['.aac']
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('all declared extensions')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept a candidate report from a different source than the loopback proof', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-sha-mismatch-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        bitPerfect: {
          ...successfulReports.bitPerfect,
          audioFileIdentity: {
            sha256: otherProofSha256
          }
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'bundleConsistency',
            accepted: false,
            audioFileSha256: otherProofSha256
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('does not match any accepted loopback')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept bit-perfect candidates captured without the required guard', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-bit-perfect-guard-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        bitPerfect: {
          ...successfulReports.bitPerfect,
          bitPerfectRequired: false
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'bitPerfect',
            accepted: false,
            bitPerfectRequired: false
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('bitPerfectRequired=true')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept partial loopback comparisons as final bit-perfect proof', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-partial-loopback-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        loopback: {
          ...successfulReports.loopback,
          partialComparison: true
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'loopback',
            accepted: false,
            partialComparison: true
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('full source range')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept loopback reports that allow sample format conversion', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-converted-loopback-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        loopback: {
          ...successfulReports.loopback,
          allowFormatConversion: true
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'loopback',
            accepted: false,
            allowFormatConversion: true
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('must not allow sample format')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept loopback reports whose source and capture paths are identical', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-same-loopback-path-'))

    try {
      const samePath = join(tempRoot, 'same.wav')
      const paths = await createReportBundle(tempRoot, {
        loopback: {
          ...successfulReports.loopback,
          source: {
            ...successfulReports.loopback.source,
            path: samePath
          },
          capture: {
            path: samePath,
            sha256: 'f'.repeat(64)
          }
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'loopback',
            accepted: false,
            identicalSourceCapturePath: true
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('source and capture paths are identical')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('can accept partial format sample coverage for explicit dry runs', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-partial-format-dry-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        format: {
          ...successfulReports.format,
          sampledExtensions: ['.wav'],
          startedSampleExtensions: ['.wav'],
          missingSampleExtensions: ['.flac'],
          samples: [successfulReports.format.samples[1]]
        }
      })

      expect(
        checkVerificationBundle({
          remote: paths.remote,
          voicemeeter: paths.voicemeeter,
          bitPerfect: paths.bitPerfect,
          loopback: paths.loopback,
          format: [paths.format],
          allowPartialFormatSamples: true
        })
      ).toMatchObject({
        verdict: 'complete',
        complete: true,
        missingProof: []
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept format reports without per-sample startup details', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-format-no-samples-'))

    try {
      const { samples: _samples, ...formatWithoutSamples } = successfulReports.format
      const paths = await createReportBundle(tempRoot, {
        format: formatWithoutSamples
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'format',
            accepted: false
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('per-sample startup details')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept format reports with failed sample startup entries', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-format-failed-sample-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        format: {
          ...successfulReports.format,
          samples: [
            successfulReports.format.samples[0],
            {
              ...successfulReports.format.samples[1],
              status: 'failed',
              nativePlaybackState: 'error'
            }
          ]
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'format',
            accepted: false,
            failedSampleCount: 1
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('at least 75% coverage')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept format reports whose started samples lack file identity', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-format-identity-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        format: {
          ...successfulReports.format,
          samples: [
            {
              ...successfulReports.format.samples[0],
              byteSize: 0,
              sha256: 'not-a-sha'
            },
            successfulReports.format.samples[1]
          ]
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'format',
            accepted: false,
            missingStartedSampleIdentityCount: 1
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('byteSize and SHA-256')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not accept format reports whose sampled extension summary overstates started samples', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-format-overclaimed-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        format: {
          ...successfulReports.format,
          samples: [successfulReports.format.samples[1]]
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'format',
            accepted: false,
            overclaimedSampleExtensions: ['.flac']
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([expect.stringContaining('claims sampled extensions')])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('can require accepted format reports for specific platforms', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-platforms-'))

    try {
      const paths = await createReportBundle(tempRoot)
      const linuxFormatPath = join(tempRoot, 'format-matrix-linux.json')
      await writeJson(linuxFormatPath, {
        ...successfulReports.format,
        platform: 'linux',
        platformModeCapabilities: {
          shared: true,
          exclusive: false,
          voicemeeter: false
        }
      })

      const accepted = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format, linuxFormatPath],
        requiredFormatPlatforms: ['win32', 'linux']
      })

      expect(accepted).toMatchObject({
        verdict: 'complete',
        complete: true
      })

      const missingDarwin = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format, linuxFormatPath],
        requiredFormatPlatforms: ['win32', 'darwin', 'linux']
      })

      expect(missingDarwin).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(missingDarwin.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'bundleConsistency',
            accepted: false,
            platform: 'darwin'
          })
        ])
      )
      expect(missingDarwin.missingProof).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Missing accepted format matrix report for required platform')
        ])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects platform mode capabilities that overstate current non-Windows backends', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-audio-proof-bundle-platform-mode-'))

    try {
      const paths = await createReportBundle(tempRoot, {
        format: {
          ...successfulReports.format,
          platform: 'darwin',
          platformModeCapabilities: {
            shared: true,
            exclusive: true,
            voicemeeter: false
          }
        }
      })

      const report = checkVerificationBundle({
        remote: paths.remote,
        voicemeeter: paths.voicemeeter,
        bitPerfect: paths.bitPerfect,
        loopback: paths.loopback,
        format: [paths.format]
      })

      expect(report).toMatchObject({
        verdict: 'incomplete',
        complete: false
      })
      expect(report.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'format',
            accepted: false,
            platform: 'darwin'
          })
        ])
      )
      expect(report.missingProof).toEqual(
        expect.arrayContaining([
          expect.stringContaining('darwin format report should only declare shared mode')
        ])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('reports missing bundle inputs when no report paths are configured', () => {
    const report = checkVerificationBundle({}, {})

    expect(report).toMatchObject({
      verdict: 'incomplete',
      complete: false
    })
    expect(report.reports).toHaveLength(5)
    expect(report.reports.every(entry => entry.accepted === false)).toBe(true)
  })
})
