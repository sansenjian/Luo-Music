import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInitialState } from '@/store/player/playerState'
import { AudioEventHandler, createAudioEventHandler } from '@/store/player/audioEvents'
import { TEST_BASE_DATE, TIME_OFFSETS, getTestDate } from '../../utils/testConstants'

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
    vi.setSystemTime(TEST_BASE_DATE)
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

    expect(playerCoreMock.on).toHaveBeenCalledTimes(7)

    playerCoreMock.setCurrentTime(12)
    vi.setSystemTime(getTestDate(TIME_OFFSETS.MS_300))
    playerCoreMock.emit('timeupdate')

    expect(callbacks.onTimeUpdate).toHaveBeenCalledWith(12)

    vi.setSystemTime(getTestDate(TIME_OFFSETS.MS_400))
    playerCoreMock.emit('timeupdate')
    expect(callbacks.onTimeUpdate).toHaveBeenCalledTimes(1)

    vi.setSystemTime(getTestDate(TIME_OFFSETS.MS_900))
    playerCoreMock.emit('timeupdate')
    expect(platform.send).toHaveBeenCalledWith(
      'lyric-time-update',
      expect.objectContaining({
        time: 12,
        index: 2,
        text: 'hello',
        trans: '你好',
        roma: 'ni hao',
        playing: true,
        cause: 'interval'
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

    // 使用返回变化内容的 mock 来触发差量检查
    let callCount = 0
    const handler = new AudioEventHandler(state, callbacks, platform)
    handler.init({
      uiUpdateInterval: 250,
      ipcBroadcastInterval: 500,
      getCurrentLyricLine: () => {
        callCount++
        return { text: `line${callCount}`, trans: '', roma: '' }
      }
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
    // 差量检查：play 和 pause 时各发送一次（歌词内容变化），error 不触发歌词更新
    expect(platform.send).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('re-broadcasts lyric updates when play state changes on the same lyric line', () => {
    const state = createInitialState()
    state.currentLyricIndex = 3
    state.playing = true

    const callbacks = {
      onPlay: vi.fn(() => {
        state.playing = true
      }),
      onPause: vi.fn(() => {
        state.playing = false
      })
    }
    const platform = {
      isElectron: vi.fn(() => true),
      send: vi.fn()
    }

    const handler = createAudioEventHandler(state, callbacks, platform)
    handler.init({
      uiUpdateInterval: 250,
      ipcBroadcastInterval: 500,
      getCurrentLyricLine: () => ({ text: 'same line', trans: '', roma: '' })
    })

    playerCoreMock.setCurrentTime(18)
    playerCoreMock.emit('pause')
    expect(platform.send).toHaveBeenLastCalledWith(
      'lyric-time-update',
      expect.objectContaining({
        index: 3,
        text: 'same line',
        playing: false,
        cause: 'play-state'
      })
    )

    platform.send.mockClear()
    playerCoreMock.emit('play')

    expect(platform.send).toHaveBeenCalledTimes(1)
    expect(platform.send).toHaveBeenCalledWith(
      'lyric-time-update',
      expect.objectContaining({
        index: 3,
        text: 'same line',
        playing: true,
        cause: 'play-state'
      })
    )
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

    // 使用返回变化内容的 mock 来触发差量检查
    let currentTime = 0
    const handler = createAudioEventHandler(state, callbacks, platform)
    handler.init({
      uiUpdateInterval: 250,
      ipcBroadcastInterval: 500,
      getCurrentLyricLine: () => ({ text: `line${currentTime}`, trans: '', roma: '' })
    })

    currentTime = 3
    playerCoreMock.setCurrentTime(currentTime)
    playerCoreMock.emit('play')

    expect(callbacks.onPlay).toHaveBeenCalledTimes(1)
    expect(callbacks.onTimeUpdate).toHaveBeenCalledWith(currentTime)
    expect(platform.send).toHaveBeenCalledWith(
      'lyric-time-update',
      expect.objectContaining({
        time: currentTime,
        index: 1,
        text: `line${currentTime}`,
        cause: 'play-state'
      })
    )

    callbacks.onTimeUpdate.mockClear()
    platform.send.mockClear()

    currentTime = 4
    playerCoreMock.setCurrentTime(currentTime)
    vi.advanceTimersByTime(260)
    expect(callbacks.onTimeUpdate).toHaveBeenCalledWith(currentTime)

    currentTime = 5
    playerCoreMock.setCurrentTime(currentTime)
    vi.advanceTimersByTime(260)
    expect(platform.send).toHaveBeenCalledWith(
      'lyric-time-update',
      expect.objectContaining({
        time: currentTime,
        index: 1,
        text: `line${currentTime}`,
        cause: 'interval'
      })
    )

    callbacks.onTimeUpdate.mockClear()
    playerCoreMock.emit('pause')
    playerCoreMock.setCurrentTime(6)
    vi.advanceTimersByTime(600)
    expect(callbacks.onTimeUpdate).not.toHaveBeenCalled()
  })

  it('does not call unref when the renderer timer handle is numeric', () => {
    const state = createInitialState()
    state.playing = true

    const callbacks = {
      onPlay: vi.fn()
    }
    const platform = {
      isElectron: vi.fn(() => true),
      send: vi.fn()
    }

    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation(((_callback: TimerHandler, _delay?: number) => 1) as typeof setInterval)
    const clearIntervalSpy = vi
      .spyOn(globalThis, 'clearInterval')
      .mockImplementation(((_id?: number | NodeJS.Timeout) => {}) as typeof clearInterval)

    const handler = createAudioEventHandler(state, callbacks, platform)
    handler.init({
      uiUpdateInterval: 250,
      ipcBroadcastInterval: 500,
      getCurrentLyricLine: () => ({ text: 'timer line', trans: '', roma: '' })
    })

    expect(() => playerCoreMock.emit('play')).not.toThrow()
    expect(callbacks.onPlay).toHaveBeenCalledTimes(1)

    handler.dispose()
    expect(setIntervalSpy).toHaveBeenCalled()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('syncs lyric index even when UI updates are throttled and broadcasts immediately on line change', () => {
    const state = createInitialState()
    state.currentLyricIndex = -1
    state.playing = true

    const callbacks = {
      onTimeUpdate: vi.fn()
    }
    const platform = {
      isElectron: vi.fn(() => true),
      send: vi.fn()
    }

    const syncLyricIndex = vi.fn((time: number) => {
      const nextIndex = time >= 5 ? 1 : -1
      const changed = state.currentLyricIndex !== nextIndex
      state.currentLyricIndex = nextIndex
      return changed
    })

    const handler = createAudioEventHandler(state, callbacks, platform)
    handler.init({
      uiUpdateInterval: 1_000,
      ipcBroadcastInterval: 5_000,
      syncLyricIndex,
      getCurrentLyricLine: () =>
        state.currentLyricIndex === 1 ? { text: 'Line 2', trans: 'Second', roma: '' } : null
    })

    playerCoreMock.setCurrentTime(4)
    vi.setSystemTime(getTestDate(TIME_OFFSETS.MS_100))
    playerCoreMock.emit('timeupdate')

    callbacks.onTimeUpdate.mockClear()
    platform.send.mockClear()
    syncLyricIndex.mockClear()

    playerCoreMock.setCurrentTime(5)
    vi.setSystemTime(getTestDate(TIME_OFFSETS.MS_150))
    playerCoreMock.emit('timeupdate')

    expect(syncLyricIndex).toHaveBeenCalledWith(5)
    expect(callbacks.onTimeUpdate).not.toHaveBeenCalled()
    expect(platform.send).toHaveBeenCalledWith(
      'lyric-time-update',
      expect.objectContaining({
        time: 5,
        index: 1,
        text: 'Line 2',
        trans: 'Second',
        playing: true,
        cause: 'lyric-change'
      })
    )
  })

  it('uses the configured lyric payload factory when broadcasting desktop lyric updates', () => {
    const state = createInitialState()
    state.currentLyricIndex = 1
    state.playing = true

    const callbacks = {
      onTimeUpdate: vi.fn()
    }
    const platform = {
      isElectron: vi.fn(() => true),
      send: vi.fn()
    }

    const handler = createAudioEventHandler(state, callbacks, platform)
    handler.init({
      uiUpdateInterval: 250,
      ipcBroadcastInterval: 500,
      getCurrentLyricLine: () => ({ text: 'Line 2', trans: 'Second', roma: '' }),
      createLyricUpdatePayload: ({ time, index, line, playing, cause }) => ({
        time,
        index,
        text: line?.text || '',
        trans: line?.trans || '',
        roma: line?.roma || '',
        playing,
        songId: 'song-1',
        platform: 'netease',
        sequence: 7,
        cause
      })
    })

    playerCoreMock.setCurrentTime(5)
    vi.setSystemTime(getTestDate(TIME_OFFSETS.MS_900))
    playerCoreMock.emit('timeupdate')

    expect(platform.send).toHaveBeenCalledWith(
      'lyric-time-update',
      expect.objectContaining({
        songId: 'song-1',
        platform: 'netease',
        sequence: 7,
        cause: 'interval'
      })
    )
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

  it('re-emits metadata when duration becomes available during progress updates', () => {
    const state = createInitialState()
    const callbacks = {
      onTimeUpdate: vi.fn(),
      onLoadedMetadata: vi.fn()
    }
    const handler = createAudioEventHandler(state, callbacks)

    handler.init({
      uiUpdateInterval: 250,
      ipcBroadcastInterval: 500
    })

    playerCoreMock.setCurrentTime(3)
    playerCoreMock.setDuration(245)
    playerCoreMock.emit('timeupdate')

    expect(callbacks.onLoadedMetadata).toHaveBeenCalledWith(245)
  })

  it('forwards durationchange updates when metadata is discovered after playback starts', () => {
    const state = createInitialState()
    const callbacks = {
      onLoadedMetadata: vi.fn()
    }
    const handler = createAudioEventHandler(state, callbacks)

    handler.init()

    playerCoreMock.setDuration(187)
    playerCoreMock.emit('durationchange')

    expect(callbacks.onLoadedMetadata).toHaveBeenCalledWith(187)
  })
})
