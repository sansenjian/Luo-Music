import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPlayerStore } from '@/store/playerStore'
import type {
  NativeAudioOutputPlaybackController,
  NativeAudioOutputPlaybackRequest
} from '@/store/player/nativeAudioOutputPlayback'
import { createMockSong } from '../utils/test-utils'

const createAudioManagerMock = () => ({
  play: vi.fn(),
  pause: vi.fn(),
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
  on: vi.fn(() => () => {})
})

function createNativeAudioOutputPlaybackMock(): NativeAudioOutputPlaybackController & {
  triggerEnded: () => void
  triggerError: () => void
} {
  const endedListeners = new Set<() => void>()
  const errorListeners = new Set<() => void>()
  const supportedExtensions = ['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav']
  const controller = {
    canPlay: vi.fn((request: NativeAudioOutputPlaybackRequest) => {
      const extra = request.song.extra as Record<string, unknown> | undefined
      const localFilePath = extra?.localFilePath
      return (
        extra?.localSource === true &&
        typeof localFilePath === 'string' &&
        supportedExtensions.some(extension => localFilePath.toLowerCase().endsWith(extension))
      )
    }),
    play: vi.fn(async () => true),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    setVolume: vi.fn(async () => {}),
    onEnded: vi.fn((listener: () => void) => {
      endedListeners.add(listener)
      return () => {
        endedListeners.delete(listener)
      }
    }),
    onError: vi.fn((listener: () => void) => {
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
    triggerError: () => {
      for (const listener of errorListeners) {
        listener()
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
    expect(audioManager.pause).toHaveBeenCalled()
    expect(store.currentSong).toStrictEqual(song)
    expect(store.currentIndex).toBe(0)
    expect(store.duration).toBe(240)
    expect(store.playing).toBe(true)
    expect(platformAccessor.sendPlayingState).toHaveBeenCalledWith(true)
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
      id: 'local:ape',
      name: 'Local APE',
      platform: 'local',
      url: 'file:///D:/Music/local.ape',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\local.ape',
        localDurationKnown: true
      }
    })

    store.songList = [song]

    await store.playSongByIndex(0)

    expect(nativeAudioOutputPlayback.canPlay).toHaveBeenCalled()
    expect(nativeAudioOutputPlayback.play).not.toHaveBeenCalled()
    expect(audioManager.play).toHaveBeenCalledWith('file:///D:/Music/local.ape')
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
