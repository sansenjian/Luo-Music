import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  createReport,
  createSettingsForMode,
  createSkippedReport,
  createTinyWavBuffer,
  findTransitionFindings,
  normalizeModeSwitchSequence,
  normalizeVoicemeeterBus,
  normalizeVoicemeeterHardwareOutBus,
  normalizeVoicemeeterHardwareOutDriver
} = require('../../scripts/test-audio-output-mode-switch.cjs') as {
  createReport: (
    sequence: string[],
    steps: Array<Record<string, unknown>>,
    events: { history: Array<Record<string, unknown>> },
    reportPath?: string | null,
    options?: Record<string, unknown>
  ) => {
    verdict: string
    proof: string
    staleEventFindings: unknown[]
    doublePlaybackFindings: unknown[]
    failedSteps?: unknown[]
  }
  createSettingsForMode: (
    mode: 'shared' | 'exclusive' | 'voicemeeter',
    options: Record<string, unknown>
  ) => Record<string, unknown>
  createSkippedReport: (
    reportPath?: string | null,
    platform?: string
  ) => {
    verdict: string
    proof: string
    platform: string
    reason: string
  }
  createTinyWavBuffer: () => Buffer
  findTransitionFindings: (
    events: { history: Array<Record<string, unknown>> },
    steps: Array<Record<string, unknown>>
  ) => {
    staleEventFindings: unknown[]
    doublePlaybackFindings: unknown[]
  }
  normalizeModeSwitchSequence: (value: string | string[]) => string[]
  normalizeVoicemeeterBus: (value: string) => string
  normalizeVoicemeeterHardwareOutBus: (value: string) => string
  normalizeVoicemeeterHardwareOutDriver: (value: string) => string
}

const script = readFileSync(
  resolve(process.cwd(), 'scripts/test-audio-output-mode-switch.cjs'),
  'utf8'
)

