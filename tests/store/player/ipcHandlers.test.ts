import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createIpcHandlers } from '../../../src/store/player/ipcHandlers'
import { createInitialState } from '../../../src/store/player/playerState'

type Listener = (...args: unknown[]) => void

describe('ipcHandlers music-playing-control', () => {
  const listeners = new Map<string, Listener>()

  const state = createInitialState()
  const togglePlay = vi.fn()
  const play = vi.fn()
  const pause = vi.fn()
  const playPrev = vi.fn()
  const playNext = vi.fn()
  const setPlayMode = vi.fn()
  const setVolume = vi.fn()
  const toggleCompactMode = vi.fn()

  const platform = {
    isElectron: vi.fn(() => true),
    on: vi.fn((channel: string, callback: Listener) => {
      listeners.set(channel, callback)
      return () => {
        listeners.delete(channel)
      }
    })
  }

  beforeEach(() => {
    listeners.clear()
    togglePlay.mockClear()
    play.mockClear()
    pause.mockClear()
    playPrev.mockClear()
    playNext.mockClear()
    setPlayMode.mockClear()
    setVolume.mockClear()
    toggleCompactMode.mockClear()
    platform.on.mockClear()
    platform.isElectron.mockClear()
    state.playing = false
  })

  it('uses explicit play/pause handlers when command is provided', () => {
    const handlers = createIpcHandlers({
      getState: () => state,
      onStateChange: () => {},
      togglePlay,
      play,
      pause,
      playPrev,
      playNext,
      setPlayMode,
      setVolume,
      toggleCompactMode,
      platform
    })

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
    const handlers = createIpcHandlers({
      getState: () => state,
      onStateChange: () => {},
      togglePlay,
      playPrev,
      playNext,
      setPlayMode,
      setVolume,
      toggleCompactMode,
      platform
    })

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
})
