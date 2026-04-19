import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'

import { useMediaSession } from '@/composables/useMediaSession'
import { CoverCacheManager } from '@/utils/cache/coverCache'
import { mountComposable } from '../helpers/mountComposable'
import { createMockSong } from '../utils/test-utils'

type MediaSessionHandlerMap = Partial<
  Record<
    MediaSessionAction,
    ((details?: { seekTime?: number; seekOffset?: number }) => void) | null
  >
>

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

function createMediaSessionMock() {
  const handlers: MediaSessionHandlerMap = {}

  return {
    handlers,
    mediaSession: {
      metadata: null as MediaMetadataInit | null,
      playbackState: 'none' as MediaSessionPlaybackState,
      setActionHandler: vi.fn(
        (action: MediaSessionAction, handler: MediaSessionHandlerMap[MediaSessionAction]) => {
          handlers[action] = handler ?? null
        }
      ),
      setPositionState: vi.fn()
    }
  }
}

function createPlayerStoreMock() {
  return reactive({
    currentSong: null as ReturnType<typeof createMockSong> | null,
    playing: false,
    progress: 0,
    duration: 0,
    seek: vi.fn(),
    playNext: vi.fn(),
    playPrev: vi.fn()
  })
}

describe('useMediaSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    CoverCacheManager.clear()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('syncs metadata, playback state, and position immediately when enabled', async () => {
    const playerStore = createPlayerStoreMock()
    playerStore.currentSong = createMockSong({
      id: 'song-1',
      name: 'Track 1',
      artists: [{ id: 1, name: 'Artist 1' }],
      album: { id: 1, name: 'Album 1', picUrl: 'https://cdn.example.com/cover.jpg' }
    })
    playerStore.playing = true
    playerStore.progress = 42
    playerStore.duration = 180

    const { mediaSession } = createMediaSessionMock()

    const { wrapper } = mountComposable(() =>
      useMediaSession({
        enabled: () => true,
        playerStore,
        playerService: {
          play: vi.fn(),
          pause: vi.fn()
        },
        platformService: {
          isElectron: () => true,
          getLocalLibraryCover: vi.fn()
        },
        getMediaSession: () => mediaSession,
        createMetadata: init => init
      })
    )

    await flushPromises()

    expect(mediaSession.metadata).toEqual({
      title: 'Track 1',
      artist: 'Artist 1',
      album: 'Album 1',
      artwork: [
        {
          src: 'https://cdn.example.com/cover.jpg',
          sizes: '300x300',
          type: 'image/jpeg'
        }
      ]
    })
    expect(mediaSession.playbackState).toBe('playing')
    expect(mediaSession.setPositionState).toHaveBeenCalledWith({
      duration: 180,
      playbackRate: 1,
      position: 42
    })

    vi.advanceTimersByTime(1000)

    expect(mediaSession.setPositionState).toHaveBeenLastCalledWith({
      duration: 180,
      playbackRate: 1,
      position: 42
    })

    wrapper.unmount()
  })

  it('cleans up on disable and restores the current playback state immediately on re-enable', async () => {
    const enabled = ref(true)
    const playerStore = createPlayerStoreMock()
    playerStore.currentSong = createMockSong({
      id: 'song-1',
      name: 'Track 1',
      artists: [{ id: 1, name: 'Artist 1' }],
      album: { id: 1, name: 'Album 1', picUrl: 'https://cdn.example.com/cover.jpg' }
    })
    playerStore.playing = true
    playerStore.progress = 42
    playerStore.duration = 180

    const { mediaSession, handlers } = createMediaSessionMock()

    const { wrapper } = mountComposable(() =>
      useMediaSession({
        enabled: () => enabled.value,
        playerStore,
        playerService: {
          play: vi.fn(),
          pause: vi.fn()
        },
        platformService: {
          isElectron: () => true,
          getLocalLibraryCover: vi.fn()
        },
        getMediaSession: () => mediaSession,
        createMetadata: init => init
      })
    )

    await flushPromises()

    enabled.value = false
    await nextTick()
    await flushPromises()

    expect(mediaSession.metadata).toBeNull()
    expect(mediaSession.playbackState).toBe('none')
    expect(handlers.play).toBeNull()
    expect(handlers.pause).toBeNull()
    expect(handlers.nexttrack).toBeNull()
    expect(handlers.previoustrack).toBeNull()
    expect(handlers.seekto).toBeNull()
    expect(handlers.seekforward).toBeNull()
    expect(handlers.seekbackward).toBeNull()

    const positionCallCount = vi.mocked(mediaSession.setPositionState).mock.calls.length

    vi.advanceTimersByTime(1000)

    expect(mediaSession.setPositionState).toHaveBeenCalledTimes(positionCallCount)

    enabled.value = true
    await nextTick()
    await flushPromises()

    expect(mediaSession.metadata).toMatchObject({
      title: 'Track 1',
      artwork: [
        expect.objectContaining({
          src: 'https://cdn.example.com/cover.jpg'
        })
      ]
    })
    expect(mediaSession.playbackState).toBe('playing')
    expect(mediaSession.setPositionState).toHaveBeenLastCalledWith({
      duration: 180,
      playbackRate: 1,
      position: 42
    })
    expect(handlers.play).toEqual(expect.any(Function))
    expect(handlers.pause).toEqual(expect.any(Function))

    wrapper.unmount()
  })

  it('resolves local cover hashes through the cover cache as data urls', async () => {
    const playerStore = createPlayerStoreMock()
    playerStore.currentSong = createMockSong({
      id: 'local:1',
      platform: 'local',
      album: { id: 1, name: 'Local Album', picUrl: '' },
      extra: {
        localSource: true,
        localCoverHash: 'cover-hash'
      }
    })

    const getLocalLibraryCover = vi.fn().mockResolvedValue('ZmFrZQ==')
    const { mediaSession } = createMediaSessionMock()

    const { wrapper } = mountComposable(() =>
      useMediaSession({
        enabled: () => true,
        playerStore,
        playerService: {
          play: vi.fn(),
          pause: vi.fn()
        },
        platformService: {
          isElectron: () => true,
          getLocalLibraryCover
        },
        getMediaSession: () => mediaSession,
        createMetadata: init => init
      })
    )

    await flushPromises()

    expect(getLocalLibraryCover).toHaveBeenCalledWith('cover-hash')
    expect(mediaSession.metadata).toMatchObject({
      artwork: [
        expect.objectContaining({
          src: 'data:image/jpeg;base64,ZmFrZQ=='
        })
      ]
    })
    expect(CoverCacheManager.get('cover-hash')).toBe('data:image/jpeg;base64,ZmFrZQ==')

    wrapper.unmount()
  })

  it('ignores stale local cover requests when the current song changes', async () => {
    const firstCover = createDeferred<string | null>()
    const secondCover = createDeferred<string | null>()
    const playerStore = createPlayerStoreMock()
    playerStore.currentSong = createMockSong({
      id: 'local:1',
      name: 'Track 1',
      platform: 'local',
      album: { id: 1, name: 'Album 1', picUrl: '' },
      extra: {
        localSource: true,
        localCoverHash: 'cover-1'
      }
    })

    const getLocalLibraryCover = vi.fn((hash: string) => {
      if (hash === 'cover-1') {
        return firstCover.promise
      }

      if (hash === 'cover-2') {
        return secondCover.promise
      }

      return Promise.resolve(null)
    })

    const { mediaSession } = createMediaSessionMock()

    const { wrapper } = mountComposable(() =>
      useMediaSession({
        enabled: () => true,
        playerStore,
        playerService: {
          play: vi.fn(),
          pause: vi.fn()
        },
        platformService: {
          isElectron: () => true,
          getLocalLibraryCover
        },
        getMediaSession: () => mediaSession,
        createMetadata: init => init
      })
    )

    await nextTick()

    playerStore.currentSong = createMockSong({
      id: 'local:2',
      name: 'Track 2',
      artists: [{ id: 2, name: 'Artist 2' }],
      platform: 'local',
      album: { id: 2, name: 'Album 2', picUrl: '' },
      extra: {
        localSource: true,
        localCoverHash: 'cover-2'
      }
    })

    await nextTick()

    secondCover.resolve('c2')
    await flushPromises()

    expect(mediaSession.metadata).toMatchObject({
      title: 'Track 2',
      artwork: [
        expect.objectContaining({
          src: 'data:image/jpeg;base64,c2'
        })
      ]
    })

    firstCover.resolve('c1')
    await flushPromises()

    expect(mediaSession.metadata).toMatchObject({
      title: 'Track 2',
      artwork: [
        expect.objectContaining({
          src: 'data:image/jpeg;base64,c2'
        })
      ]
    })

    wrapper.unmount()
  })

  it('binds media actions to player controls', async () => {
    const playerStore = createPlayerStoreMock()
    playerStore.currentSong = createMockSong({ id: 'song-1' })
    playerStore.progress = 12
    playerStore.duration = 180

    const play = vi.fn().mockResolvedValue(undefined)
    const pause = vi.fn().mockResolvedValue(undefined)
    const { mediaSession, handlers } = createMediaSessionMock()

    const { wrapper } = mountComposable(() =>
      useMediaSession({
        enabled: () => true,
        playerStore,
        playerService: {
          play,
          pause
        },
        platformService: {
          isElectron: () => true,
          getLocalLibraryCover: vi.fn()
        },
        getMediaSession: () => mediaSession,
        createMetadata: init => init
      })
    )

    await flushPromises()

    handlers.play?.()
    handlers.pause?.()
    handlers.nexttrack?.()
    handlers.previoustrack?.()
    handlers.seekto?.({ seekTime: 90 })
    handlers.seekforward?.()
    handlers.seekforward?.({ seekOffset: 15 })
    handlers.seekbackward?.()
    handlers.seekbackward?.({ seekOffset: 7 })

    await flushPromises()

    expect(play).toHaveBeenCalledTimes(1)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(playerStore.playNext).toHaveBeenCalledTimes(1)
    expect(playerStore.playPrev).toHaveBeenCalledTimes(1)
    expect(playerStore.seek).toHaveBeenNthCalledWith(1, 90)
    expect(playerStore.seek).toHaveBeenNthCalledWith(2, 17)
    expect(playerStore.seek).toHaveBeenNthCalledWith(3, 27)
    expect(playerStore.seek).toHaveBeenNthCalledWith(4, 7)
    expect(playerStore.seek).toHaveBeenNthCalledWith(5, 5)

    wrapper.unmount()
  })

  it('does not rebuild the position timer or sync position immediately for small playback progress changes', async () => {
    const playerStore = createPlayerStoreMock()
    playerStore.currentSong = createMockSong({
      id: 'song-progress',
      name: 'Track Progress',
      artists: [{ id: 1, name: 'Artist 1' }],
      album: { id: 1, name: 'Album 1', picUrl: 'https://cdn.example.com/cover.jpg' }
    })
    playerStore.playing = true
    playerStore.progress = 12
    playerStore.duration = 180

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { mediaSession } = createMediaSessionMock()

    const { wrapper } = mountComposable(() =>
      useMediaSession({
        enabled: () => true,
        playerStore,
        playerService: {
          play: vi.fn(),
          pause: vi.fn()
        },
        platformService: {
          isElectron: () => true,
          getLocalLibraryCover: vi.fn()
        },
        getMediaSession: () => mediaSession,
        createMetadata: init => init
      })
    )

    await flushPromises()

    const initialSetIntervalCalls = setIntervalSpy.mock.calls.length
    const initialClearIntervalCalls = clearIntervalSpy.mock.calls.length
    const initialPositionCallCount = vi.mocked(mediaSession.setPositionState).mock.calls.length

    playerStore.progress = 12.4
    await nextTick()

    expect(mediaSession.setPositionState).toHaveBeenCalledTimes(initialPositionCallCount)
    expect(setIntervalSpy).toHaveBeenCalledTimes(initialSetIntervalCalls)
    expect(clearIntervalSpy).toHaveBeenCalledTimes(initialClearIntervalCalls)

    vi.advanceTimersByTime(1000)

    expect(mediaSession.setPositionState).toHaveBeenLastCalledWith({
      duration: 180,
      playbackRate: 1,
      position: 12.4
    })

    wrapper.unmount()
    setIntervalSpy.mockRestore()
    clearIntervalSpy.mockRestore()
  })

  it('syncs position immediately for seek-like progress jumps during playback', async () => {
    const playerStore = createPlayerStoreMock()
    playerStore.currentSong = createMockSong({
      id: 'song-seek',
      name: 'Track Seek',
      artists: [{ id: 1, name: 'Artist 1' }],
      album: { id: 1, name: 'Album 1', picUrl: 'https://cdn.example.com/cover.jpg' }
    })
    playerStore.playing = true
    playerStore.progress = 12
    playerStore.duration = 180

    const { mediaSession } = createMediaSessionMock()

    const { wrapper } = mountComposable(() =>
      useMediaSession({
        enabled: () => true,
        playerStore,
        playerService: {
          play: vi.fn(),
          pause: vi.fn()
        },
        platformService: {
          isElectron: () => true,
          getLocalLibraryCover: vi.fn()
        },
        getMediaSession: () => mediaSession,
        createMetadata: init => init
      })
    )

    await flushPromises()

    const initialPositionCallCount = vi.mocked(mediaSession.setPositionState).mock.calls.length

    playerStore.progress = 48
    await nextTick()

    expect(mediaSession.setPositionState).toHaveBeenCalledTimes(initialPositionCallCount + 1)
    expect(mediaSession.setPositionState).toHaveBeenLastCalledWith({
      duration: 180,
      playbackRate: 1,
      position: 48
    })

    wrapper.unmount()
  })

  it('keeps SMTC active when unsupported media actions throw during setup', async () => {
    const enabled = ref(true)
    const playerStore = createPlayerStoreMock()
    playerStore.currentSong = createMockSong({
      id: 'song-unsupported',
      name: 'Track Unsupported',
      artists: [{ id: 1, name: 'Artist 1' }],
      album: { id: 1, name: 'Album 1', picUrl: 'https://cdn.example.com/cover.jpg' }
    })
    playerStore.playing = true
    playerStore.progress = 24
    playerStore.duration = 180

    const { mediaSession, handlers } = createMediaSessionMock()
    const originalSetActionHandler = mediaSession.setActionHandler
    mediaSession.setActionHandler = vi.fn(
      (action: MediaSessionAction, handler: MediaSessionHandlerMap[MediaSessionAction]) => {
        if (action === 'seekforward') {
          throw new DOMException('Action is not supported', 'NotSupportedError')
        }

        originalSetActionHandler(action, handler)
      }
    )

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { wrapper } = mountComposable(() =>
      useMediaSession({
        enabled: () => enabled.value,
        playerStore,
        playerService: {
          play: vi.fn(),
          pause: vi.fn()
        },
        platformService: {
          isElectron: () => true,
          getLocalLibraryCover: vi.fn()
        },
        getMediaSession: () => mediaSession,
        createMetadata: init => init
      })
    )

    await flushPromises()

    expect(mediaSession.metadata).toMatchObject({
      title: 'Track Unsupported'
    })
    expect(mediaSession.playbackState).toBe('playing')
    expect(handlers.play).toEqual(expect.any(Function))
    expect(handlers.pause).toEqual(expect.any(Function))
    expect(handlers.nexttrack).toEqual(expect.any(Function))
    expect(handlers.seekforward).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      '[MediaSession] Failed to set media action handler',
      'seekforward',
      expect.any(DOMException)
    )

    enabled.value = false
    await nextTick()
    await flushPromises()

    expect(mediaSession.metadata).toBeNull()
    expect(mediaSession.playbackState).toBe('none')
    expect(handlers.play).toBeNull()
    expect(handlers.pause).toBeNull()

    wrapper.unmount()
    warnSpy.mockRestore()
  })

  it('re-syncs metadata and playback state when playback resumes after a song transition', async () => {
    const playerStore = createPlayerStoreMock()
    playerStore.currentSong = createMockSong({
      id: 'song-1',
      name: 'Track 1',
      artists: [{ id: 1, name: 'Artist 1' }],
      album: { id: 1, name: 'Album 1', picUrl: 'https://cdn.example.com/cover.jpg' }
    })
    playerStore.playing = true
    playerStore.progress = 10
    playerStore.duration = 200

    const { mediaSession } = createMediaSessionMock()

    const { wrapper } = mountComposable(() =>
      useMediaSession({
        enabled: () => true,
        playerStore,
        playerService: {
          play: vi.fn(),
          pause: vi.fn()
        },
        platformService: {
          isElectron: () => true,
          getLocalLibraryCover: vi.fn()
        },
        getMediaSession: () => mediaSession,
        createMetadata: init => init
      })
    )

    await flushPromises()

    // Simulate a song transition: song changes, playback pauses briefly, then resumes
    playerStore.currentSong = createMockSong({
      id: 'song-2',
      name: 'Track 2',
      artists: [{ id: 2, name: 'Artist 2' }],
      album: { id: 2, name: 'Album 2', picUrl: 'https://cdn.example.com/cover2.jpg' }
    })
    playerStore.playing = false
    playerStore.progress = 0

    await nextTick()
    await flushPromises()

    expect(mediaSession.playbackState).toBe('paused')

    // Now simulate audio actually starting — playing goes true
    playerStore.playing = true
    playerStore.progress = 5

    await nextTick()
    await flushPromises()

    // SMTC should now show the new song metadata and playing state
    expect(mediaSession.metadata).toMatchObject({
      title: 'Track 2',
      artist: 'Artist 2'
    })
    expect(mediaSession.playbackState).toBe('playing')

    wrapper.unmount()
  })

  it('does not let a stale cover from the previous song overwrite the current cover during resync', async () => {
    const firstCover = createDeferred<string | null>()
    const secondCover = createDeferred<string | null>()
    const playerStore = createPlayerStoreMock()
    playerStore.currentSong = createMockSong({
      id: 'local:1',
      name: 'Track 1',
      platform: 'local',
      album: { id: 1, name: 'Album 1', picUrl: '' },
      extra: { localSource: true, localCoverHash: 'cover-1' }
    })
    playerStore.playing = true
    playerStore.duration = 200

    const getLocalLibraryCover = vi.fn((hash: string) => {
      if (hash === 'cover-1') return firstCover.promise
      if (hash === 'cover-2') return secondCover.promise
      return Promise.resolve(null)
    })

    const { mediaSession } = createMediaSessionMock()

    const { wrapper } = mountComposable(() =>
      useMediaSession({
        enabled: () => true,
        playerStore,
        playerService: { play: vi.fn(), pause: vi.fn() },
        platformService: { isElectron: () => true, getLocalLibraryCover },
        getMediaSession: () => mediaSession,
        createMetadata: init => init
      })
    )

    await nextTick()

    // Song switches → first cover still pending
    playerStore.currentSong = createMockSong({
      id: 'local:2',
      name: 'Track 2',
      artists: [{ id: 2, name: 'Artist 2' }],
      platform: 'local',
      album: { id: 2, name: 'Album 2', picUrl: '' },
      extra: { localSource: true, localCoverHash: 'cover-2' }
    })
    playerStore.playing = false

    await nextTick()

    // Playback resumes → resync fires, invalidating the song-1 request
    playerStore.playing = true
    await nextTick()

    // Second cover resolves first
    secondCover.resolve('c2')
    await flushPromises()

    expect(mediaSession.metadata).toMatchObject({
      title: 'Track 2',
      artwork: [{ src: 'data:image/jpeg;base64,c2' }]
    })

    // First (stale) cover resolves now — must NOT overwrite
    firstCover.resolve('c1-stale')
    await flushPromises()

    expect(mediaSession.metadata).toMatchObject({
      title: 'Track 2',
      artwork: [{ src: 'data:image/jpeg;base64,c2' }]
    })

    wrapper.unmount()
  })
})
