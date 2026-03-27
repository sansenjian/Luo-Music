import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const audioEventHandlerMocks = vi.hoisted(() => {
  const instances: Array<{
    init: ReturnType<typeof vi.fn>
    setCallbacks: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }> = []

  return {
    instances,
    factory: vi.fn(() => {
      const instance = {
        init: vi.fn(),
        setCallbacks: vi.fn(),
        dispose: vi.fn()
      }
      instances.push(instance)
      return instance
    })
  }
})

const ipcHandlerMocks = vi.hoisted(() => {
  const instances: Array<{
    setup: ReturnType<typeof vi.fn>
    teardown: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }> = []

  return {
    instances,
    factory: vi.fn(() => {
      const teardown = vi.fn()
      const instance = {
        setup: vi.fn(),
        teardown,
        dispose: vi.fn(() => teardown())
      }
      instances.push(instance)
      return instance
    })
  }
})

const platformAccessorMocks = vi.hoisted(() => ({
  isElectron: vi.fn(() => true),
  send: vi.fn(),
  sendPlayingState: vi.fn(),
  sendPlayModeChange: vi.fn(),
  on: vi.fn(() => () => {})
}))

const playerCoreMocks = vi.hoisted(() => ({
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  toggle: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
  getMuted: vi.fn(() => false)
}))

vi.mock('@/store/player/audioEvents', () => ({
  createAudioEventHandler: audioEventHandlerMocks.factory
}))

vi.mock('@/store/player/ipcHandlers', () => ({
  createIpcHandlers: ipcHandlerMocks.factory
}))

vi.mock('@/services/platformAccessor', () => ({
  getPlatformAccessor: () => platformAccessorMocks
}))

vi.mock('@/utils/player/core/playerCore', () => ({
  playerCore: playerCoreMocks
}))

describe('playerStore lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    audioEventHandlerMocks.instances.length = 0
    ipcHandlerMocks.instances.length = 0
    platformAccessorMocks.isElectron.mockReturnValue(true)
    platformAccessorMocks.on.mockReturnValue(() => {})
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('recreates runtime handlers after cleanup and tears them down on dispose', async () => {
    const { usePlayerStore } = await import('@/store/playerStore')

    const store = usePlayerStore()
    store.initAudio()

    expect(audioEventHandlerMocks.factory).toHaveBeenCalledTimes(1)
    expect(ipcHandlerMocks.factory).toHaveBeenCalledTimes(1)

    const firstAudioHandler = audioEventHandlerMocks.instances[0]
    const firstIpcHandler = ipcHandlerMocks.instances[0]

    store.clearPlaylist()

    expect(firstAudioHandler.dispose).toHaveBeenCalledTimes(1)
    expect(firstIpcHandler.dispose).toHaveBeenCalledTimes(1)
    expect(firstIpcHandler.teardown).toHaveBeenCalledTimes(1)
    expect(store.initialized).toBe(false)
    expect(store.ipcInitialized).toBe(false)

    store.initAudio()

    expect(audioEventHandlerMocks.factory).toHaveBeenCalledTimes(2)
    expect(ipcHandlerMocks.factory).toHaveBeenCalledTimes(2)

    const secondAudioHandler = audioEventHandlerMocks.instances[1]
    const secondIpcHandler = ipcHandlerMocks.instances[1]

    store.$dispose()

    expect(secondAudioHandler.dispose).toHaveBeenCalledTimes(1)
    expect(secondIpcHandler.dispose).toHaveBeenCalledTimes(1)
    expect(secondIpcHandler.teardown).toHaveBeenCalledTimes(1)
  })

  it('syncs current lyric index and desktop lyric payload immediately after seek', async () => {
    const { usePlayerStore } = await import('@/store/playerStore')

    const store = usePlayerStore()
    store.initAudio()
    store.playing = true
    store.setLyricsArray([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: 'Second', roma: '' },
      { time: 10, text: 'Line 3', trans: '', roma: 'san' }
    ])

    platformAccessorMocks.send.mockClear()

    store.seek(10)

    expect(playerCoreMocks.seek).toHaveBeenCalledWith(10)
    expect(store.currentLyricIndex).toBe(2)
    expect(platformAccessorMocks.send).toHaveBeenCalledWith(
      'lyric-time-update',
      expect.objectContaining({
        time: 10,
        index: 2,
        text: 'Line 3',
        roma: 'san',
        playing: true,
        cause: 'seek'
      })
    )
  })

  it('syncs loaded lyrics against current progress and clears desktop lyric payload on reset', async () => {
    const { usePlayerStore } = await import('@/store/playerStore')

    const store = usePlayerStore()
    store.initAudio()
    store.playing = true
    store.progress = 6

    store.setLyricsArray([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: 'Second', roma: '' },
      { time: 10, text: 'Line 3', trans: '', roma: '' }
    ])

    expect(store.currentLyricIndex).toBe(1)
    expect(platformAccessorMocks.send).toHaveBeenCalledWith(
      'lyric-time-update',
      expect.objectContaining({
        time: 6,
        index: 1,
        text: 'Line 2',
        trans: 'Second',
        playing: true,
        cause: 'lyrics-load'
      })
    )

    platformAccessorMocks.send.mockClear()

    store.clearPlaylist()

    expect(platformAccessorMocks.send).toHaveBeenCalledWith('lyric-time-update', {
      time: 0,
      index: -1,
      text: '',
      trans: '',
      roma: '',
      playing: false,
      songId: null,
      platform: null,
      sequence: 2,
      cause: 'reset'
    })
  })

  it('emits clone-safe player snapshot payloads during playback sync', async () => {
    const { usePlayerStore } = await import('@/store/playerStore')

    platformAccessorMocks.send.mockImplementation((_channel: string, payload: unknown) => {
      structuredClone(payload)
    })

    const store = usePlayerStore()
    store.initAudio()

    expect(() => {
      store.setSongList([
        {
          id: 1,
          name: 'Clone Safe Song',
          artists: [{ id: 1, name: 'Artist' }],
          album: { id: 1, name: 'Album', picUrl: '' },
          duration: 180000,
          mvid: 0,
          platform: 'netease',
          originalId: 1,
          extra: {
            // Functions are not IPC-cloneable and should be removed before sync.
            resolver: () => 'non-cloneable'
          }
        }
      ])
    }).not.toThrow()
  })

  it('throttles full player snapshot sync for rapid progress updates', async () => {
    vi.useFakeTimers()
    const { usePlayerStore } = await import('@/store/playerStore')

    const store = usePlayerStore()
    store.initAudio()
    platformAccessorMocks.send.mockClear()

    store.progress = 1
    await Promise.resolve()
    store.progress = 2
    await Promise.resolve()
    store.progress = 3
    await Promise.resolve()

    expect(platformAccessorMocks.send).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(500)
    await Promise.resolve()

    expect(platformAccessorMocks.send).toHaveBeenCalledTimes(2)
  })
})
