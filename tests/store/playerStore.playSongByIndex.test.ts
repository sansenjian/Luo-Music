import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPlayerStore } from '@/store/playerStore'
import {
  NativeAudioOutputFailedPlaybackError,
  type NativeAudioOutputPlaybackError,
  NativeAudioOutputRetryablePlaybackError,
  type NativeAudioOutputPlaybackController,
  type NativeAudioOutputPlaybackRequest
} from '@/store/player/nativeAudioOutputPlayback'
import { errorCenter } from '@/utils/error/center'
import type { AudioOutputStatus } from '@shared/audioOutput/protocol'
import { createMockSong } from '../utils/test-utils'

const createAudioManagerMock = () => ({
  play: vi.fn(),
  pause: vi.fn(),
  releaseSource: vi.fn(),
  toggle: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
  getMuted: vi.fn(() => false),
  setMuted: vi.fn()
})

const createPlatformAccessorMock = (isElectron = false) => ({
  isElectron: vi.fn(() => isElectron),
  send: vi.fn(),
  sendPlayingState: vi.fn(),
  sendPlayModeChange: vi.fn(),
  on: vi.fn((_channel: string, _callback: (...args: unknown[]) => void) => () => {})
})

function createNativeAudioOutputPlaybackMock(): NativeAudioOutputPlaybackController & {
  triggerEnded: () => void
  triggerError: (error?: NativeAudioOutputPlaybackError) => void
  triggerStatus: (status: Partial<AudioOutputStatus>) => void
} {
  const endedListeners = new Set<() => void>()
  const errorListeners = new Set<(error?: NativeAudioOutputPlaybackError) => void>()
  const statusListeners = new Set<(status: AudioOutputStatus) => void>()
  const supportedExtensions = [
    '.aac',
    '.aif',
    '.aiff',
    '.ape',
    '.caf',
    '.flac',
    '.m4a',
    '.mka',
    '.mp1',
    '.mp2',
    '.mp3',
    '.mpa',
    '.ogg',
    '.wav'
  ]
  const unsupportedRemoteExtensions = ['.mkv', '.opus', '.webm']
  const controller = {
    canPlay: vi.fn((request: NativeAudioOutputPlaybackRequest) => {
      const extra = request.song.extra as Record<string, unknown> | undefined
      const localFilePath = extra?.localFilePath
      const remoteUrl = request.song.url
      if (
        typeof remoteUrl === 'string' &&
        (remoteUrl.startsWith('http://') || remoteUrl.startsWith('https://'))
      ) {
        try {
          const remotePathname = new URL(remoteUrl).pathname.toLowerCase()
          return !unsupportedRemoteExtensions.some(extension => remotePathname.endsWith(extension))
        } catch {
          return true
        }
      }

      return (
        extra?.localSource === true &&
        typeof localFilePath === 'string' &&
        supportedExtensions.some(extension => localFilePath.toLowerCase().endsWith(extension))
      )
    }),
    requiresNativePlayback: vi.fn(() => false),
    play: vi.fn(async () => true),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    setVolume: vi.fn(async () => {}),
    onStatus: vi.fn((listener: (status: AudioOutputStatus) => void) => {
      statusListeners.add(listener)
      return () => {
        statusListeners.delete(listener)
      }
    }),
    onEnded: vi.fn((listener: () => void) => {
      endedListeners.add(listener)
      return () => {
        endedListeners.delete(listener)
      }
    }),
    onError: vi.fn((listener: (error?: NativeAudioOutputPlaybackError) => void) => {
      errorListeners.add(listener)
      return () => {
        errorListeners.delete(listener)
      }
    }),
    triggerEnded: () => {
      for (const listener of endedListeners) {
        listener()
      }
    },
    triggerError: (error?: NativeAudioOutputPlaybackError) => {
      for (const listener of errorListeners) {
        listener(error)
      }
    },
    triggerStatus: (status: Partial<AudioOutputStatus>) => {
      const payload: AudioOutputStatus = {
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        settings: {
          mode: 'exclusive',
          sharedDeviceId: '',
          deviceId: '',
          bufferFrames: 960,
          fallbackToShared: true,
          bitPerfectRequired: false,
          voicemeeterBus: 'A1',
          diagnosticsEnabled: false
        },
        requestedMode: 'exclusive',
        activeMode: 'exclusive',
        devices: [],
        ...status
      }
      for (const listener of statusListeners) {
        listener(payload)
      }
    }
  }

  return controller
}

