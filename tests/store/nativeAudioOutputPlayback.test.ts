import { beforeEach, describe, expect, it, vi } from 'vitest'

import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '@shared/protocol/channels'
import {
  createDefaultAudioOutputStatus,
  type AudioOutputStatus
} from '@shared/audioOutput/protocol'
import { createMockSong } from '../utils/test-utils'

function createNativeReadyStatus(overrides: Partial<AudioOutputStatus> = {}): AudioOutputStatus {
  return {
    ...createDefaultAudioOutputStatus(),
    enabled: true,
    backend: 'native',
    backendAvailable: true,
    requestedMode: 'shared',
    activeMode: 'shared',
    devices: [],
    ...overrides
  }
}

function createDisabledStatus(overrides: Partial<AudioOutputStatus> = {}): AudioOutputStatus {
  return {
    ...createDefaultAudioOutputStatus(),
    ...overrides
  }
}

function createLocalSong(localFilePath = 'D:\\Music\\ready-gated.mp3') {
  const fileUrl = `file:///${localFilePath.replace(/\\/g, '/')}`
  return createMockSong({
    id: 'local:ready-gated',
    platform: 'local',
    url: fileUrl,
    extra: {
      localSource: true,
      localFilePath,
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

  it('allows local file playback before the first status arrives so native output can be attempted', async () => {
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

    expect(controller.canPlay(request)).toBe(true)

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS)
    })
    expect(controller.canPlay(request)).toBe(true)
  })

  it('accepts local file playback after receiving a native status event', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    const status = createNativeReadyStatus()
    Object.assign(window, {
      services: {
        invoke: vi.fn().mockResolvedValue(createDisabledStatus()),
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

    expect(controller.canPlay(request)).toBe(true)

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(status)

    expect(controller.canPlay(request)).toBe(true)
  })

  it('accepts local extensions that are already covered by the Rust helper decoder set', async () => {
    const status = createNativeReadyStatus()
    Object.assign(window, {
      services: {
        invoke: vi.fn().mockResolvedValue(status),
        on: vi.fn()
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()

    for (const extension of [
      '.aif',
      '.aiff',
      '.ape',
      '.caf',
      '.m2a',
      '.mka',
      '.mp1',
      '.mp2',
      '.mpa',
      '.oga'
    ]) {
      expect(
        controller.canPlay({
          song: createLocalSong(`D:\\Music\\helper-supported${extension}`),
          volume: 0.7
        })
      ).toBe(true)
    }
  })

  it('keeps local formats without a native decoder route on Chromium playback', async () => {
    const status = createNativeReadyStatus()
    Object.assign(window, {
      services: {
        invoke: vi.fn().mockResolvedValue(status),
        on: vi.fn()
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()

    for (const extension of ['.mkv', '.opus', '.webm']) {
      expect(
        controller.canPlay({
          song: createLocalSong(`D:\\Music\\unsupported${extension}`),
          volume: 0.7
        })
      ).toBe(false)
    }
  })

  it('accepts optional local extensions reported by the helper status', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    const status = createNativeReadyStatus({
      supportedExtensions: ['.opus', '.webm']
    })
    Object.assign(window, {
      services: {
        invoke: vi.fn().mockResolvedValue(createDisabledStatus()),
        on: vi.fn((channel: string, listener: (value: unknown) => void) => {
          listeners.set(channel, listener)
        })
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const opusRequest = {
      song: createLocalSong('D:\\Music\\optional.opus'),
      volume: 0.7
    }
    const webmRequest = {
      song: createLocalSong('D:\\Music\\optional.webm'),
      volume: 0.7
    }

    expect(controller.canPlay(opusRequest)).toBe(false)
    expect(controller.canPlay(webmRequest)).toBe(false)

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(status)

    expect(controller.canPlay(opusRequest)).toBe(true)
    expect(controller.canPlay(webmRequest)).toBe(true)
  })

  it('passes remote song URLs to the native audio output bridge', async () => {
    const status = createNativeReadyStatus()
    const invoke = vi.fn((channel: string) =>
      channel === INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS
        ? Promise.resolve(status)
        : Promise.resolve(status)
    )
    Object.assign(window, {
      services: {
        invoke,
        on: vi.fn()
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const song = createMockSong({
      id: 'remote:native',
      platform: 'netease',
      url: 'https://song.test/native.mp3'
    })

    expect(controller.canPlay({ song, volume: 0.7 })).toBe(true)

    await expect(controller.play({ song, startSeconds: 8, volume: 0.5 })).resolves.toBe(true)

    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE, {
      path: undefined,
      url: 'https://song.test/native.mp3',
      startSeconds: 8,
      volume: 0.5,
      playbackToken: expect.stringMatching(/^native-playback-renderer-\d+$/)
    })
  })

  it('passes native request headers for authenticated remote song URLs', async () => {
    const status = createNativeReadyStatus()
    const invoke = vi.fn((channel: string) =>
      channel === INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS
        ? Promise.resolve(status)
        : Promise.resolve(status)
    )
    Object.assign(window, {
      services: {
        invoke,
        on: vi.fn()
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const song = createMockSong({
      id: 'remote:native-auth',
      platform: 'netease',
      url: 'https://song.test/native-auth.mp3',
      extra: {
        nativeAudioOutputRequestHeaders: {
          cookie: 'MUSIC_U=token',
          referer: 'https://music.example.test/'
        }
      }
    })

    await expect(controller.play({ song, startSeconds: 3, volume: 0.4 })).resolves.toBe(true)

    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE, {
      path: undefined,
      url: 'https://song.test/native-auth.mp3',
      requestHeaders: {
        cookie: 'MUSIC_U=token',
        referer: 'https://music.example.test/'
      },
      startSeconds: 3,
      volume: 0.4,
      playbackToken: expect.stringMatching(/^native-playback-renderer-\d+$/)
    })
  })

  it('ignores terminal native playback events from stale sources', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    const status = createNativeReadyStatus()
    const currentUrl = 'https://song.test/current.mp3'
    const invoke = vi.fn((channel: string, payload?: { path?: string; url?: string }) => {
      if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS) {
        return Promise.resolve(status)
      }

      if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE) {
        return Promise.resolve(
          createNativeReadyStatus({
            nativePlaybackRunning: true,
            nativePlaybackSource: payload?.url ?? payload?.path,
            nativePlaybackState: 'starting'
          })
        )
      }

      return Promise.resolve(status)
    })
    Object.assign(window, {
      services: {
        invoke,
        on: vi.fn((channel: string, listener: (value: unknown) => void) => {
          listeners.set(channel, listener)
        })
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const onEnded = vi.fn()
    const onError = vi.fn()
    controller.onEnded(onEnded)
    controller.onError(onError)

    await expect(
      controller.play({
        song: createMockSong({
          id: 'remote:current',
          platform: 'netease',
          url: currentUrl
        }),
        volume: 0.7
      })
    ).resolves.toBe(true)

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createNativeReadyStatus({
        nativePlaybackRunning: false,
        nativePlaybackSource: 'https://song.test/old.mp3',
        nativePlaybackState: 'error'
      })
    )
    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createNativeReadyStatus({
        nativePlaybackRunning: false,
        nativePlaybackSource: 'https://song.test/old.mp3',
        nativePlaybackState: 'ended'
      })
    )

    expect(onError).not.toHaveBeenCalled()
    expect(onEnded).not.toHaveBeenCalled()

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createNativeReadyStatus({
        nativePlaybackRunning: false,
        nativePlaybackSource: currentUrl,
        nativePlaybackState: 'error'
      })
    )

    expect(onError).toHaveBeenCalledOnce()
    expect(onEnded).not.toHaveBeenCalled()
  })

  it('ignores terminal native playback events with stale tokens for the current source', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    const status = createNativeReadyStatus()
    const currentUrl = 'https://song.test/current-token.mp3'
    let currentToken = ''
    const staleToken = 'native-playback-stale'
    const invoke = vi.fn(
      (channel: string, payload?: { path?: string; url?: string; playbackToken?: string }) => {
        if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS) {
          return Promise.resolve(status)
        }

        if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE) {
          currentToken = payload?.playbackToken ?? 'native-playback-current'
          return Promise.resolve(
            createNativeReadyStatus({
              nativePlaybackRunning: true,
              nativePlaybackSource: payload?.url ?? payload?.path,
              nativePlaybackState: 'starting',
              nativePlaybackToken: currentToken
            })
          )
        }

        return Promise.resolve(status)
      }
    )
    Object.assign(window, {
      services: {
        invoke,
        on: vi.fn((channel: string, listener: (value: unknown) => void) => {
          listeners.set(channel, listener)
        })
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const onError = vi.fn()
    controller.onError(onError)

    await expect(
      controller.play({
        song: createMockSong({
          id: 'remote:current-token',
          platform: 'netease',
          url: currentUrl
        }),
        volume: 0.7
      })
    ).resolves.toBe(true)

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createNativeReadyStatus({
        nativePlaybackRunning: false,
        nativePlaybackSource: currentUrl,
        nativePlaybackState: 'error',
        nativePlaybackToken: staleToken,
        reason: 'Old helper playback failed.'
      })
    )

    expect(onError).not.toHaveBeenCalled()

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createNativeReadyStatus({
        nativePlaybackRunning: false,
        nativePlaybackSource: currentUrl,
        nativePlaybackState: 'error',
        nativePlaybackToken: currentToken,
        reason: 'Current helper playback failed.'
      })
    )

    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      message: 'Current helper playback failed.'
    })
  })

  it('retires the current native playback identity after source-less output-change stops', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    const status = createNativeReadyStatus()
    const currentUrl = 'https://song.test/mode-switch.mp3'
    let currentToken = ''
    const invoke = vi.fn(
      (channel: string, payload?: { path?: string; url?: string; playbackToken?: string }) => {
        if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS) {
          return Promise.resolve(status)
        }

        if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE) {
          currentToken = payload?.playbackToken ?? 'native-playback-current'
          return Promise.resolve(
            createNativeReadyStatus({
              nativePlaybackRunning: true,
              nativePlaybackSource: payload?.url ?? payload?.path,
              nativePlaybackState: 'starting',
              nativePlaybackToken: currentToken
            })
          )
        }

        return Promise.resolve(status)
      }
    )
    Object.assign(window, {
      services: {
        invoke,
        on: vi.fn((channel: string, listener: (value: unknown) => void) => {
          listeners.set(channel, listener)
        })
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const onEnded = vi.fn()
    const onError = vi.fn()
    controller.onEnded(onEnded)
    controller.onError(onError)

    await expect(
      controller.play({
        song: createMockSong({
          id: 'remote:mode-switch',
          platform: 'netease',
          url: currentUrl
        }),
        volume: 0.7
      })
    ).resolves.toBe(true)

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createNativeReadyStatus({
        nativePlaybackRunning: false,
        nativePlaybackState: 'stopped',
        reason: 'Native audio output playback stopped because output settings changed.'
      })
    )

    await controller.setVolume(0.2)
    expect(invoke).not.toHaveBeenCalledWith(INVOKE_CHANNELS.AUDIO_OUTPUT_SET_PLAYBACK_VOLUME, {
      volume: 0.2
    })

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createNativeReadyStatus({
        nativePlaybackRunning: false,
        nativePlaybackSource: currentUrl,
        nativePlaybackState: 'error',
        nativePlaybackToken: currentToken,
        reason: 'Old helper playback failed after output mode changed.'
      })
    )
    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createNativeReadyStatus({
        nativePlaybackRunning: false,
        nativePlaybackSource: currentUrl,
        nativePlaybackState: 'ended',
        nativePlaybackToken: currentToken
      })
    )

    expect(onError).not.toHaveBeenCalled()
    expect(onEnded).not.toHaveBeenCalled()
  })

  it('defers playback status events while a new native play request is pending', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    const status = createNativeReadyStatus()
    const currentUrl = 'https://song.test/pending-token.mp3'
    let currentToken = ''
    let playFilePayloadUrl: string | undefined
    const playResponse = Promise.withResolvers<AudioOutputStatus>()
    const invoke = vi.fn(
      (channel: string, payload?: { path?: string; url?: string; playbackToken?: string }) => {
        if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS) {
          return Promise.resolve(status)
        }

        if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE) {
          playFilePayloadUrl = payload?.url
          currentToken = payload?.playbackToken ?? 'native-playback-current'
          return playResponse.promise
        }

        return Promise.resolve(status)
      }
    )
    Object.assign(window, {
      services: {
        invoke,
        on: vi.fn((channel: string, listener: (value: unknown) => void) => {
          listeners.set(channel, listener)
        })
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const onError = vi.fn()
    controller.onError(onError)

    const playback = controller.play({
      song: createMockSong({
        id: 'remote:pending-token',
        platform: 'netease',
        url: currentUrl
      }),
      volume: 0.7
    })
    expect(playFilePayloadUrl).toBe(currentUrl)

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createNativeReadyStatus({
        nativePlaybackRunning: false,
        nativePlaybackSource: currentUrl,
        nativePlaybackState: 'error',
        nativePlaybackToken: 'native-playback-stale',
        reason: 'Old helper playback failed while replaying the same URL.'
      })
    )

    expect(onError).not.toHaveBeenCalled()

    playResponse.resolve(
      createNativeReadyStatus({
        nativePlaybackRunning: true,
        nativePlaybackSource: currentUrl,
        nativePlaybackState: 'starting',
        nativePlaybackToken: currentToken
      })
    )

    await expect(playback).resolves.toBe(true)
    expect(onError).not.toHaveBeenCalled()
  })

  it('throws native playback failure errors with helper reasons at startup', async () => {
    const status = createNativeReadyStatus()
    const failedUrl = 'https://song.test/unsupported-content-type'
    const invoke = vi.fn((channel: string, payload?: { path?: string; url?: string }) => {
      if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS) {
        return Promise.resolve(status)
      }

      if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE) {
        return Promise.resolve(
          createNativeReadyStatus({
            nativePlaybackRunning: false,
            nativePlaybackSource: payload?.url ?? payload?.path,
            nativePlaybackState: 'error',
            reason: 'Failed to cache remote media for native audio output.'
          })
        )
      }

      return Promise.resolve(status)
    })
    Object.assign(window, {
      services: {
        invoke,
        on: vi.fn()
      }
    })
    const {
      getDefaultNativeAudioOutputPlaybackController,
      isNativeAudioOutputFailedPlaybackError
    } = await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()

    await expect(
      controller.play({
        song: createMockSong({
          id: 'remote:unsupported-content-type',
          platform: 'netease',
          url: failedUrl
        }),
        volume: 0.7
      })
    ).rejects.toSatisfy((error: unknown) => {
      expect(isNativeAudioOutputFailedPlaybackError(error)).toBe(true)
      expect(error).toMatchObject({
        message: 'Failed to cache remote media for native audio output.',
        reason: 'Failed to cache remote media for native audio output.'
      })
      return true
    })

    await controller.setVolume(0.2)

    expect(invoke).not.toHaveBeenCalledWith(INVOKE_CHANNELS.AUDIO_OUTPUT_SET_PLAYBACK_VOLUME, {
      volume: 0.2
    })
  })

  it('throws retryable native playback errors when remote authorization expires at startup', async () => {
    const status = createNativeReadyStatus()
    const failedUrl = 'https://song.test/expired.mp3'
    const invoke = vi.fn((channel: string, payload?: { path?: string; url?: string }) => {
      if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS) {
        return Promise.resolve(status)
      }

      if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE) {
        return Promise.resolve(
          createNativeReadyStatus({
            nativePlaybackRunning: false,
            nativePlaybackSource: payload?.url ?? payload?.path,
            nativePlaybackState: 'error',
            nativePlaybackError: {
              code: 'remote-auth-expired',
              httpStatus: 401,
              retryable: true
            }
          })
        )
      }

      return Promise.resolve(status)
    })
    Object.assign(window, {
      services: {
        invoke,
        on: vi.fn()
      }
    })
    const {
      getDefaultNativeAudioOutputPlaybackController,
      isNativeAudioOutputRetryablePlaybackError
    } = await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()

    await expect(
      controller.play({
        song: createMockSong({
          id: 'remote:expired',
          platform: 'netease',
          url: failedUrl
        }),
        volume: 0.7
      })
    ).rejects.toSatisfy(isNativeAudioOutputRetryablePlaybackError)

    await controller.setVolume(0.2)

    expect(invoke).not.toHaveBeenCalledWith(INVOKE_CHANNELS.AUDIO_OUTPUT_SET_PLAYBACK_VOLUME, {
      volume: 0.2
    })
  })

  it('does not treat a superseded native play-file response as the active playback', async () => {
    const status = createNativeReadyStatus()
    const firstResponse = Promise.withResolvers<AudioOutputStatus>()
    const secondResponse = Promise.withResolvers<AudioOutputStatus>()
    const invoke = vi.fn(
      (channel: string, payload?: { path?: string; url?: string }): Promise<AudioOutputStatus> => {
        if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS) {
          return Promise.resolve(status)
        }

        if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE) {
          if (payload?.url === 'https://song.test/old.mp3') {
            return firstResponse.promise
          }

          return secondResponse.promise
        }

        return Promise.resolve(status)
      }
    )
    Object.assign(window, {
      services: {
        invoke,
        on: vi.fn()
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const firstPlayback = controller.play({
      song: createMockSong({
        id: 'remote:old',
        platform: 'netease',
        url: 'https://song.test/old.mp3'
      }),
      volume: 0.7
    })
    const secondPlayback = controller.play({
      song: createMockSong({
        id: 'remote:new',
        platform: 'netease',
        url: 'https://song.test/new.mp3'
      }),
      volume: 0.7
    })

    secondResponse.resolve(
      createNativeReadyStatus({
        nativePlaybackRunning: true,
        nativePlaybackSource: 'https://song.test/new.mp3',
        nativePlaybackState: 'starting'
      })
    )
    await expect(secondPlayback).resolves.toBe(true)

    firstResponse.resolve(
      createNativeReadyStatus({
        nativePlaybackRunning: true,
        nativePlaybackSource: 'https://song.test/old.mp3',
        nativePlaybackState: 'playing'
      })
    )
    await expect(firstPlayback).resolves.toBe(false)

    await controller.setVolume(0.2)

    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.AUDIO_OUTPUT_SET_PLAYBACK_VOLUME, {
      volume: 0.2
    })
  })

  it('passes retryable native playback errors to runtime error listeners', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    const status = createNativeReadyStatus()
    const currentUrl = 'https://song.test/range-expired.mp3'
    const invoke = vi.fn((channel: string, payload?: { path?: string; url?: string }) => {
      if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS) {
        return Promise.resolve(status)
      }

      if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE) {
        return Promise.resolve(
          createNativeReadyStatus({
            nativePlaybackRunning: true,
            nativePlaybackSource: payload?.url ?? payload?.path,
            nativePlaybackState: 'starting'
          })
        )
      }

      return Promise.resolve(status)
    })
    Object.assign(window, {
      services: {
        invoke,
        on: vi.fn((channel: string, listener: (value: unknown) => void) => {
          listeners.set(channel, listener)
        })
      }
    })
    const {
      getDefaultNativeAudioOutputPlaybackController,
      isNativeAudioOutputRetryablePlaybackError
    } = await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const onError = vi.fn()
    controller.onError(onError)

    await controller.play({
      song: createMockSong({
        id: 'remote:range-expired',
        platform: 'netease',
        url: currentUrl
      }),
      volume: 0.7
    })

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createNativeReadyStatus({
        nativePlaybackRunning: false,
        nativePlaybackSource: currentUrl,
        nativePlaybackState: 'error',
        nativePlaybackError: {
          code: 'remote-auth-expired',
          httpStatus: 403,
          retryable: true
        }
      })
    )

    expect(onError).toHaveBeenCalledOnce()
    expect(isNativeAudioOutputRetryablePlaybackError(onError.mock.calls[0]?.[0])).toBe(true)
  })

  it('passes non-retryable native playback reasons to runtime error listeners', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    const status = createNativeReadyStatus()
    const currentUrl = 'https://song.test/wasapi-format.mp3'
    const invoke = vi.fn((channel: string, payload?: { path?: string; url?: string }) => {
      if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS) {
        return Promise.resolve(status)
      }

      if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE) {
        return Promise.resolve(
          createNativeReadyStatus({
            nativePlaybackRunning: true,
            nativePlaybackSource: payload?.url ?? payload?.path,
            nativePlaybackState: 'starting'
          })
        )
      }

      return Promise.resolve(status)
    })
    Object.assign(window, {
      services: {
        invoke,
        on: vi.fn((channel: string, listener: (value: unknown) => void) => {
          listeners.set(channel, listener)
        })
      }
    })
    const {
      getDefaultNativeAudioOutputPlaybackController,
      isNativeAudioOutputFailedPlaybackError
    } = await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const onError = vi.fn()
    controller.onError(onError)

    await controller.play({
      song: createMockSong({
        id: 'remote:wasapi-format',
        platform: 'netease',
        url: currentUrl
      }),
      volume: 0.7
    })

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createNativeReadyStatus({
        nativePlaybackRunning: false,
        nativePlaybackSource: currentUrl,
        nativePlaybackState: 'error',
        nativePlaybackError: {
          code: 'wasapi-exclusive-failed',
          nativeErrorCode: 'AUDCLNT_E_UNSUPPORTED_FORMAT',
          nativeMessage: 'the endpoint does not accept this exclusive format',
          retryable: false
        },
        reason: 'WASAPI exclusive stream initialization failed.'
      })
    )

    expect(onError).toHaveBeenCalledOnce()
    expect(isNativeAudioOutputFailedPlaybackError(onError.mock.calls[0]?.[0])).toBe(true)
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      code: 'wasapi-exclusive-failed',
      message: 'WASAPI exclusive stream initialization failed.',
      nativeErrorCode: 'AUDCLNT_E_UNSUPPORTED_FORMAT',
      nativeMessage: 'the endpoint does not accept this exclusive format',
      reason: 'WASAPI exclusive stream initialization failed.'
    })
  })

  it('accepts helper-covered remote extension aliases for native playback', async () => {
    const status = createNativeReadyStatus()
    Object.assign(window, {
      services: {
        invoke: vi.fn().mockResolvedValue(status),
        on: vi.fn()
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const urls = [
      'https://song.test/native-track.m2a',
      'https://song.test/native-track.oga?token=1',
      `luo-media://remote?url=${encodeURIComponent('https://song.test/proxy-track.oga?token=1')}`
    ]

    for (const url of urls) {
      expect(
        controller.canPlay({
          song: createMockSong({
            id: `remote:${url}`,
            platform: 'netease',
            url
          }),
          volume: 0.7
        })
      ).toBe(true)
    }
  })

  it('passes remote song URLs to the native bridge while Voicemeeter mode is active', async () => {
    const status = createNativeReadyStatus({
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter'
    })
    const invoke = vi.fn((channel: string) =>
      channel === INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS
        ? Promise.resolve(status)
        : Promise.resolve(status)
    )
    Object.assign(window, {
      services: {
        invoke,
        on: vi.fn()
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const song = createMockSong({
      id: 'remote:voicemeeter-native',
      platform: 'netease',
      url: 'https://song.test/voicemeeter-native.mp3'
    })

    expect(controller.canPlay({ song, volume: 0.7 })).toBe(true)

    await expect(controller.play({ song, startSeconds: 12, volume: 0.65 })).resolves.toBe(true)

    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE, {
      path: undefined,
      url: 'https://song.test/voicemeeter-native.mp3',
      startSeconds: 12,
      volume: 0.65,
      playbackToken: expect.stringMatching(/^native-playback-renderer-\d+$/)
    })
  })

  it('keeps known unsupported remote extensions on Chromium playback', async () => {
    const status = createNativeReadyStatus()
    Object.assign(window, {
      services: {
        invoke: vi.fn().mockResolvedValue(status),
        on: vi.fn()
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const unsupportedUrls = [
      'https://song.test/native.mkv',
      'https://song.test/native.opus?token=1',
      'https://song.test/native.webm',
      `luo-media://remote?url=${encodeURIComponent('https://song.test/proxy.opus?token=1')}`
    ]

    for (const url of unsupportedUrls) {
      expect(
        controller.canPlay({
          song: createMockSong({
            id: `remote:${url}`,
            platform: 'netease',
            url
          }),
          volume: 0.7
        })
      ).toBe(false)
    }
  })

  it('accepts optional remote extensions reported by the helper status', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    const status = createNativeReadyStatus({
      supportedExtensions: ['.opus', '.webm']
    })
    Object.assign(window, {
      services: {
        invoke: vi.fn().mockResolvedValue(createDisabledStatus()),
        on: vi.fn((channel: string, listener: (value: unknown) => void) => {
          listeners.set(channel, listener)
        })
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(status)

    for (const url of [
      'https://song.test/native.opus?token=1',
      'https://song.test/native.webm?token=1',
      `luo-media://remote?url=${encodeURIComponent('https://song.test/proxy.opus?token=1')}`,
      `luo-media://remote?url=${encodeURIComponent('https://song.test/proxy.webm?token=1')}`
    ]) {
      expect(
        controller.canPlay({
          song: createMockSong({
            id: `remote:${url}`,
            platform: 'netease',
            url
          }),
          volume: 0.7
        })
      ).toBe(true)
    }

    expect(
      controller.canPlay({
        song: createMockSong({
          id: 'remote:ape',
          platform: 'netease',
          url: 'https://song.test/native.ape'
        }),
        volume: 0.7
      })
    ).toBe(true)
  })

  it('accepts pending exclusive playback so the helper can attempt WASAPI exclusive', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    const status = createNativeReadyStatus({
      requestedMode: 'exclusive',
      activeMode: undefined,
      reason: 'WASAPI exclusive initialization is pending.'
    })
    Object.assign(window, {
      services: {
        invoke: vi.fn().mockResolvedValue(createDisabledStatus()),
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

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(status)

    expect(controller.canPlay(request)).toBe(true)
  })

  it('rejects native playback after a disabled status arrives', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    Object.assign(window, {
      services: {
        invoke: vi.fn().mockResolvedValue(createDisabledStatus({ requestedMode: 'exclusive' })),
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

    expect(controller.canPlay(request)).toBe(true)

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createDisabledStatus({ requestedMode: 'exclusive' })
    )

    expect(controller.canPlay(request)).toBe(false)
  })

  it('requires native playback when exclusive bit-perfect output is enforced', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    Object.assign(window, {
      services: {
        invoke: vi.fn().mockResolvedValue({
          ...createNativeReadyStatus(),
          requestedMode: 'exclusive',
          activeMode: 'exclusive',
          settings: {
            mode: 'exclusive',
            sharedDeviceId: '',
            deviceId: 'dac-1',
            bufferFrames: 512,
            fallbackToShared: false,
            bitPerfectRequired: true,
            voicemeeterBus: 'A1',
            diagnosticsEnabled: true
          }
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
      song: createLocalSong('D:\\Music\\candidate.wav'),
      volume: 1
    }

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createNativeReadyStatus({
        requestedMode: 'exclusive',
        activeMode: 'exclusive',
        settings: {
          mode: 'exclusive',
          sharedDeviceId: '',
          deviceId: 'dac-1',
          bufferFrames: 512,
          fallbackToShared: false,
          bitPerfectRequired: true,
          voicemeeterBus: 'A1',
          diagnosticsEnabled: true
        }
      })
    )

    expect(controller.canPlay(request)).toBe(true)
    expect(controller.requiresNativePlayback(request)).toBe(true)
    expect(
      controller.requiresNativePlayback({
        song: createLocalSong('D:\\Music\\unsupported.webm'),
        volume: 1
      })
    ).toBe(true)
  })

  it.each(['exclusive', 'voicemeeter'] as const)(
    'requires native playback for %s mode even when the source is not native-decodable',
    async mode => {
      const listeners = new Map<string, (value: unknown) => void>()
      Object.assign(window, {
        services: {
          invoke: vi.fn().mockResolvedValue(createDisabledStatus()),
          on: vi.fn((channel: string, listener: (value: unknown) => void) => {
            listeners.set(channel, listener)
          })
        }
      })
      const { getDefaultNativeAudioOutputPlaybackController } =
        await import('@/store/player/nativeAudioOutputPlayback')
      const controller = getDefaultNativeAudioOutputPlaybackController()
      const request = {
        song: createLocalSong('D:\\Music\\unsupported.webm'),
        volume: 1
      }

      listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
        createNativeReadyStatus({
          requestedMode: mode,
          activeMode: mode,
          settings: {
            mode,
            sharedDeviceId: '',
            deviceId: mode === 'voicemeeter' ? 'VoiceMeeter Input' : 'dac-1',
            bufferFrames: 512,
            fallbackToShared: false,
            bitPerfectRequired: false,
            voicemeeterBus: 'A1',
            diagnosticsEnabled: true
          }
        })
      )

      expect(controller.canPlay(request)).toBe(false)
      expect(controller.requiresNativePlayback(request)).toBe(true)
    }
  )

  it('allows Chromium fallback for exclusive mode when shared fallback is enabled', async () => {
    const listeners = new Map<string, (value: unknown) => void>()
    Object.assign(window, {
      services: {
        invoke: vi.fn().mockResolvedValue(createDisabledStatus()),
        on: vi.fn((channel: string, listener: (value: unknown) => void) => {
          listeners.set(channel, listener)
        })
      }
    })
    const { getDefaultNativeAudioOutputPlaybackController } =
      await import('@/store/player/nativeAudioOutputPlayback')
    const controller = getDefaultNativeAudioOutputPlaybackController()
    const request = {
      song: createLocalSong('D:\\Music\\exclusive-fallback.webm'),
      volume: 1
    }

    listeners.get(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED)?.(
      createNativeReadyStatus({
        requestedMode: 'exclusive',
        activeMode: 'shared',
        settings: {
          mode: 'exclusive',
          sharedDeviceId: '',
          deviceId: 'dac-1',
          bufferFrames: 512,
          fallbackToShared: true,
          bitPerfectRequired: false,
          voicemeeterBus: 'A1',
          diagnosticsEnabled: true
        }
      })
    )

    expect(controller.canPlay(request)).toBe(false)
    expect(controller.requiresNativePlayback(request)).toBe(false)
  })
})