describe('audio output mode switch script', () => {
  it('documents the helper-level native mode switching proof boundary', () => {
    expect(script).toContain('LUO_AUDIO_OUTPUT_MODE_SWITCH_REPORT')
    expect(script).toContain('resolveReportPathFromEnv')
    expect(script).toContain('native-mode-switch-sequence')
    expect(script).toContain("'shared'")
    expect(script).toContain("'exclusive'")
    expect(script).toContain("'voicemeeter'")
    expect(script).toContain('playbackToken')
    expect(script).toContain('stopPlayback')
    expect(script).toContain('writeReportIfRequested')
    expect(script).toContain('prepareAudioOutputHelper')
    expect(script).toContain('helperPathSource')
    expect(script).toContain('doublePlaybackFindings')
    expect(script).toContain('staleEventFindings')
    expect(script).toContain('Voicemeeter audibility')
  })

  it('normalizes sequence and Voicemeeter settings inputs', () => {
    expect(normalizeModeSwitchSequence('shared > exclusive; voicemeeter shared')).toEqual([
      'shared',
      'exclusive',
      'voicemeeter',
      'shared'
    ])
    expect(normalizeModeSwitchSequence('bad-mode')).toEqual([
      'shared',
      'exclusive',
      'voicemeeter',
      'shared'
    ])
    expect(normalizeVoicemeeterBus('b2')).toBe('B2')
    expect(normalizeVoicemeeterBus('invalid')).toBe('A1')
    expect(normalizeVoicemeeterHardwareOutBus('a3')).toBe('A3')
    expect(normalizeVoicemeeterHardwareOutBus('b1')).toBe('A1')
    expect(normalizeVoicemeeterHardwareOutDriver('KS')).toBe('ks')
    expect(normalizeVoicemeeterHardwareOutDriver('bad')).toBe('wdm')
  })

  it('creates mode-specific settings without leaking shared device routing into exclusive modes', () => {
    const baseOptions = {
      deviceId: 'device-1',
      bufferFrames: 960,
      voicemeeterBus: 'A1',
      voicemeeterHardwareOutBus: 'A1',
      voicemeeterHardwareOutDriver: 'wdm',
      voicemeeterHardwareOutDevice: 'Speakers'
    }

    expect(createSettingsForMode('shared', baseOptions)).toMatchObject({
      mode: 'shared',
      sharedDeviceId: 'device-1',
      deviceId: 'device-1',
      fallbackToShared: true
    })
    expect(createSettingsForMode('exclusive', baseOptions)).toMatchObject({
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: 'device-1',
      fallbackToShared: false
    })
    expect(createSettingsForMode('voicemeeter', baseOptions)).toMatchObject({
      mode: 'voicemeeter',
      sharedDeviceId: '',
      deviceId: 'device-1',
      fallbackToShared: false,
      voicemeeterHardwareOutDevice: 'Speakers'
    })
  })

  it('creates a tiny WAV sample for quiet startup verification', () => {
    const wav = createTinyWavBuffer()

    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE')
    expect(wav.readUInt16LE(20)).toBe(1)
    expect(wav.readUInt32LE(24)).toBe(44_100)
    expect(wav.length).toBeGreaterThan(44)
  })

  it('detects stale terminal events separately from possible double playback evidence', () => {
    const steps = [
      {
        mode: 'shared',
        playbackToken: 'token-1',
        sample: { path: 'D:\\Samples\\one.wav' }
      },
      {
        mode: 'exclusive',
        playbackToken: 'token-2',
        sample: { path: 'D:\\Samples\\two.wav' },
        playEventIndex: 3
      }
    ]
    const events = {
      history: [
        { index: 0, type: 'status', payload: { nativePlaybackToken: 'token-1' } },
        { index: 1, type: 'status', payload: { nativePlaybackToken: 'token-2' } },
        { index: 2, type: 'status', payload: { nativePlaybackToken: 'token-2' } },
        {
          index: 3,
          type: 'playback',
          payload: { playbackToken: 'token-1', source: 'D:\\Samples\\one.wav', state: 'stopped' }
        },
        {
          index: 4,
          type: 'playback',
          payload: { playbackToken: 'token-1', source: 'D:\\Samples\\one.wav', state: 'playing' }
        }
      ]
    }

    expect(findTransitionFindings(events, steps)).toMatchObject({
      staleEventFindings: [
        {
          previousMode: 'shared',
          nextMode: 'exclusive',
          state: 'stopped'
        }
      ],
      doublePlaybackFindings: [
        {
          previousMode: 'shared',
          nextMode: 'exclusive',
          state: 'playing'
        }
      ]
    })
  })

  it('does not report old playback events before the next mode configure attempt as double playback', () => {
    const steps = [
      {
        mode: 'exclusive',
        playbackToken: 'token-1',
        sample: { path: 'D:\\Samples\\one.wav' }
      },
      {
        mode: 'voicemeeter',
        playbackToken: 'token-2',
        sample: { path: 'D:\\Samples\\two.wav' },
        configureCommandIndex: 3,
        configureError: 'Timed out waiting for voicemeeter configure status'
      }
    ]
    const events = {
      history: [
        {
          index: 0,
          type: 'playback',
          payload: { playbackToken: 'token-1', source: 'D:\\Samples\\one.wav', state: 'playing' }
        },
        {
          index: 1,
          type: 'status',
          payload: { nativePlaybackToken: 'token-1', nativePlaybackState: 'playing' }
        },
        {
          index: 2,
          type: 'playback',
          payload: { playbackToken: 'token-1', source: 'D:\\Samples\\one.wav', state: 'stopped' }
        }
      ]
    }

    expect(findTransitionFindings(events, steps)).toMatchObject({
      staleEventFindings: [],
      doublePlaybackFindings: []
    })
  })

  it('reports switched only when all steps start and no double playback evidence is present', () => {
    const sequence = ['shared', 'exclusive']
    const steps = [
      {
        mode: 'shared',
        started: true,
        playbackToken: 'token-1',
        sample: { path: 'D:\\Samples\\one.wav' }
      },
      {
        mode: 'exclusive',
        started: true,
        playbackToken: 'token-2',
        sample: { path: 'D:\\Samples\\two.wav' },
        playEventIndex: 3
      }
    ]

    expect(createReport(sequence, steps, { history: [] }, null)).toMatchObject({
      verdict: 'switched',
      proof: 'native-mode-switch-sequence',
      staleEventFindings: [],
      doublePlaybackFindings: []
    })

    expect(
      createReport(
        sequence,
        steps,
        {
          history: [
            { index: 0, type: 'status', payload: {} },
            { index: 1, type: 'status', payload: {} },
            { index: 2, type: 'status', payload: {} },
            {
              index: 3,
              type: 'playback',
              payload: {
                playbackToken: 'token-1',
                source: 'D:\\Samples\\one.wav',
                state: 'playing'
              }
            }
          ]
        },
        null
      )
    ).toMatchObject({
      verdict: 'not-switched',
      doublePlaybackFindings: [
        {
          previousPlaybackToken: 'token-1',
          state: 'playing'
        }
      ]
    })
  })

  it('reports configure failures with unattempted modes and helper event context', () => {
    const report = createReport(
      ['shared', 'exclusive', 'voicemeeter', 'shared'],
      [
        {
          mode: 'shared',
          started: true,
          playbackToken: 'token-1',
          sample: { path: 'D:\\Samples\\one.wav' }
        },
        {
          mode: 'exclusive',
          started: true,
          playbackToken: 'token-2',
          sample: { path: 'D:\\Samples\\two.wav' }
        },
        {
          mode: 'voicemeeter',
          started: false,
          playbackToken: 'token-3',
          sample: { path: 'D:\\Samples\\three.wav' },
          configureError: 'Timed out waiting for voicemeeter configure status',
          reason: 'Timed out waiting for voicemeeter configure status'
        }
      ],
      {
        history: [
          {
            index: 0,
            type: 'status',
            payload: {
              requestedMode: 'shared',
              nativePlaybackState: 'stopped'
            }
          },
          {
            index: 1,
            type: 'error',
            message: 'voicemeeter configure did not settle'
          }
        ]
      },
      null
    )

    expect(report).toMatchObject({
      verdict: 'not-switched',
      unattemptedModes: ['shared'],
      helperEventCount: 2,
      helperEventTail: [
        {
          eventIndex: 0,
          type: 'status',
          payload: {
            requestedMode: 'shared',
            nativePlaybackState: 'stopped'
          }
        },
        {
          eventIndex: 1,
          type: 'error',
          message: 'voicemeeter configure did not settle'
        }
      ],
      failedSteps: [
        {
          mode: 'voicemeeter',
          configureError: 'Timed out waiting for voicemeeter configure status'
        }
      ]
    })
  })

  it('emits a non-Windows skipped report without building the helper', () => {
    expect(createSkippedReport('D:\\Captures\\mode-switch.json', 'linux')).toEqual({
      verdict: 'skipped',
      proof: 'native-mode-switch-sequence',
      platform: 'linux',
      reportPath: 'D:\\Captures\\mode-switch.json',
      reason: 'Native mode switching across shared/exclusive/voicemeeter is Windows-only.'
    })
  })
})