describe('playerStore.playSongByIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets current song optimistically before audio playback', async () => {
    const audioManager = createAudioManagerMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(false)
      },
      'player-playbyindex-test'
    )
    const store = usePlayerStore()
    const firstSong = createMockSong({
      id: 'song-1',
      name: 'First',
      url: 'https://song.test/1.mp3'
    })
    const secondSong = createMockSong({
      id: 'song-2',
      name: 'Second',
      url: 'https://song.test/2.mp3'
    })

    store.songList = [firstSong, secondSong]
    store.currentIndex = 0
    store.currentSong = firstSong
    store.initialized = true

    audioManager.play.mockRejectedValueOnce(new Error('playback failed'))

    await expect(store.playSongByIndex(1)).rejects.toThrow('playback failed')

    // currentSong is set optimistically before audio.src changes (for MediaSession)
    expect(store.currentIndex).toBe(1)
    expect(store.currentSong).toStrictEqual(secondSong)
  })

  it('routes Electron local decodable playback through the native audio output controller', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const platformAccessor = createPlatformAccessorMock(true)
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => platformAccessor,
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-local-file-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:mp3',
      name: 'Local MP3',
      platform: 'local',
      url: 'file:///D:/Music/local.mp3',
      duration: 240000,
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\local.mp3',
        localDurationKnown: true
      }
    })

    store.songList = [song]

    await store.playSongByIndex(0)

    expect(nativeAudioOutputPlayback.canPlay).toHaveBeenCalledWith({
      song,
      startSeconds: 0,
      volume: 0.7
    })
    expect(nativeAudioOutputPlayback.play).toHaveBeenCalledWith({
      song,
      startSeconds: 0,
      volume: 0.7
    })
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(audioManager.releaseSource).toHaveBeenCalled()
    expect(audioManager.releaseSource.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(nativeAudioOutputPlayback.play).mock.invocationCallOrder[0]
    )
    expect(store.currentSong).toStrictEqual(song)
    expect(store.currentIndex).toBe(0)
    expect(store.duration).toBe(240)
    expect(store.playing).toBe(true)
    expect(platformAccessor.sendPlayingState).toHaveBeenCalledWith(true)
  })

  it('routes Electron remote playback through the native audio output controller', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const platformAccessor = createPlatformAccessorMock(true)
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => platformAccessor,
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-remote-url-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:mp3',
      name: 'Remote MP3',
      platform: 'netease',
      url: 'https://song.test/remote.mp3',
      duration: 180000
    })

    store.songList = [song]

    await store.playSongByIndex(0)

    expect(nativeAudioOutputPlayback.canPlay).toHaveBeenCalledWith({
      song,
      startSeconds: 0,
      volume: 0.7
    })
    expect(nativeAudioOutputPlayback.play).toHaveBeenCalledWith({
      song,
      startSeconds: 0,
      volume: 0.7
    })
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(audioManager.releaseSource).toHaveBeenCalled()
    expect(store.currentSong).toStrictEqual(song)
    expect(store.currentIndex).toBe(0)
    expect(store.duration).toBe(180)
    expect(store.playing).toBe(true)
    expect(platformAccessor.sendPlayingState).toHaveBeenCalledWith(true)
  })

  it('keeps Chromium playback for known unsupported remote extensions in Electron', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-remote-unsupported-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:opus',
      name: 'Remote Opus',
      platform: 'netease',
      url: 'https://song.test/remote.opus?token=1',
      duration: 180000
    })

    store.songList = [song]

    await store.playSongByIndex(0)

    expect(nativeAudioOutputPlayback.canPlay).toHaveBeenCalledWith({
      song,
      startSeconds: 0,
      volume: 0.7
    })
    expect(nativeAudioOutputPlayback.play).not.toHaveBeenCalled()
    expect(audioManager.play).toHaveBeenCalledWith(
      `luo-media://remote?url=${encodeURIComponent('https://song.test/remote.opus?token=1')}`
    )
    expect(store.currentSong).toStrictEqual(song)
    expect(store.currentIndex).toBe(0)
    expect(store.playing).toBe(true)
  })

  it('routes Electron local Matroska audio containers through the native audio output controller', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-local-mka-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:mka',
      name: 'Local MKA',
      platform: 'local',
      url: 'file:///D:/Music/local.mka',
      duration: 210000,
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\local.mka',
        localDurationKnown: true
      }
    })

    store.songList = [song]

    await store.playSongByIndex(0)

    expect(nativeAudioOutputPlayback.play).toHaveBeenCalledWith({
      song,
      startSeconds: 0,
      volume: 0.7
    })
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(store.duration).toBe(210)
    expect(store.playing).toBe(true)
  })

  it('advances store progress from the native audio output clock', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    try {
      const audioManager = createAudioManagerMock()
      const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
      const platformAccessor = createPlatformAccessorMock(true)
      const usePlayerStore = createPlayerStore(
        {
          audioManager,
          getPlatformAccessor: () => platformAccessor,
          nativeAudioOutputPlayback
        },
        'player-native-audio-output-progress-clock-test'
      )
      const store = usePlayerStore()
      const song = createMockSong({
        id: 'local:native-clock',
        name: 'Local Native Clock',
        platform: 'local',
        url: 'file:///D:/Music/native-clock.mp3',
        duration: 240000,
        extra: {
          localSource: true,
          localFilePath: 'D:\\Music\\native-clock.mp3',
          localDurationKnown: true
        }
      })

      store.songList = [song]
      await store.playSongByIndex(0)

      expect(store.progress).toBe(0)

      vi.advanceTimersByTime(1000)

      expect(store.progress).toBe(0)

      nativeAudioOutputPlayback.triggerStatus({
        nativePlaybackRunning: true,
        nativePlaybackSource: 'D:\\Music\\native-clock.mp3',
        nativePlaybackState: 'playing',
        nativePlaybackPositionSeconds: 0
      })

      vi.advanceTimersByTime(1000)

      expect(store.progress).toBeCloseTo(1, 1)
      expect(platformAccessor.send).toHaveBeenCalledWith(
        'lyric-time-update',
        expect.objectContaining({
          time: expect.any(Number),
          cause: 'interval'
        })
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('anchors native audio output progress to helper playback positions', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    try {
      const audioManager = createAudioManagerMock()
      const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
      const platformAccessor = createPlatformAccessorMock(true)
      const usePlayerStore = createPlayerStore(
        {
          audioManager,
          getPlatformAccessor: () => platformAccessor,
          nativeAudioOutputPlayback
        },
        'player-native-audio-output-helper-position-test'
      )
      const store = usePlayerStore()
      const song = createMockSong({
        id: 'remote:native-position',
        name: 'Remote Native Position',
        platform: 'netease',
        url: 'https://song.test/native-position.mp3',
        duration: 240000
      })

      store.songList = [song]
      await store.playSongByIndex(0)

      vi.advanceTimersByTime(1500)
      expect(store.progress).toBe(0)

      nativeAudioOutputPlayback.triggerStatus({
        nativePlaybackRunning: true,
        nativePlaybackSource: song.url,
        nativePlaybackState: 'playing',
        nativePlaybackPositionSeconds: 12.25
      })

      expect(store.progress).toBe(12.25)

      vi.advanceTimersByTime(750)

      expect(store.progress).toBeCloseTo(13, 1)

      nativeAudioOutputPlayback.triggerStatus({
        nativePlaybackRunning: true,
        nativePlaybackSource: song.url,
        nativePlaybackState: 'playing',
        nativePlaybackPositionSeconds: 20
      })

      expect(store.progress).toBe(20)
    } finally {
      vi.useRealTimers()
    }
  })

  it('seeks active native audio output playback by restarting the local file at the target time', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-seek-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:native-seek',
      name: 'Local Native Seek',
      platform: 'local',
      url: 'file:///D:/Music/native-seek.mp3',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\native-seek.mp3',
        localDurationKnown: true
      }
    })

    store.songList = [song]
    await store.playSongByIndex(0)
    vi.mocked(nativeAudioOutputPlayback.play).mockClear()
    audioManager.seek.mockClear()

    store.seek(42)

    expect(nativeAudioOutputPlayback.play).toHaveBeenCalledWith({
      song,
      startSeconds: 42,
      volume: 0.7
    })
    expect(audioManager.seek).not.toHaveBeenCalled()
    expect(store.progress).toBe(42)
  })

  it('keeps native audio output paused after seeking while paused', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-paused-seek-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:native-paused-seek',
      name: 'Local Native Paused Seek',
      platform: 'local',
      url: 'file:///D:/Music/native-paused-seek.mp3',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\native-paused-seek.mp3',
        localDurationKnown: true
      }
    })

    store.songList = [song]
    await store.playSongByIndex(0)
    store.playing = false
    vi.mocked(nativeAudioOutputPlayback.play).mockClear()
    vi.mocked(nativeAudioOutputPlayback.pause).mockClear()

    store.seek(64)

    expect(nativeAudioOutputPlayback.play).toHaveBeenCalledWith({
      song,
      startSeconds: 64,
      volume: 0.7
    })
    await vi.waitFor(() => {
      expect(nativeAudioOutputPlayback.pause).toHaveBeenCalled()
    })
    expect(store.playing).toBe(false)
  })

  it('falls back to Chromium at the seek time when native seek restart fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-seek-fallback-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:native-seek-fallback',
      name: 'Local Native Seek Fallback',
      platform: 'local',
      url: 'file:///D:/Music/native-seek-fallback.mp3',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\native-seek-fallback.mp3',
        localDurationKnown: true
      }
    })

    store.songList = [song]
    await store.playSongByIndex(0)
    vi.mocked(nativeAudioOutputPlayback.play).mockClear()
    vi.mocked(nativeAudioOutputPlayback.stop).mockClear()
    vi.mocked(nativeAudioOutputPlayback.play).mockRejectedValueOnce(new Error('seek failed'))
    audioManager.play.mockClear()
    audioManager.seek.mockClear()

    try {
      store.seek(52)
      await vi.waitFor(() => {
        expect(audioManager.play).toHaveBeenCalledWith('file:///D:/Music/native-seek-fallback.mp3')
      })
    } finally {
      warnSpy.mockRestore()
    }

    expect(nativeAudioOutputPlayback.stop).toHaveBeenCalled()
    expect(vi.mocked(nativeAudioOutputPlayback.stop).mock.invocationCallOrder[0]).toBeLessThan(
      audioManager.play.mock.invocationCallOrder[0]
    )
    expect(audioManager.seek).toHaveBeenCalledWith(52)
    expect(store.playing).toBe(true)
  })

  it('refreshes remote native playback URL when seek restart hits expired authorization', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const nativePlaySnapshots: Array<{
      url?: string
      startSeconds?: number
      headers?: unknown
    }> = []
    vi.mocked(nativeAudioOutputPlayback.play).mockImplementation(async request => {
      nativePlaySnapshots.push({
        url: request.song.url,
        startSeconds: request.startSeconds,
        headers: request.song.extra?.nativeAudioOutputRequestHeaders
      })

      if (
        request.song.url === 'https://song.test/seek-expired.mp3' &&
        request.startSeconds === 42
      ) {
        throw new NativeAudioOutputRetryablePlaybackError('remote-auth-expired', 403)
      }

      return true
    })
    const musicService = {
      getPlatformCapabilities: vi.fn(() => ({
        search: true,
        songUrl: true,
        songDetail: true,
        lyric: true,
        playlistDetail: true,
        needsHydration: false,
        supportsLyricFetch: false,
        supportsUrlRefreshOnFailure: true
      })),
      getSongUrl: vi.fn().mockResolvedValue({
        url: 'https://song.test/seek-fresh.mp3',
        headers: {
          cookie: 'MUSIC_U=fresh-seek'
        }
      }),
      getSongDetail: vi.fn(),
      getLyric: vi.fn()
    }
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getMusicService: () => musicService,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-seek-auth-refresh-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:seek-expired',
      name: 'Seek Expired',
      platform: 'netease',
      url: 'https://song.test/seek-expired.mp3',
      extra: {
        nativeAudioOutputRequestHeaders: {
          cookie: 'MUSIC_U=expired-seek'
        }
      }
    })

    store.songList = [song]

    try {
      await store.playSongByIndex(0)
      store.seek(42)

      await vi.waitFor(() => {
        expect(nativePlaySnapshots).toHaveLength(4)
      })
    } finally {
      warnSpy.mockRestore()
    }

    expect(nativePlaySnapshots).toEqual([
      {
        url: 'https://song.test/seek-expired.mp3',
        startSeconds: 0,
        headers: {
          cookie: 'MUSIC_U=expired-seek'
        }
      },
      {
        url: 'https://song.test/seek-expired.mp3',
        startSeconds: 42,
        headers: {
          cookie: 'MUSIC_U=expired-seek'
        }
      },
      {
        url: 'https://song.test/seek-fresh.mp3',
        startSeconds: 0,
        headers: {
          cookie: 'MUSIC_U=fresh-seek'
        }
      },
      {
        url: 'https://song.test/seek-fresh.mp3',
        startSeconds: 42,
        headers: {
          cookie: 'MUSIC_U=fresh-seek'
        }
      }
    ])
    expect(musicService.getSongUrl).toHaveBeenCalledWith('netease', 'remote:seek-expired', {
      mediaId: undefined
    })
    expect(song.url).toBe('https://song.test/seek-fresh.mp3')
    expect(song.extra?.nativeAudioOutputRequestHeaders).toEqual({
      cookie: 'MUSIC_U=fresh-seek'
    })
    expect(nativeAudioOutputPlayback.stop).toHaveBeenCalled()
    expect(vi.mocked(nativeAudioOutputPlayback.stop).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(nativeAudioOutputPlayback.play).mock.invocationCallOrder[2]
    )
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(store.progress).toBe(42)
    expect(store.playing).toBe(true)
  })

  it('ignores an older native startup result after a newer song starts', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const firstNativeStart = Promise.withResolvers<boolean>()
    const secondNativeStart = Promise.withResolvers<boolean>()
    vi.mocked(nativeAudioOutputPlayback.play)
      .mockReturnValueOnce(firstNativeStart.promise)
      .mockReturnValueOnce(secondNativeStart.promise)
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-superseded-start-test'
    )
    const store = usePlayerStore()
    const firstSong = createMockSong({
      id: 'remote:native-old-start',
      name: 'Native Old Start',
      platform: 'netease',
      url: 'https://song.test/native-old-start.mp3'
    })
    const secondSong = createMockSong({
      id: 'remote:native-new-start',
      name: 'Native New Start',
      platform: 'netease',
      url: 'https://song.test/native-new-start.mp3'
    })

    store.songList = [firstSong, secondSong]
    const firstPlayback = store.playSongByIndex(0)
    const secondPlayback = store.playSongByIndex(1)

    secondNativeStart.resolve(true)
    await secondPlayback

    firstNativeStart.resolve(true)
    await firstPlayback

    expect(store.currentSong?.id).toBe(secondSong.id)
    expect(store.currentIndex).toBe(1)
    expect(store.playing).toBe(true)
    expect(store.trackSwitching).toBe(false)
    expect(audioManager.play).not.toHaveBeenCalled()
  })

  it('restarts active playback at the current progress after audio output route changes', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-route-restart-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:route-restart',
      name: 'Route Restart',
      platform: 'netease',
      url: 'https://song.test/route-restart.flac'
    })

    store.songList = [song]
    store.currentIndex = 0
    store.currentSong = song
    store.initialized = true
    store.playing = true
    store.progress = 37
    store.duration = 240

    await store.restartPlaybackForAudioOutputChange()

    expect(audioManager.releaseSource).toHaveBeenCalled()
    expect(nativeAudioOutputPlayback.play).toHaveBeenCalledWith({
      song,
      startSeconds: 37,
      volume: 0.7
    })
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(store.progress).toBe(37)
    expect(store.playing).toBe(true)
    expect(store.trackSwitching).toBe(false)
  })

  it('keeps Chromium released while a Voicemeeter route restart waits for native startup', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const nativeStart = Promise.withResolvers<boolean>()
    vi.mocked(nativeAudioOutputPlayback.play).mockReturnValueOnce(nativeStart.promise)
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-voicemeeter-route-restart-pending-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:voicemeeter-route-restart-pending',
      name: 'Voicemeeter Route Restart Pending',
      platform: 'netease',
      url: 'https://song.test/voicemeeter-route-restart-pending.mp3'
    })

    store.songList = [song]
    store.currentIndex = 0
    store.currentSong = song
    store.initialized = true
    store.playing = true
    store.progress = 18
    store.duration = 240

    const restart = store.restartPlaybackForAudioOutputChange()

    await vi.waitFor(() => {
      expect(nativeAudioOutputPlayback.play).toHaveBeenCalledWith({
        song,
        startSeconds: 18,
        volume: 0.7
      })
    })

    expect(audioManager.releaseSource).toHaveBeenCalledOnce()
    expect(audioManager.releaseSource.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(nativeAudioOutputPlayback.play).mock.invocationCallOrder[0]
    )
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(store.trackSwitching).toBe(true)

    nativeStart.resolve(true)
    await restart

    expect(audioManager.play).not.toHaveBeenCalled()
    expect(store.progress).toBe(18)
    expect(store.playing).toBe(true)
    expect(store.trackSwitching).toBe(false)
  })

  it('keeps current native clock progress when settings-change stop omits helper position', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    try {
      const audioManager = createAudioManagerMock()
      const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
      const usePlayerStore = createPlayerStore(
        {
          audioManager,
          getPlatformAccessor: () => createPlatformAccessorMock(true),
          nativeAudioOutputPlayback
        },
        'player-native-audio-output-route-restart-local-clock-test'
      )
      const store = usePlayerStore()
      const song = createMockSong({
        id: 'remote:route-restart-local-clock',
        name: 'Route Restart Local Clock',
        platform: 'netease',
        url: 'https://song.test/route-restart-local-clock.flac',
        duration: 240000
      })

      store.songList = [song]
      await store.playSongByIndex(0)
      nativeAudioOutputPlayback.triggerStatus({
        nativePlaybackRunning: true,
        nativePlaybackSource: song.url,
        nativePlaybackState: 'playing',
        nativePlaybackPositionSeconds: 21
      })

      vi.advanceTimersByTime(100)
      nativeAudioOutputPlayback.triggerStatus({
        nativePlaybackRunning: false,
        nativePlaybackSource: song.url,
        nativePlaybackState: 'stopped',
        reason: 'Native audio output playback stopped because output settings changed.'
      })
      vi.mocked(nativeAudioOutputPlayback.play).mockClear()

      await store.restartPlaybackForAudioOutputChange()

      const restartRequest = vi.mocked(nativeAudioOutputPlayback.play).mock.calls.at(-1)?.[0]
      expect(restartRequest?.startSeconds).toBeCloseTo(21.1, 2)
      expect(store.progress).toBeCloseTo(21.1, 2)
      expect(audioManager.play).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to Chromium at the current progress when native output is disabled during route restart', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    vi.mocked(nativeAudioOutputPlayback.canPlay).mockReturnValue(false)
    const platformAccessor = createPlatformAccessorMock(true)
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => platformAccessor,
        nativeAudioOutputPlayback
      },
      'player-audio-output-route-restart-chromium-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:route-restart-chromium',
      name: 'Route Restart Chromium',
      platform: 'netease',
      url: 'https://song.test/route-restart-chromium.mp3'
    })

    store.songList = [song]
    store.currentIndex = 0
    store.currentSong = song
    store.initAudio()
    store.playing = true
    store.progress = 53
    store.duration = 240
    nativeAudioOutputPlayback.triggerStatus({
      nativePlaybackRunning: true,
      nativePlaybackSource: song.url,
      nativePlaybackState: 'playing',
      nativePlaybackPositionSeconds: 53
    })

    await store.restartPlaybackForAudioOutputChange()

    expect(nativeAudioOutputPlayback.play).not.toHaveBeenCalled()
    expect(audioManager.play).toHaveBeenCalledWith(
      expect.stringContaining('https%3A%2F%2Fsong.test%2Froute-restart-chromium.mp3')
    )
    expect(audioManager.seek).toHaveBeenCalledWith(53)
    expect(store.playing).toBe(true)
    expect(platformAccessor.sendPlayingState).not.toHaveBeenCalledWith(false)
  })

  it('forces native output to stop before Chromium fallback after a settings-change stop', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    vi.mocked(nativeAudioOutputPlayback.canPlay).mockReturnValue(false)
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-audio-output-route-restart-settings-stop-fallback-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:settings-stop-fallback',
      name: 'Settings Stop Fallback',
      platform: 'netease',
      url: 'https://song.test/settings-stop-fallback.mp3'
    })

    store.songList = [song]
    store.currentIndex = 0
    store.currentSong = song
    store.initAudio()
    store.playing = true
    store.progress = 21

    nativeAudioOutputPlayback.triggerStatus({
      nativePlaybackRunning: true,
      nativePlaybackSource: song.url,
      nativePlaybackState: 'playing',
      nativePlaybackPositionSeconds: 21
    })
    nativeAudioOutputPlayback.triggerStatus({
      nativePlaybackRunning: false,
      nativePlaybackSource: song.url,
      nativePlaybackState: 'stopped',
      nativePlaybackPositionSeconds: 21,
      reason: 'Native audio output playback stopped because output settings changed.'
    })
    vi.mocked(nativeAudioOutputPlayback.stop).mockClear()

    await store.restartPlaybackForAudioOutputChange()

    expect(nativeAudioOutputPlayback.play).not.toHaveBeenCalled()
    expect(nativeAudioOutputPlayback.stop).toHaveBeenCalledOnce()
    expect(vi.mocked(nativeAudioOutputPlayback.stop).mock.invocationCallOrder[0]).toBeLessThan(
      audioManager.play.mock.invocationCallOrder[0]
    )
    expect(audioManager.play).toHaveBeenCalledWith(
      expect.stringContaining('https%3A%2F%2Fsong.test%2Fsettings-stop-fallback.mp3')
    )
    expect(audioManager.seek).toHaveBeenCalledWith(21)
    expect(store.playing).toBe(true)
  })

  it('falls back to Chromium when native local playback fails to start', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-start-fallback-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:native-start-fails',
      name: 'Local Native Start Fails',
      platform: 'local',
      url: 'file:///D:/Music/native-start-fails.mp3',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\native-start-fails.mp3',
        localDurationKnown: true
      }
    })
    vi.mocked(nativeAudioOutputPlayback.play).mockRejectedValueOnce(new Error('main failed'))

    store.songList = [song]

    try {
      await expect(store.playSongByIndex(0)).resolves.toBeUndefined()
    } finally {
      warnSpy.mockRestore()
    }

    expect(nativeAudioOutputPlayback.play).toHaveBeenCalled()
    expect(nativeAudioOutputPlayback.stop).toHaveBeenCalled()
    expect(vi.mocked(nativeAudioOutputPlayback.stop).mock.invocationCallOrder[0]).toBeLessThan(
      audioManager.play.mock.invocationCallOrder[0]
    )
    expect(audioManager.play).toHaveBeenCalledWith('file:///D:/Music/native-start-fails.mp3')
    expect(store.currentSong).toStrictEqual(song)
    expect(store.currentIndex).toBe(0)
    expect(store.playing).toBe(true)
  })

  it('ignores Chromium audio errors while native audio output is starting', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    let resolveNativePlay!: (didStart: boolean) => void
    vi.mocked(nativeAudioOutputPlayback.play).mockReturnValueOnce(
      new Promise<boolean>(resolve => {
        resolveNativePlay = resolve
      })
    )
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-ignore-chromium-error-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:native-start-pending',
      name: 'Remote Native Start Pending',
      platform: 'netease',
      url: 'https://song.test/native-start-pending.mp3'
    })

    store.songList = [song]
    const playbackPromise = store.playSongByIndex(0)

    await vi.waitFor(() => {
      expect(nativeAudioOutputPlayback.play).toHaveBeenCalled()
    })

    await store.handleAudioError(new Error('stale Chromium audio error'))

    expect(audioManager.play).not.toHaveBeenCalled()
    expect(song.retryCount).toBeUndefined()
    expect(song.unavailable).not.toBe(true)

    resolveNativePlay(true)
    await playbackPromise

    expect(store.playing).toBe(true)
  })

  it('ignores Chromium audio errors emitted while releasing the old source for native startup', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const musicService = {
      getPlatformCapabilities: vi.fn(),
      getSongUrl: vi.fn(),
      getSongDetail: vi.fn(),
      getLyric: vi.fn()
    }
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getMusicService: () => musicService,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-release-error-guard-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:native-release-error',
      name: 'Remote Native Release Error',
      platform: 'netease',
      url: 'https://song.test/native-release-error.mp3'
    })
    audioManager.releaseSource.mockImplementation(() => {
      void store.handleAudioError(new Error('stale Chromium release error'))
    })

    store.songList = [song]
    await store.playSongByIndex(0)

    expect(audioManager.releaseSource).toHaveBeenCalled()
    expect(nativeAudioOutputPlayback.play).toHaveBeenCalledWith({
      song,
      startSeconds: 0,
      volume: 0.7
    })
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(musicService.getSongUrl).not.toHaveBeenCalled()
    expect(song.retryCount).toBeUndefined()
    expect(song.unavailable).not.toBe(true)
    expect(store.playing).toBe(true)
  })

  it('waits for Chromium source release before starting native exclusive playback', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const releaseSource = Promise.withResolvers<void>()
    audioManager.releaseSource.mockReturnValueOnce(releaseSource.promise)
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-release-source-before-native-play-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:native-release-before-play',
      name: 'Remote Native Release Before Play',
      platform: 'netease',
      url: 'https://song.test/native-release-before-play.mp3'
    })

    store.songList = [song]
    const playbackPromise = store.playSongByIndex(0)

    await vi.waitFor(() => {
      expect(audioManager.releaseSource).toHaveBeenCalled()
    })
    expect(nativeAudioOutputPlayback.play).not.toHaveBeenCalled()

    releaseSource.resolve()
    await playbackPromise

    expect(nativeAudioOutputPlayback.play).toHaveBeenCalledWith({
      song,
      startSeconds: 0,
      volume: 0.7
    })
    expect(audioManager.releaseSource.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(nativeAudioOutputPlayback.play).mock.invocationCallOrder[0]
    )
    expect(store.playing).toBe(true)
  })

  it('keeps native audio output paused when playback is toggled off during startup', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const platformAccessor = createPlatformAccessorMock(true)
    let resolveNativePlay!: (didStart: boolean) => void
    vi.mocked(nativeAudioOutputPlayback.play).mockReturnValueOnce(
      new Promise<boolean>(resolve => {
        resolveNativePlay = resolve
      })
    )
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => platformAccessor,
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-pending-toggle-pause-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:native-pending-pause',
      name: 'Remote Native Pending Pause',
      platform: 'netease',
      url: 'https://song.test/native-pending-pause.mp3'
    })

    store.songList = [song]
    const playbackPromise = store.playSongByIndex(0)

    await vi.waitFor(() => {
      expect(nativeAudioOutputPlayback.play).toHaveBeenCalled()
    })

    store.togglePlay()

    expect(store.playing).toBe(false)
    expect(platformAccessor.sendPlayingState).toHaveBeenLastCalledWith(false)

    resolveNativePlay(true)
    await playbackPromise

    expect(nativeAudioOutputPlayback.pause).toHaveBeenCalled()
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(store.playing).toBe(false)
    expect(platformAccessor.sendPlayingState).toHaveBeenLastCalledWith(false)
  })

  it('keeps native audio output paused when an explicit IPC pause arrives during startup', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const platformAccessor = createPlatformAccessorMock(true)
    let resolveNativePlay!: (didStart: boolean) => void
    vi.mocked(nativeAudioOutputPlayback.play).mockReturnValueOnce(
      new Promise<boolean>(resolve => {
        resolveNativePlay = resolve
      })
    )
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => platformAccessor,
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-pending-ipc-pause-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:native-pending-ipc-pause',
      name: 'Remote Native Pending IPC Pause',
      platform: 'netease',
      url: 'https://song.test/native-pending-ipc-pause.mp3'
    })

    store.songList = [song]
    const playbackPromise = store.playSongByIndex(0)

    await vi.waitFor(() => {
      expect(nativeAudioOutputPlayback.play).toHaveBeenCalled()
    })

    const musicControlListener = platformAccessor.on.mock.calls.find(
      ([channel]) => channel === 'music-playing-control'
    )?.[1] as ((command: unknown) => void) | undefined
    musicControlListener?.('pause')

    expect(store.playing).toBe(false)
    expect(platformAccessor.sendPlayingState).toHaveBeenLastCalledWith(false)

    resolveNativePlay(true)
    await playbackPromise

    expect(nativeAudioOutputPlayback.pause).toHaveBeenCalled()
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(store.playing).toBe(false)
    expect(platformAccessor.sendPlayingState).toHaveBeenLastCalledWith(false)
  })

  it('honors a later explicit IPC play command after startup was paused', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const platformAccessor = createPlatformAccessorMock(true)
    let resolveNativePlay!: (didStart: boolean) => void
    vi.mocked(nativeAudioOutputPlayback.play).mockReturnValueOnce(
      new Promise<boolean>(resolve => {
        resolveNativePlay = resolve
      })
    )
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => platformAccessor,
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-pending-ipc-play-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:native-pending-ipc-play',
      name: 'Remote Native Pending IPC Play',
      platform: 'netease',
      url: 'https://song.test/native-pending-ipc-play.mp3'
    })

    store.songList = [song]
    const playbackPromise = store.playSongByIndex(0)

    await vi.waitFor(() => {
      expect(nativeAudioOutputPlayback.play).toHaveBeenCalled()
    })

    const musicControlListener = platformAccessor.on.mock.calls.find(
      ([channel]) => channel === 'music-playing-control'
    )?.[1] as ((command: unknown) => void) | undefined
    musicControlListener?.('pause')
    musicControlListener?.('play')

    expect(store.playing).toBe(true)
    expect(platformAccessor.sendPlayingState).toHaveBeenLastCalledWith(true)

    resolveNativePlay(true)
    await playbackPromise

    expect(nativeAudioOutputPlayback.pause).not.toHaveBeenCalled()
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(store.playing).toBe(true)
    expect(platformAccessor.sendPlayingState).toHaveBeenLastCalledWith(true)
  })

  it('pauses native output immediately when helper reports playing before a pending startup resolves', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const platformAccessor = createPlatformAccessorMock(true)
    let resolveNativePlay!: (didStart: boolean) => void
    vi.mocked(nativeAudioOutputPlayback.play).mockReturnValueOnce(
      new Promise<boolean>(resolve => {
        resolveNativePlay = resolve
      })
    )
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => platformAccessor,
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-early-playing-pending-pause-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:native-early-playing-pause',
      name: 'Remote Native Early Playing Pause',
      platform: 'netease',
      url: 'https://song.test/native-early-playing-pause.mp3'
    })

    store.songList = [song]
    const playbackPromise = store.playSongByIndex(0)

    await vi.waitFor(() => {
      expect(nativeAudioOutputPlayback.play).toHaveBeenCalled()
    })

    const musicControlListener = platformAccessor.on.mock.calls.find(
      ([channel]) => channel === 'music-playing-control'
    )?.[1] as ((command: unknown) => void) | undefined
    musicControlListener?.('pause')
    nativeAudioOutputPlayback.triggerStatus({
      nativePlaybackRunning: true,
      nativePlaybackSource: song.url,
      nativePlaybackState: 'playing',
      nativePlaybackPositionSeconds: 0.25
    })

    expect(nativeAudioOutputPlayback.pause).toHaveBeenCalledOnce()
    expect(store.playing).toBe(false)
    expect(store.progress).toBe(0.25)

    resolveNativePlay(true)
    await playbackPromise

    expect(nativeAudioOutputPlayback.pause).toHaveBeenCalledOnce()
    expect(nativeAudioOutputPlayback.resume).not.toHaveBeenCalled()
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(store.playing).toBe(false)
    expect(platformAccessor.sendPlayingState).toHaveBeenLastCalledWith(false)
  })

  it('resumes native output when IPC play follows an early pending-start pause', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const platformAccessor = createPlatformAccessorMock(true)
    let resolveNativePlay!: (didStart: boolean) => void
    vi.mocked(nativeAudioOutputPlayback.play).mockReturnValueOnce(
      new Promise<boolean>(resolve => {
        resolveNativePlay = resolve
      })
    )
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => platformAccessor,
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-early-playing-pending-resume-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:native-early-playing-resume',
      name: 'Remote Native Early Playing Resume',
      platform: 'netease',
      url: 'https://song.test/native-early-playing-resume.mp3'
    })

    store.songList = [song]
    const playbackPromise = store.playSongByIndex(0)

    await vi.waitFor(() => {
      expect(nativeAudioOutputPlayback.play).toHaveBeenCalled()
    })

    const musicControlListener = platformAccessor.on.mock.calls.find(
      ([channel]) => channel === 'music-playing-control'
    )?.[1] as ((command: unknown) => void) | undefined
    musicControlListener?.('pause')
    nativeAudioOutputPlayback.triggerStatus({
      nativePlaybackRunning: true,
      nativePlaybackSource: song.url,
      nativePlaybackState: 'playing',
      nativePlaybackPositionSeconds: 0.5
    })
    musicControlListener?.('play')

    resolveNativePlay(true)
    await playbackPromise

    expect(nativeAudioOutputPlayback.pause).toHaveBeenCalledOnce()
    expect(nativeAudioOutputPlayback.resume).toHaveBeenCalledOnce()
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(store.playing).toBe(true)
    expect(platformAccessor.sendPlayingState).toHaveBeenLastCalledWith(true)
  })

  it('does not fall back to Chromium when bit-perfect native playback is required', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-bit-perfect-required-start-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:bit-perfect-required',
      name: 'Bit Perfect Required',
      platform: 'local',
      url: 'file:///D:/Music/bit-perfect-required.wav',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\bit-perfect-required.wav',
        localDurationKnown: true
      }
    })
    vi.mocked(nativeAudioOutputPlayback.requiresNativePlayback).mockReturnValue(true)
    vi.mocked(nativeAudioOutputPlayback.play).mockRejectedValueOnce(new Error('not candidate'))

    store.songList = [song]

    try {
      await expect(store.playSongByIndex(0)).rejects.toThrow(
        '原生独占输出启动失败，已阻止回退到 Chromium。'
      )
    } finally {
      warnSpy.mockRestore()
    }

    expect(nativeAudioOutputPlayback.play).toHaveBeenCalled()
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(store.playing).toBe(false)
  })

  it('does not fall back to Chromium when required native playback reports not-started', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-bit-perfect-required-not-started-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:bit-perfect-required-not-started',
      name: 'Bit Perfect Required Not Started',
      platform: 'local',
      url: 'file:///D:/Music/bit-perfect-required-not-started.wav',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\bit-perfect-required-not-started.wav',
        localDurationKnown: true
      }
    })
    vi.mocked(nativeAudioOutputPlayback.requiresNativePlayback).mockReturnValue(true)
    vi.mocked(nativeAudioOutputPlayback.play).mockResolvedValueOnce(false)

    store.songList = [song]

    await expect(store.playSongByIndex(0)).rejects.toThrow(
      '原生独占输出未能开始播放，已阻止回退到 Chromium。'
    )

    expect(nativeAudioOutputPlayback.play).toHaveBeenCalled()
    expect(nativeAudioOutputPlayback.stop).toHaveBeenCalled()
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(store.playing).toBe(false)
  })

  it('does not fall back to Chromium when required native playback cannot decode the source', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-required-unsupported-source-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:exclusive-unsupported',
      name: 'Exclusive Unsupported',
      platform: 'netease',
      url: 'https://song.test/exclusive-unsupported.opus?token=1'
    })
    vi.mocked(nativeAudioOutputPlayback.requiresNativePlayback).mockReturnValue(true)

    store.songList = [song]

    await expect(store.playSongByIndex(0)).rejects.toThrow(
      '当前音源不能由原生独占输出播放，已阻止回退到 Chromium。'
    )

    expect(nativeAudioOutputPlayback.canPlay).toHaveBeenCalledWith({
      song,
      startSeconds: 0,
      volume: 0.7
    })
    expect(nativeAudioOutputPlayback.play).not.toHaveBeenCalled()
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(audioManager.releaseSource).toHaveBeenCalled()
    expect(store.playing).toBe(false)
  })

  it('stops showing native playback as active when output settings stop the helper', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const platformAccessor = createPlatformAccessorMock(true)
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => platformAccessor,
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-settings-stop-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:settings-stop',
      name: 'Settings Stop',
      platform: 'netease',
      url: 'https://song.test/settings-stop.mp3'
    })

    store.songList = [song]
    await store.playSongByIndex(0)
    expect(store.playing).toBe(true)

    nativeAudioOutputPlayback.triggerStatus({
      nativePlaybackRunning: false,
      nativePlaybackSource: song.url,
      nativePlaybackState: 'stopped',
      nativePlaybackPositionSeconds: 4
    })

    expect(store.playing).toBe(false)
    expect(platformAccessor.sendPlayingState).toHaveBeenLastCalledWith(false)
  })

  it('propagates retryable native remote auth failures so playback actions can refresh the url', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-retryable-start-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:native-expired',
      name: 'Remote Native Expired',
      platform: 'netease',
      url: 'https://song.test/expired.mp3'
    })
    vi.mocked(nativeAudioOutputPlayback.play).mockRejectedValueOnce(
      new NativeAudioOutputRetryablePlaybackError('remote-auth-expired', 403)
    )

    store.songList = [song]

    await expect(store.playSongByIndex(0)).rejects.toThrow(NativeAudioOutputRetryablePlaybackError)

    expect(nativeAudioOutputPlayback.play).toHaveBeenCalled()
    expect(audioManager.play).not.toHaveBeenCalled()
    expect(store.playing).toBe(false)
  })

  it('falls back to Chromium when native local playback reports an error', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-error-fallback-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:m4a',
      name: 'Local M4A',
      platform: 'local',
      url: 'file:///D:/Music/local.m4a',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\local.m4a',
        localDurationKnown: true
      }
    })

    store.songList = [song]

    await store.playSongByIndex(0)

    expect(audioManager.play).not.toHaveBeenCalled()

    store.progress = 37
    nativeAudioOutputPlayback.triggerError()

    await vi.waitFor(() => {
      expect(nativeAudioOutputPlayback.stop).toHaveBeenCalled()
      expect(audioManager.play).toHaveBeenCalledWith('file:///D:/Music/local.m4a')
    })
    expect(audioManager.seek).toHaveBeenCalledWith(37)
    expect(store.playing).toBe(true)
  })

  it('falls back to Chromium when native status reports an error without an error event', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-status-error-fallback-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:status-error-fallback',
      name: 'Status Error Fallback',
      platform: 'local',
      url: 'file:///D:/Music/status-error-fallback.flac',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\status-error-fallback.flac',
        localDurationKnown: true
      }
    })

    store.songList = [song]
    await store.playSongByIndex(0)
    audioManager.play.mockClear()
    store.progress = 29

    nativeAudioOutputPlayback.triggerStatus({
      nativePlaybackRunning: false,
      nativePlaybackSource: song.url,
      nativePlaybackState: 'error',
      nativePlaybackPositionSeconds: 29,
      reason: 'Native WASAPI exclusive file playback failed: device busy'
    })

    await vi.waitFor(() => {
      expect(nativeAudioOutputPlayback.stop).toHaveBeenCalled()
      expect(audioManager.play).toHaveBeenCalledWith('file:///D:/Music/status-error-fallback.flac')
    })
    expect(audioManager.seek).toHaveBeenCalledWith(29)
    expect(store.playing).toBe(true)
  })

  it('does not fall back to Chromium after runtime native errors when bit-perfect is required', async () => {
    const emitSpy = vi.spyOn(errorCenter, 'emit').mockImplementation(() => {})
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-bit-perfect-required-runtime-error-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:bit-perfect-required-runtime',
      name: 'Bit Perfect Required Runtime',
      platform: 'local',
      url: 'file:///D:/Music/bit-perfect-required-runtime.wav',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\bit-perfect-required-runtime.wav',
        localDurationKnown: true
      }
    })
    vi.mocked(nativeAudioOutputPlayback.requiresNativePlayback).mockReturnValue(true)

    store.songList = [song]
    await store.playSongByIndex(0)
    audioManager.play.mockClear()

    nativeAudioOutputPlayback.triggerError(
      new NativeAudioOutputFailedPlaybackError({
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        settings: {
          mode: 'shared',
          sharedDeviceId: '',
          deviceId: '',
          bufferFrames: 960,
          fallbackToShared: true,
          bitPerfectRequired: true,
          voicemeeterBus: 'A1',
          diagnosticsEnabled: false
        },
        requestedMode: 'shared',
        activeMode: 'shared',
        devices: [],
        nativePlaybackState: 'error',
        reason: 'WASAPI exclusive stream initialization failed.'
      })
    )

    try {
      await vi.waitFor(() => {
        expect(store.playing).toBe(false)
      })

      expect(audioManager.play).not.toHaveBeenCalled()
      expect(nativeAudioOutputPlayback.stop).toHaveBeenCalled()
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            '原生独占输出播放失败，已阻止回退到 Chromium。原因：WASAPI exclusive stream initialization failed.'
        })
      )
    } finally {
      emitSpy.mockRestore()
    }
  })

  it('does not fall back to Chromium when required native playback reports a status-only error', async () => {
    const emitSpy = vi.spyOn(errorCenter, 'emit').mockImplementation(() => {})
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-status-error-required-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:status-error-required',
      name: 'Status Error Required',
      platform: 'local',
      url: 'file:///D:/Music/status-error-required.wav',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\status-error-required.wav',
        localDurationKnown: true
      }
    })
    vi.mocked(nativeAudioOutputPlayback.requiresNativePlayback).mockReturnValue(true)

    store.songList = [song]
    await store.playSongByIndex(0)
    audioManager.play.mockClear()

    nativeAudioOutputPlayback.triggerStatus({
      nativePlaybackRunning: false,
      nativePlaybackSource: song.url,
      nativePlaybackState: 'error',
      nativePlaybackPositionSeconds: 12,
      reason: 'WASAPI exclusive stream initialization failed.'
    })

    try {
      await vi.waitFor(() => {
        expect(store.playing).toBe(false)
      })

      expect(audioManager.play).not.toHaveBeenCalled()
      expect(nativeAudioOutputPlayback.stop).toHaveBeenCalled()
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            '原生独占输出播放失败，已阻止回退到 Chromium。原因：WASAPI exclusive stream initialization failed.'
        })
      )
    } finally {
      emitSpy.mockRestore()
    }
  })

  it('restarts current playback with a fresh url after runtime native remote auth errors', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-runtime-auth-retry-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:runtime-expired',
      name: 'Runtime Expired',
      platform: 'netease',
      url: 'https://song.test/runtime-expired.mp3',
      extra: {
        nativeAudioOutputRequestHeaders: {
          cookie: 'MUSIC_U=expired'
        }
      }
    })

    store.songList = [song]

    await store.playSongByIndex(0)

    const playSongWithDetails = vi.spyOn(store, 'playSongWithDetails').mockResolvedValueOnce()
    const seek = vi.spyOn(store, 'seek')
    store.progress = 53
    nativeAudioOutputPlayback.triggerError(
      new NativeAudioOutputRetryablePlaybackError('remote-auth-expired', 403)
    )

    await vi.waitFor(() => {
      expect(playSongWithDetails).toHaveBeenCalledWith(0)
    })
    await vi.waitFor(() => {
      expect(seek).toHaveBeenCalledWith(53)
    })
    expect(song.url).toBe('')
    expect(song.extra?.nativeAudioOutputRequestHeaders).toBeUndefined()
  })

  it('passes refreshed remote url headers to native playback after runtime auth expiry', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const nativePlaySnapshots: Array<{
      url?: string
      headers?: unknown
    }> = []
    vi.mocked(nativeAudioOutputPlayback.play).mockImplementation(async request => {
      nativePlaySnapshots.push({
        url: request.song.url,
        headers: request.song.extra?.nativeAudioOutputRequestHeaders
      })
      return true
    })
    const musicService = {
      getPlatformCapabilities: vi.fn(() => ({
        search: true,
        songUrl: true,
        songDetail: true,
        lyric: true,
        playlistDetail: true,
        needsHydration: false,
        supportsLyricFetch: false,
        supportsUrlRefreshOnFailure: true
      })),
      getSongUrl: vi.fn().mockResolvedValue({
        url: 'https://song.test/fresh-runtime.mp3',
        headers: {
          authorization: 'Bearer fresh-token',
          cookie: 'MUSIC_U=fresh'
        }
      }),
      getSongDetail: vi.fn(),
      getLyric: vi.fn()
    }
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getMusicService: () => musicService,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-runtime-auth-refresh-headers-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'remote:runtime-expired-headers',
      name: 'Runtime Expired Headers',
      platform: 'netease',
      url: 'https://song.test/expired-runtime.mp3',
      extra: {
        nativeAudioOutputRequestHeaders: {
          authorization: 'Bearer expired-token',
          cookie: 'MUSIC_U=expired'
        }
      }
    })

    store.songList = [song]

    await store.playSongByIndex(0)
    nativeAudioOutputPlayback.triggerError(
      new NativeAudioOutputRetryablePlaybackError('remote-auth-expired', 403)
    )

    await vi.waitFor(() => {
      expect(nativePlaySnapshots).toHaveLength(2)
    })

    expect(nativePlaySnapshots[0]).toEqual({
      url: 'https://song.test/expired-runtime.mp3',
      headers: {
        authorization: 'Bearer expired-token',
        cookie: 'MUSIC_U=expired'
      }
    })
    expect(musicService.getSongUrl).toHaveBeenCalledWith(
      'netease',
      'remote:runtime-expired-headers',
      {
        mediaId: undefined
      }
    )
    expect(nativePlaySnapshots[1]).toEqual({
      url: 'https://song.test/fresh-runtime.mp3',
      headers: {
        authorization: 'Bearer fresh-token',
        cookie: 'MUSIC_U=fresh'
      }
    })
    expect(song.url).toBe('https://song.test/fresh-runtime.mp3')
    expect(song.extra?.nativeAudioOutputRequestHeaders).toEqual({
      authorization: 'Bearer fresh-token',
      cookie: 'MUSIC_U=fresh'
    })
    expect(audioManager.play).not.toHaveBeenCalled()
  })

  it('keeps Chromium playback for unsupported local files in Electron', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(true),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-unsupported-file-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:mkv',
      name: 'Local MKV',
      platform: 'local',
      url: 'file:///D:/Music/local.mkv',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\local.mkv',
        localDurationKnown: true
      }
    })

    store.songList = [song]

    await store.playSongByIndex(0)

    expect(nativeAudioOutputPlayback.canPlay).toHaveBeenCalled()
    expect(nativeAudioOutputPlayback.play).not.toHaveBeenCalled()
    expect(audioManager.play).toHaveBeenCalledWith('file:///D:/Music/local.mkv')
    expect(store.playing).toBe(true)
  })

  it('keeps Chromium playback for local WAV files outside Electron', async () => {
    const audioManager = createAudioManagerMock()
    const nativeAudioOutputPlayback = createNativeAudioOutputPlaybackMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => createPlatformAccessorMock(false),
        nativeAudioOutputPlayback
      },
      'player-native-audio-output-web-test'
    )
    const store = usePlayerStore()
    const song = createMockSong({
      id: 'local:web-wav',
      name: 'Web WAV',
      platform: 'local',
      url: 'https://music.test/local.wav',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\local.wav',
        localDurationKnown: true
      }
    })

    store.songList = [song]

    await store.playSongByIndex(0)

    expect(nativeAudioOutputPlayback.canPlay).not.toHaveBeenCalled()
    expect(nativeAudioOutputPlayback.play).not.toHaveBeenCalled()
    expect(audioManager.play).toHaveBeenCalledWith('https://music.test/local.wav')
    expect(store.playing).toBe(true)
  })
})
