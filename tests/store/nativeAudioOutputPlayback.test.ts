import { beforeEach, describe, expect, it, vi } from 'vitest'

import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '@shared/protocol/channels'
import type { AudioOutputStatus } from '@shared/audioOutput/protocol'
import { createMockSong } from '../utils/test-utils'

function createNativeReadyStatus(overrides: Partial<AudioOutputStatus> = {}): AudioOutputStatus {
  return {
    enabled: true,
    backend: 'native',
    backendAvailable: true,
    requestedMode: 'shared',
    activeMode: 'shared',
    devices: [],
    ...overrides
  }
}

function createLocalSong() {
  return createMockSong({
    id: 'local:ready-gated',
    platform: 'local',
    url: 'file:///D:/Music/ready-gated.mp3',
    extra: {
      localSource: true,
      localFilePath: 'D:\\Music\\ready-gated.mp3',
      localDurationKnown: true
    }
  })
}

describe('nativeAudioOutputPlayback', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    Reflect.deleteProperty(window, 'services')
  })

  it('waits for a confirmed native status before accepting local file playback', async () => {
    const status = createNativeReadyStatus()
    const invoke = vi.fn((channel: string) =>
      channel === INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS
        ? Promise.resolve(status)
        : Promise.resolve(status)
    )
    const on = vi.fn()
    Object.assign(window, {
      services: {
        invoke,
        on
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const request = {
      song: createLocalSong(),
      volume: 0.7
    }

    expect(controller.canPlay(request)).toBe(false)

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS)
    })
    await vi.waitFor(() => {
      expect(controller.canPlay(request)).toBe(true)
    })
  })

  it('accepts local file playback after receiving a native status event', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    const status = createNativeReadyStatus()
    Object.assign(window, {
      services: {
        invoke: vi.fn().mockResolvedValue({
          enabled: false,
          backend: 'disabled',
          backendAvailable: false,
          requestedMode: 'shared',
          devices: []
        }),
        on: vi.fn((channel: string, listener: (value: unknown) => void) => {
          listeners.set(channel, listener)
        })
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const request = {
      song: createLocalSong(),
      volume: 0.7
    }

    expect(controller.canPlay(request)).toBe(false)

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(status)

    expect(controller.canPlay(request)).toBe(true)
  })
})
