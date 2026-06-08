import { describe, expect, it } from 'vitest'

import {
  createDefaultAudioOutputStatus,
  isAudioOutputStatus,
  parseAudioOutputEventLine,
  sanitizeAudioOutputPlayFilePayload,
  sanitizeAudioOutputPlaybackVolumePayload,
  sanitizeAudioOutputSettings,
  sanitizeAudioOutputState,
  sanitizeAudioOutputTestTonePayload,
  serializeAudioOutputCommand
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
        bitPerfectRequired: true,
        voicemeeterBus: ' b2 ',
        voicemeeterHardwareOutBus: ' a2 ',
        voicemeeterHardwareOutDriver: ' KS ',
        voicemeeterHardwareOutDevice: '  USB DAC  ',
        diagnosticsEnabled: true
      })
    ).toEqual({
      mode: 'exclusive',
      sharedDeviceId: 'chromium-usb',
      deviceId: 'dac-1',
      bufferFrames: 512,
      fallbackToShared: false,
      bitPerfectRequired: true,
      voicemeeterBus: 'B2',
      voicemeeterHardwareOutBus: 'A2',
      voicemeeterHardwareOutDriver: 'ks',
      voicemeeterHardwareOutDevice: 'USB DAC',
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
      bufferFrames: 128,
      bitPerfectRequired: false
    })
  })

  it('keeps bit-perfect required exclusive-only when settings come from storage or IPC', () => {
    expect(
      sanitizeAudioOutputSettings({
        mode: 'shared',
        bitPerfectRequired: true
      })
    ).toMatchObject({
      mode: 'shared',
      bitPerfectRequired: false
    })

    expect(
      sanitizeAudioOutputSettings({
        mode: 'voicemeeter',
        bitPerfectRequired: true
      })
    ).toMatchObject({
      mode: 'voicemeeter',
      bitPerfectRequired: false
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
          bitPerfectRequired: true,
          diagnosticsEnabled: false
        }
      })
    ).toMatchObject({
      enabled: true,
      settings: {
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-voice',
        deviceId: 'voice',
        bufferFrames: 2048,
        bitPerfectRequired: false
      }
    })
  })

  it('identifies valid status payloads', () => {
    expect(isAudioOutputStatus(createDefaultAudioOutputStatus())).toBe(true)
    expect(isAudioOutputStatus({ enabled: true, backend: 'native' })).toBe(false)
  })

  it('requires sanitized settings on status payloads so renderer guards can trust playback policy', () => {
    const status = {
      ...createDefaultAudioOutputStatus(),
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      requestedMode: 'exclusive',
      settings: {
        ...createDefaultAudioOutputStatus().settings,
        mode: 'exclusive',
        bitPerfectRequired: true
      },
      devices: []
    }

    expect(isAudioOutputStatus(status)).toBe(true)
    expect(isAudioOutputStatus({ ...status, settings: { mode: 'shared' } })).toBe(false)
    expect(
      isAudioOutputStatus({
        ...status,
        requestedMode: 'voicemeeter',
        settings: {
          ...status.settings,
          mode: 'voicemeeter',
          bitPerfectRequired: true
        }
      })
    ).toBe(false)
  })

  it('accepts cross-platform CPAL native output devices', () => {
    expect(
      isAudioOutputStatus({
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'shared',
        activeMode: 'shared',
        supportedModes: ['shared'],
        devices: [
          {
            id: '0:Built-in Output',
            name: 'Built-in Output',
            isDefault: true,
            backend: 'cpal'
          }
        ]
      })
    ).toBe(true)
  })

  it('identifies helper-supported native output modes on status payloads', () => {
    expect(
      isAudioOutputStatus({
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'shared',
        devices: [],
        supportedModes: ['shared', 'exclusive', 'voicemeeter']
      })
    ).toBe(true)

    expect(
      isAudioOutputStatus({
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'shared',
        devices: [],
        supportedModes: ['shared', 'asio']
      })
    ).toBe(false)
  })

  it('identifies bit-perfect diagnostics on status payloads', () => {
    expect(
      isAudioOutputStatus({
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'exclusive',
        activeMode: 'exclusive',
        devices: [],
        nativePlaybackDownload: {
          state: 'downloading',
          bytesReceived: 2048,
          totalBytes: 4096,
          rangeSupported: true,
          strategy: 'range-chunk'
        },
        nativePlaybackPositionSeconds: 12.5,
        nativePlaybackError: {
          code: 'remote-auth-expired',
          httpStatus: 403,
          retryable: true
        },
        bitPerfect: {
          status: 'candidate',
          sourceFormat: {
            sampleRate: 44100,
            channels: 2,
            sampleFormat: 'pcm',
            bitDepth: 16,
            source: 'WAV raw PCM passthrough'
          },
          outputFormat: {
            sampleRate: 44100,
            channels: 2,
            sampleFormat: 'pcm',
            bitDepth: 16,
            source: 'WASAPI exclusive PCM fallback'
          },
          volume: 1,
          reason:
            'WASAPI exclusive output format matches source sample rate/channels and playback volume is unity; loopback or DAC verification is still required.'
        }
      })
    ).toBe(true)

    expect(
      isAudioOutputStatus({
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'exclusive',
        devices: [],
        nativePlaybackDownload: {
          state: 'cached',
          bytesReceived: '2048',
          rangeSupported: 'yes'
        },
        bitPerfect: {
          status: 'candidate',
          sourceFormat: {
            sampleRate: '44100',
            channels: 2,
            sampleFormat: 'decoded-f32'
          },
          reason: 'invalid source format'
        }
      })
    ).toBe(false)

    expect(
      isAudioOutputStatus({
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'exclusive',
        devices: [],
        nativePlaybackDownload: {
          state: 'cached',
          bytesReceived: 2048,
          strategy: 'streaming'
        }
      })
    ).toBe(false)

    expect(
      isAudioOutputStatus({
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'shared',
        devices: [],
        nativePlaybackError: {
          code: 'remote-cache-failed',
          httpStatus: 700,
          retryable: 'yes'
        }
      })
    ).toBe(false)

    expect(
      isAudioOutputStatus({
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'shared',
        devices: [],
        nativePlaybackPositionSeconds: -1
      })
    ).toBe(false)
  })

  it('identifies helper-supported native extensions on status payloads', () => {
    expect(
      isAudioOutputStatus({
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'shared',
        devices: [],
        supportedExtensions: ['.mp3', '.opus']
      })
    ).toBe(true)

    expect(
      isAudioOutputStatus({
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'shared',
        devices: [],
        supportedExtensions: ['.mp3', 42]
      })
    ).toBe(false)
  })

  it('identifies Voicemeeter Remote API status payloads', () => {
    expect(
      isAudioOutputStatus({
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'voicemeeter',
        activeMode: 'voicemeeter',
        devices: [],
        voicemeeterRemote: {
          available: true,
          connected: true,
          routeApplied: true,
          routeManaged: true,
          routeBus: 'B1',
          hardwareOutApplied: true,
          hardwareOutBus: 'A1',
          hardwareOutDriver: 'wdm',
          hardwareOutDevice: 'USB DAC',
          kind: 'banana',
          version: '1.2.3.4',
          virtualInputStrip: 3,
          dllPath: 'C:\\Program Files\\VB\\Voicemeeter\\VoicemeeterRemote64.dll',
          levelProbe: {
            active: true,
            target: 'virtualInput',
            bus: 'B1',
            strip: 3,
            levelType: 0,
            channelStart: 24,
            channels: 2,
            samples: 25,
            activeSamples: 4,
            maxLevel: 0.08,
            threshold: 0.001,
            reason: 'Voicemeeter output level activity detected on B1.'
          },
          reason: 'Voicemeeter Remote API connected and routed Strip[3].B1.'
        }
      })
    ).toBe(true)

    expect(
      isAudioOutputStatus({
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'voicemeeter',
        devices: [],
        voicemeeterRemote: {
          available: true,
          connected: true,
          routeManaged: 'yes',
          routeBus: 'Z9',
          kind: 'studio',
          virtualInputStrip: '3',
          levelProbe: {
            active: true,
            bus: 'Z9',
            maxLevel: 'loud'
          }
        }
      })
    ).toBe(false)
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

  it('serializes the exclusive lock probe command', () => {
    expect(serializeAudioOutputCommand({ type: 'probeExclusiveLock' })).toBe(
      '{"type":"probeExclusiveLock"}\n'
    )
  })

  it('serializes playback-only stop commands for route-preserving handoffs', () => {
    expect(serializeAudioOutputCommand({ type: 'stopPlaybackOnly' })).toBe(
      '{"type":"stopPlaybackOnly"}\n'
    )
  })

  it('sanitizes native playback file and volume payloads', () => {
    expect(
      sanitizeAudioOutputPlayFilePayload({
        path: '  D:\\Music\\track.wav  ',
        url: '  https://song.test/track.mp3  ',
        requestHeaders: {
          Cookie: ' MUSIC_U=token ',
          Referer: ' https://music.example.test/ ',
          'User-Agent': ' LUO Music Test ',
          Range: 'bytes=999-1000',
          Host: 'evil.example.test',
          Empty: ''
        },
        startSeconds: '12.5',
        volume: '1.5',
        growingExpectedBytes: '4096',
        playbackToken: ' native-playback-1 '
      })
    ).toEqual({
      path: 'D:\\Music\\track.wav',
      url: 'https://song.test/track.mp3',
      requestHeaders: {
        cookie: 'MUSIC_U=token',
        referer: 'https://music.example.test/',
        'user-agent': 'LUO Music Test'
      },
      startSeconds: 12.5,
      volume: 1,
      growingExpectedBytes: 4096,
      playbackToken: 'native-playback-1'
    })

    expect(
      sanitizeAudioOutputPlayFilePayload({
        path: 42,
        startSeconds: -4,
        volume: Number.NaN,
        growingExpectedBytes: 0
      })
    ).toEqual({
      path: '',
      url: '',
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
            playbackToken: 'native-playback-1',
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
        playbackToken: 'native-playback-1',
        reason: 'Native file playback is running.'
      }
    })

    expect(
      parseAudioOutputEventLine(
        JSON.stringify({
          type: 'playback',
          payload: {
            state: 'error',
            running: false,
            paused: false,
            source: 'D:\\Music\\exclusive.wav',
            playbackToken: 'native-playback-2',
            nativePlaybackError: {
              code: 'wasapi-exclusive-failed',
              nativeErrorCode: 'AUDCLNT_E_DEVICE_IN_USE',
              nativeMessage: 'device is already in exclusive use',
              retryable: false
            },
            reason: 'Native WASAPI exclusive file playback failed: AUDCLNT_E_DEVICE_IN_USE'
          }
        })
      )
    ).toEqual({
      type: 'playback',
      payload: {
        state: 'error',
        running: false,
        paused: false,
        source: 'D:\\Music\\exclusive.wav',
        playbackToken: 'native-playback-2',
        nativePlaybackError: {
          code: 'wasapi-exclusive-failed',
          nativeErrorCode: 'AUDCLNT_E_DEVICE_IN_USE',
          nativeMessage: 'device is already in exclusive use',
          retryable: false
        },
        reason: 'Native WASAPI exclusive file playback failed: AUDCLNT_E_DEVICE_IN_USE'
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
        nativePlaybackState: 'playing',
        nativePlaybackToken: 'native-playback-1',
        nativePlaybackError: {
          code: 'wasapi-exclusive-failed',
          nativeErrorCode: 'AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED',
          retryable: false
        }
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

  it('parses structured exclusive lock probe status payloads', () => {
    expect(
      parseAudioOutputEventLine(
        JSON.stringify({
          type: 'status',
          payload: {
            ...createDefaultAudioOutputStatus(),
            enabled: true,
            backend: 'native',
            backendAvailable: true,
            requestedMode: 'exclusive',
            activeMode: 'exclusive',
            exclusiveProbe: {
              status: 'passed',
              deviceName: 'Speakers',
              format: '48000 Hz/2ch/24-bit pcm',
              bufferFrames: 2048,
              bufferDurationHns: 426667,
              source: 'PCM fallback',
              secondOpen: 'deviceInUse',
              errorCode: 'AUDCLNT_E_DEVICE_IN_USE'
            },
            devices: []
          }
        })
      )
    ).toMatchObject({
      type: 'status',
      payload: {
        exclusiveProbe: {
          status: 'passed',
          secondOpen: 'deviceInUse'
        }
      }
    })
  })
})
