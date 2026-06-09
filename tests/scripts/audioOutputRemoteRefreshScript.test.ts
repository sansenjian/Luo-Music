import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const scriptPath = resolve(process.cwd(), 'scripts/test-audio-output-remote-refresh.cjs')
const script = readFileSync(scriptPath, 'utf8')

function parseLastJsonObject(output: string): unknown {
  const start = output.lastIndexOf('\n{')
  return JSON.parse(output.slice(start >= 0 ? start + 1 : 0))
}

describe('audio output remote refresh script', () => {
  it('verifies the default mock CDN refresh and Range flow', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'luo-audio-remote-refresh-'))
    const reportPath = join(tempRoot, 'remote-refresh.json')
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_URL: '',
        LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_HEADERS: '',
        LUO_AUDIO_OUTPUT_REMOTE_FRESH_URL: '',
        LUO_AUDIO_OUTPUT_REMOTE_FRESH_HEADERS: '',
        LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT: reportPath
      }
    })

    try {
      expect(result.stderr).not.toContain('[audio-output-remote-refresh]')
      expect(result.status).toBe(0)

      const report = JSON.parse(result.stdout)
      expect(report).toMatchObject({
        verdict: 'refreshable',
        proof: 'remote-refresh-range',
        mode: 'mock',
        reportPath,
        expired: {
          status: 403,
          rejectedAsExpiredAuth: true
        },
        fresh: {
          status: 206,
          acceptedAfterRefresh: true,
          rangeSupported: true
        },
        mockRequestProof: {
          expiredRequestUsedExpiredAuthorization: true,
          freshRequestUsedFreshAuthorization: true
        }
      })
      expect(report.fresh.contentRange).toMatch(/^bytes 0-\d+\/\d+$/)
      expect(report.fresh.contentType).toBe('audio/wav')
      expect(report.fresh.contentTypeAccepted).toBe(true)
      expect(report.nativePlayback).toBeUndefined()
      expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toEqual(report)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('records refreshed audio native helper startup proof when requested', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'luo-audio-remote-native-'))
    const reportPath = join(tempRoot, 'remote-refresh-native.json')
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_URL: '',
        LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_HEADERS: '',
        LUO_AUDIO_OUTPUT_REMOTE_FRESH_URL: '',
        LUO_AUDIO_OUTPUT_REMOTE_FRESH_HEADERS: '',
        LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT: reportPath,
        LUO_AUDIO_OUTPUT_REMOTE_NATIVE_PLAYBACK: '1',
        LUO_AUDIO_OUTPUT_REMOTE_NATIVE_SKIP_HELPER: '1',
        LUO_AUDIO_OUTPUT_REMOTE_NATIVE_TIMEOUT_MS: '5000'
      },
      timeout: 60_000
    })

    try {
      expect(result.stderr).not.toContain('[audio-output-remote-refresh]')
      expect(result.status).toBe(0)

      const report = parseLastJsonObject(result.stdout) as {
        nativePlayback: {
          started: boolean
          nativePlaybackState: string
          activeMode?: string
          reason?: string
          bytesReceived: number
          bodySha256: string
        }
      }
      expect(report).toMatchObject({
        verdict: 'refreshable',
        proof: 'remote-refresh-range',
        mode: 'mock',
        nativePlayback: {
          attempted: true,
          extension: '.wav',
          contentType: 'audio/wav'
        }
      })
      const nativePlaybackOutcome = report.nativePlayback.started
        ? {
            branch: 'started',
            activeMode: report.nativePlayback.activeMode,
            stateAllowed: ['starting', 'playing', 'ended'].includes(
              report.nativePlayback.nativePlaybackState
            )
          }
        : {
            branch: 'not-started',
            reasonType: typeof report.nativePlayback.reason
          }
      expect(nativePlaybackOutcome).toEqual(
        report.nativePlayback.started
          ? {
              branch: 'started',
              activeMode: 'shared',
              stateAllowed: true
            }
          : {
              branch: 'not-started',
              reasonType: 'string'
            }
      )
      expect(report.nativePlayback.bytesReceived).toBeGreaterThan(0)
      expect(report.nativePlayback.bodySha256).toMatch(/^[a-f0-9]{64}$/)
      expect(result.error).toBeUndefined()
      expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toEqual(report)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  }, 75_000)

  it('persists mock proof to the standard Windows proof directory when requested', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'luo-audio-remote-proof-dir-'))
    const reportPath = join(tempRoot, 'remote-refresh.json')
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_URL: '',
        LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_HEADERS: '',
        LUO_AUDIO_OUTPUT_REMOTE_FRESH_URL: '',
        LUO_AUDIO_OUTPUT_REMOTE_FRESH_HEADERS: '',
        LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT: '',
        LUO_AUDIO_OUTPUT_WINDOWS_PROOF_DIR: tempRoot
      }
    })

    try {
      expect(result.stderr).not.toContain('[audio-output-remote-refresh]')
      expect(result.status).toBe(0)

      const report = JSON.parse(result.stdout)
      expect(report).toMatchObject({
        verdict: 'refreshable',
        proof: 'remote-refresh-range',
        reportPath
      })
      expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toEqual(report)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('documents live URL inputs and proof boundaries', () => {
    expect(script).toContain('LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_URL')
    expect(script).toContain('LUO_AUDIO_OUTPUT_REMOTE_EXPIRED_HEADERS')
    expect(script).toContain('LUO_AUDIO_OUTPUT_REMOTE_FRESH_URL')
    expect(script).toContain('LUO_AUDIO_OUTPUT_REMOTE_FRESH_HEADERS')
    expect(script).toContain('LUO_AUDIO_OUTPUT_REMOTE_REFRESH_REPORT')
    expect(script).toContain('resolveReportPathFromEnv')
    expect(script).toContain('LUO_AUDIO_OUTPUT_REMOTE_NATIVE_PLAYBACK')
    expect(script).toContain('LUO_AUDIO_OUTPUT_REMOTE_NATIVE_MODE')
    expect(script).toContain('LUO_AUDIO_OUTPUT_REMOTE_NATIVE_SKIP_HELPER')
    expect(script).toContain('requestedMode: nativeMode')
    expect(script).toContain('mode: nativeMode')
    expect(script).toContain('writeReportIfRequested')
    expect(script).toContain('remote-refresh-range')
    expect(script).toContain('remote-refresh-cache')
    expect(script).toContain('prepareAudioOutputHelper')
    expect(script).toContain('helperPathSource')
    expect(script).toContain('contentTypeAccepted')
    expect(script).toContain('HTML login page or JSON error payload')
    expect(script).toContain('native helper')
  })
})
