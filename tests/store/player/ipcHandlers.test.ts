import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createIpcHandlers, IpcEventHandler } from '@/store/player/ipcHandlers'
import { createInitialState } from '@/store/player/playerState'
import type { Song } from '@/platform/music/interface'

type Listener = (...args: unknown[]) => void

describe('ipcHandlers music-playing-control', () => {
  const listeners = new Map<string, Listener>()
  let unsubscribeCount = 0

  const state = createInitialState()
  const togglePlay = vi.fn()
  const play = vi.fn()
  const pause = vi.fn()
  const playPrev = vi.fn()
  const playNext = vi.fn()
  const playSong = vi.fn()
  const playSongById = vi.fn()
  const addToNext = vi.fn()
  const removeFromPlaylist = vi.fn()
  const clearPlaylist = vi.fn()
  const setPlayMode = vi.fn()
  const seek = vi.fn()
  const setVolume = vi.fn()
  const toggleMute = vi.fn()
  const toggleCompactMode = vi.fn()

  const platform = {
    isElectron: vi.fn(() => true),
    on: vi.fn((channel: string, callback: Listener) => {
      listeners.set(channel, callback)
      return () => {
        unsubscribeCount += 1
        listeners.delete(channel)
      }
    })
  }

  const createDeps = (overrides: Record<string, unknown> = {}) => ({
    getState: () => state,
    onStateChange: () => {},
    togglePlay,
    play,
    pause,
    playPrev,
    playNext,
    playSong,
    playSongById,
    addToNext,
    removeFromPlaylist,
    clearPlaylist,
    setPlayMode,
    seek,
    setVolume,
    toggleMute,
    toggleCompactMode,
    platform,
    ...overrides
  })

  beforeEach(() => {
    listeners.clear()
    unsubscribeCount = 0
    togglePlay.mockClear()
    play.mockClear()
    pause.mockClear()
    playPrev.mockClear()
    playNext.mockClear()
    playSong.mockClear()
    playSongById.mockClear()
    addToNext.mockClear()
    removeFromPlaylist.mockClear()
    clearPlaylist.mockClear()
    setPlayMode.mockClear()
    seek.mockClear()
    setVolume.mockClear()
    toggleMute.mockClear()
    toggleCompactMode.mockClear()
    platform.on.mockClear()
    platform.isElectron.mockClear()
    state.playing = false
    state.playMode = 0
    state.volume = 0.7
  })

  it('uses explicit play/pause handlers when command is provided', () => {
    const handlers = createIpcHandlers(createDeps())

    handlers.setup()

    const listener = listeners.get('music-playing-control')
    expect(listener).toBeTypeOf('function')

    listener?.('play')
    listener?.('pause')

    expect(play).toHaveBeenCalledTimes(1)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(togglePlay).toHaveBeenCalledTimes(0)
  })

  it('falls back to toggle only when state and explicit handlers require it', () => {
    const handlers = createIpcHandlers(
      createDeps({
        play: undefined,
        pause: undefined
      })
    )

    handlers.setup()

    const listener = listeners.get('music-playing-control')
    expect(listener).toBeTypeOf('function')

    state.playing = false
    listener?.('play')
    expect(togglePlay).toHaveBeenCalledTimes(1)

    state.playing = true
    listener?.('play')
    expect(togglePlay).toHaveBeenCalledTimes(1)

    state.playing = true
    listener?.('pause')
    expect(togglePlay).toHaveBeenCalledTimes(2)

    state.playing = false
    listener?.('pause')
    expect(togglePlay).toHaveBeenCalledTimes(2)
  })

  it('handles legacy toggle, mute, seek and volume commands on music-playing-control', () => {
    const handlers = createIpcHandlers(createDeps())

    handlers.setup()

    const listener = listeners.get('music-playing-control')
    expect(listener).toBeTypeOf('function')

    listener?.(undefined)
    listener?.('toggle')
    listener?.('toggle-mute')
    listener?.({ type: 'seek', time: 12 })
    listener?.({ type: 'volume', volume: 0.25 })

    expect(togglePlay).toHaveBeenCalledTimes(2)
    expect(toggleMute).toHaveBeenCalledTimes(1)
    expect(seek).toHaveBeenCalledTimes(1)
    expect(seek).toHaveBeenCalledWith(12)
    expect(setVolume).toHaveBeenCalledTimes(1)
    expect(setVolume).toHaveBeenCalledWith(0.25)
  })

  it('handles song, playmode, volume, compact and hide-player channels', () => {
    const handlers = createIpcHandlers(createDeps())
    const song = {
      id: 'song-1',
      name: 'Song 1',
      artists: [{ id: 'artist-1', name: 'Artist 1' }],
      album: { id: 'album-1', name: 'Album 1', picUrl: '' },
      duration: 180000,
      mvid: 0,
      platform: 'netease',
      originalId: 'song-1'
    } satisfies Song

    handlers.setup()

    listeners.get('music-song-control')?.('prev')
    listeners.get('music-song-control')?.('next')
    listeners.get('music-song-control')?.('noop')
    listeners.get('music-song-control')?.({ type: 'play-song', song, playlist: [song] })
    listeners.get('music-song-control')?.({
      type: 'play-song-by-id',
      id: 'song-2',
      platform: 'qq'
    })
    listeners.get('music-song-control')?.({ type: 'add-to-next', song })
    listeners.get('music-song-control')?.({ type: 'remove-from-playlist', index: 2 })
    listeners.get('music-song-control')?.({ type: 'clear-playlist' })

    state.playMode = 3
    listeners.get('music-playmode-control')?.('toggle')
    listeners.get('music-playmode-control')?.(2)

    state.volume = 0.95
    listeners.get('music-volume-up')?.()
    state.volume = 0.05
    listeners.get('music-volume-down')?.()

    listeners.get('music-process-control')?.('back')
    listeners.get('music-process-control')?.('forward')
    listeners.get('music-compact-mode-control')?.()
    listeners.get('hide-player')?.()

    expect(playPrev).toHaveBeenCalledTimes(1)
    expect(playNext).toHaveBeenCalledTimes(1)
    expect(playSong).toHaveBeenCalledWith(song, [song])
    expect(playSongById).toHaveBeenCalledWith('song-2', 'qq')
    expect(addToNext).toHaveBeenCalledWith(song)
    expect(removeFromPlaylist).toHaveBeenCalledWith(2)
    expect(clearPlaylist).toHaveBeenCalledTimes(1)
    expect(setPlayMode).toHaveBeenNthCalledWith(1, 0)
    expect(setPlayMode).toHaveBeenNthCalledWith(2, 2)
    expect(setVolume).toHaveBeenNthCalledWith(1, 1)
    expect(setVolume).toHaveBeenNthCalledWith(2, 0)
    expect(toggleCompactMode).toHaveBeenCalledTimes(2)
  })

  it('ignores invalid music-playmode-control payloads', () => {
    const handlers = createIpcHandlers(createDeps())

    handlers.setup()

    listeners.get('music-playmode-control')?.('invalid')
    listeners.get('music-playmode-control')?.(Number.NaN)
    listeners.get('music-playmode-control')?.(4)

    expect(setPlayMode).not.toHaveBeenCalled()
  })

  it('skips setup outside electron and tears down registered listeners', () => {
    const handlers = createIpcHandlers(
      createDeps({
        platform: {
          ...platform,
          isElectron: vi.fn(() => false)
        }
      })
    )

    handlers.setup()
    expect(listeners.size).toBe(0)

    const electronHandlers = createIpcHandlers(createDeps())
    electronHandlers.setup()

    expect(listeners.size).toBe(8)
    electronHandlers.teardown()

    expect(listeners.size).toBe(0)
    expect(unsubscribeCount).toBe(8)

    electronHandlers.teardown()
    expect(unsubscribeCount).toBe(8)
  })

  it('tears down previous listeners before repeated setup', () => {
    const handlers = createIpcHandlers(createDeps())

    handlers.setup()
    expect(unsubscribeCount).toBe(0)

    handlers.setup()

    expect(listeners.size).toBe(8)
    expect(unsubscribeCount).toBe(8)

    handlers.teardown()
    expect(unsubscribeCount).toBe(16)
  })

  it('refuses to init an event handler after it has been disposed', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const eventHandler = new IpcEventHandler(createDeps())

    eventHandler.dispose()
    eventHandler.init()

    expect(warnSpy).toHaveBeenCalledWith('[IpcEventHandler] Cannot init after dispose')
    expect(listeners.size).toBe(0)
  })
})
