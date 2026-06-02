import { describe, expect, it } from 'vitest'

import {
  createDefaultAudioOutputStatus,
  isAudioOutputStatus,
  parseAudioOutputEventLine,
  sanitizeAudioOutputPlayFilePayload,
  sanitizeAudioOutputPlaybackVolumePayload,
  sanitizeAudioOutputSettings,
  sanitizeAudioOutputState,
  sanitizeAudioOutputTestTonePayload
} from '@shared/audioOutput/protocol'

describe('audio output protocol', () => {
  it('sanitizes audio output settings from plugin form values', () => {
    expect(
      sanitizeAudioOutputSettings({
        mode: 'exclusive',
        sharedDeviceId: '  chromium-usb  ',
        deviceId: '  dac-1  ',
        bufferFrames: '512',
        fallbackToShared: false,
        diagnosticsEnabled: true
      })
    ).toEqual({
      mode: 'exclusive',
      sharedDeviceId: 'chromium-usb',
      deviceId: 'dac-1',
      bufferFrames: 512,
      fallbackToShared: false,
      diagnosticsEnabled: true
    })
  })

  it('clamps invalid buffer sizes and falls back for invalid modes', () => {
    expect(
      sanitizeAudioOutputSettings({
        mode: 'asio',
        bufferFrames: 16
      })
    ).toMatchObject({
      mode: 'shared',
      bufferFrames: 128
    })
  })

  it('restores a full persisted audio output state safely', () => {
    expect(
      sanitizeAudioOutputState({
        enabled: true,
        settings: {
          mode: 'voicemeeter',
          sharedDeviceId: 'chromium-voice',
          deviceId: 'voice',
          bufferFrames: 2048,
          fallbackToShared: true,
          diagnosticsEnabled: false
        }
      })
    ).toMatchObject({
      enabled: true,
      settings: {
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-voice',
        deviceId: 'voice',
        bufferFrames: 2048
      }
    })
  })

  it('identifies valid status payloads', () => {
    expect(isAudioOutputStatus(createDefaultAudioOutputStatus())).toBe(true)
    expect(isAudioOutputStatus({ enabled: true, backend: 'native' })).toBe(false)
  })

  it('sanitizes native output test tone payloads', () => {
    expect(
      sanitizeAudioOutputTestTonePayload({
        durationMs: 50,
        frequencyHz: 4000
      })
    ).toEqual({
      durationMs: 120,
      frequencyHz: 2000
    })

    expect(sanitizeAudioOutputTestTonePayload({})).toEqual({
      durationMs: 500,
      frequencyHz: 440
    })
  })

  it('sanitizes native playback file and volume payloads', () => {
    expect(
      sanitizeAudioOutputPlayFilePayload({
        path: '  D:\\Music\\track.wav  ',
        startSeconds: '12.5',
        volume: '1.5'
      })
    ).toEqual({
      path: 'D:\\Music\\track.wav',
      startSeconds: 12.5,
      volume: 1
    })

    expect(
      sanitizeAudioOutputPlayFilePayload({
        path: 42,
        startSeconds: -4,
        volume: Number.NaN
      })
    ).toEqual({
      path: '',
      startSeconds: 0,
      volume: 1
    })

    expect(sanitizeAudioOutputPlaybackVolumePayload({ volume: '-0.2' })).toEqual({
      volume: 0
    })
  })

  it('parses native playback events and status playback fields', () => {
    expect(
      parseAudioOutputEventLine(
        JSON.stringify({
          type: 'playback',
          payload: {
            state: 'playing',
            running: true,
            paused: false,
            source: 'D:\\Music\\track.wav',
            reason: 'Native file playback is running.'
          }
        })
      )
    ).toEqual({
      type: 'playback',
      payload: {
        state: 'playing',
        running: true,
        paused: false,
        source: 'D:\\Music\\track.wav',
        reason: 'Native file playback is running.'
      }
    })

    expect(
      isAudioOutputStatus({
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'shared',
        devices: [],
        nativePlaybackRunning: true,
        nativePlaybackPaused: false,
        nativePlaybackSource: 'D:\\Music\\track.wav',
        nativePlaybackState: 'playing'
      })
    ).toBe(true)

    expect(
      parseAudioOutputEventLine(
        JSON.stringify({
          type: 'playback',
          payload: {
            state: 'buffering',
            running: true
          }
        })
      )
    ).toBeNull()
  })
})
