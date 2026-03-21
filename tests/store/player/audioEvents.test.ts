import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInitialState } from '@/store/player/playerState'
import { AudioEventHandler, createAudioEventHandler } from '@/store/player/audioEvents'

const playerCoreMock = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  let currentTime = 0
  let duration = 0

  return {
    listeners,
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      const entries = listeners.get(event) ?? new Set<(...args: unknown[]) => void>()
      entries.add(callback)
      listeners.set(event, entries)
      return () => entries.delete(callback)
    }),
    off: vi.fn((event: string) => {
      listeners.delete(event)
    }),
    emit: (event: string, ...args: unknown[]) => {
      listeners.get(event)?.forEach(listener => listener(...args))
    },
    getCurrentTime: () => currentTime,
    setCurrentTime: (value: number) => {
      currentTime = value
    },
    getDuration: () => duration,
    setDuration: (value: number) => {
      duration = value
    }
  }
})

vi.mock('@/utils/player/core/playerCore', () => ({
  playerCore: {
    get currentTime() {
      return playerCoreMock.getCurrentTime()
    },
    get duration() {
      return playerCoreMock.getDuration()
    },
    on: playerCoreMock.on,
    off: playerCoreMock.off
  }
}))

describe('audioEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-17T00:00:00.000Z'))
    vi.clearAllMocks()
    playerCoreMock.listeners.clear()
    playerCoreMock.setCurrentTime(0)
    playerCoreMock.setDuration(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('registers audio listeners and throttles time updates', () => {
    const state = createInitialState()
    state.currentLyricIndex = 2
    state.playing = true
    state.progress = 9

    const callbacks = {
      onTimeUpdate: vi.fn(),
      onLoadedMetadata: vi.fn(),
      onEnded: vi.fn(),
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onError: vi.fn()
    }
    const platform = {
      isElectron: vi.fn(() => true),
      send: vi.fn()
    }

    const handler = createAudioEventHandler(state, callbacks, platform)
    handler.init({
      uiUpdateInterval: 250,
      ipcBroadcastInterval: 500,
      getCurrentLyricLine: () => ({ text: 'hello', trans: '你好', roma: 'ni hao' })
    })

    expect(playerCoreMock.on).toHaveBeenCalledTimes(6)

    playerCoreMock.setCurrentTime(12)
    vi.setSystemTime(new Date('2026-03-17T00:00:00.300Z'))
    playerCoreMock.emit('timeupdate')

    expect(callbacks.onTimeUpdate).toHaveBeenCalledWith(12)

    vi.setSystemTime(new Date('2026-03-17T00:00:00.400Z'))
    playerCoreMock.emit('timeupdate')
    expect(callbacks.onTimeUpdate).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date('2026-03-17T00:00:00.900Z'))
    playerCoreMock.emit('timeupdate')
    expect(platform.send).toHaveBeenCalledWith(
      'lyric-time-update',
      expect.objectContaining({
        time: 12,
        index: 2,
        text: 'hello',
        trans: '你好',
        roma: 'ni hao',
        playing: true
      })
    )
  })

  it('forwards metadata, ended, play, pause, and error events', () => {
    const state = createInitialState()
    const callbacks = {
      onTimeUpdate: vi.fn(),
      onLoadedMetadata: vi.fn(),
      onEnded: vi.fn(),
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onError: vi.fn()
    }
    const platform = {
      isElectron: vi.fn(() => true),
      send: vi.fn()
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const handler = new AudioEventHandler(state, callbacks, platform)
    handler.init({
      uiUpdateInterval: 250,
      ipcBroadcastInterval: 500,
      getCurrentLyricLine: () => ({ text: '', trans: '', roma: '' })
    })

    playerCoreMock.setDuration(245)
    playerCoreMock.emit('loadedmetadata')
    playerCoreMock.emit('ended')
    playerCoreMock.emit('play')
    playerCoreMock.emit('pause')
    playerCoreMock.emit('error', new Error('boom'))

    expect(callbacks.onLoadedMetadata).toHaveBeenCalledWith(245)
    expect(callbacks.onEnded).toHaveBeenCalled()
    expect(callbacks.onPlay).toHaveBeenCalled()
    expect(callbacks.onPause).toHaveBeenCalled()
    expect(callbacks.onError).toHaveBeenCalled()
    expect(platform.send).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('keeps progress and lyric updates moving while playback is active even without timeupdate events', () => {
    const state = createInitialState()
    state.currentLyricIndex = 1
    state.playing = true

    const callbacks = {
      onTimeUpdate: vi.fn(),
      onLoadedMetadata: vi.fn(),
      onEnded: vi.fn(),
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onError: vi.fn()
    }
    const platform = {
      isElectron: vi.fn(() => true),
      send: vi.fn()
    }

    const handler = createAudioEventHandler(state, callbacks, platform)
    handler.init({
      uiUpdateInterval: 250,
      ipcBroadcastInterval: 500,
      getCurrentLyricLine: () => ({ text: 'line', trans: '', roma: '' })
    })

    playerCoreMock.setCurrentTime(3)
    playerCoreMock.emit('play')

    expect(callbacks.onPlay).toHaveBeenCalledTimes(1)
    expect(callbacks.onTimeUpdate).toHaveBeenCalledWith(3)
    expect(platform.send).toHaveBeenCalledWith(
      'lyric-time-update',
      expect.objectContaining({
        time: 3,
        index: 1,
        text: 'line'
      })
    )

    callbacks.onTimeUpdate.mockClear()
    platform.send.mockClear()

    playerCoreMock.setCurrentTime(4)
    vi.advanceTimersByTime(260)
    expect(callbacks.onTimeUpdate).toHaveBeenCalledWith(4)

    playerCoreMock.setCurrentTime(5)
    vi.advanceTimersByTime(260)
    expect(platform.send).toHaveBeenCalledWith(
      'lyric-time-update',
      expect.objectContaining({
        time: 5,
        index: 1,
        text: 'line'
      })
    )

    callbacks.onTimeUpdate.mockClear()
    playerCoreMock.emit('pause')
    playerCoreMock.setCurrentTime(6)
    vi.advanceTimersByTime(600)
    expect(callbacks.onTimeUpdate).not.toHaveBeenCalled()
  })

  it('supports config and callback replacement, and guards reinit after dispose', () => {
    const state = createInitialState()
    const callbacks = {
      onTimeUpdate: vi.fn()
    }
    const handler = createAudioEventHandler(state, callbacks)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    handler.setTimeUpdateConfig({ uiUpdateInterval: 100 })
    handler.setCallbacks({ onPlay: vi.fn() })
    handler.init()
    handler.dispose()
    handler.dispose()

    expect(handler.disposed).toBe(true)
    expect(playerCoreMock.listeners.get('timeupdate')?.size ?? 0).toBe(0)
    expect(playerCoreMock.off).not.toHaveBeenCalled()

    handler.init()
    expect(warn).toHaveBeenCalled()
  })
})
