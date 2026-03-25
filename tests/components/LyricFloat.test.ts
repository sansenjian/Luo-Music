import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import LyricFloat from '../../src/components/LyricFloat.vue'
import { TIME_OFFSETS } from '../utils/testConstants'

const platformState = vi.hoisted(() => {
  const listeners = new Map<string, Set<(data: unknown) => void>>()

  return {
    listeners,
    platformServiceMock: {
      isElectron: vi.fn(() => true),
      supportsSendChannel: vi.fn(() => true),
      send: vi.fn(),
      on: vi.fn((channel: string, callback: (data: unknown) => void) => {
        const channelListeners = listeners.get(channel) ?? new Set<(data: unknown) => void>()
        channelListeners.add(callback)
        listeners.set(channel, channelListeners)

        return () => {
          channelListeners.delete(callback)
        }
      })
    }
  }
})

const playerState = vi.hoisted(() => {
  return {
    playerServiceMock: {
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      skipToPrevious: vi.fn(),
      skipToNext: vi.fn(),
      playSong: vi.fn(),
      playSongById: vi.fn(),
      seekTo: vi.fn(),
      setVolume: vi.fn(),
      toggleMute: vi.fn(),
      setPlayMode: vi.fn(),
      togglePlayMode: vi.fn(),
      getState: vi.fn(),
      getCurrentSong: vi.fn(),
      getPlaylist: vi.fn(),
      addToNext: vi.fn(),
      removeFromPlaylist: vi.fn(),
      clearPlaylist: vi.fn(),
      getLyric: vi.fn(),
      onPlayStateChange: vi.fn(),
      onSongChange: vi.fn(),
      onLyricUpdate: vi.fn(),
      onPlayError: vi.fn()
    },
    playerBridgeMock: {
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      playSong: vi.fn(),
      playSongById: vi.fn(),
      skipToPrevious: vi.fn(),
      skipToNext: vi.fn(),
      seekTo: vi.fn(),
      setVolume: vi.fn(),
      toggleMute: vi.fn(),
      setPlayMode: vi.fn(),
      togglePlayMode: vi.fn(),
      getState: vi.fn(),
      getCurrentSong: vi.fn(),
      getPlaylist: vi.fn(),
      addToNext: vi.fn(),
      removeFromPlaylist: vi.fn(),
      clearPlaylist: vi.fn(),
      getLyric: vi.fn(),
      onPlayStateChange: vi.fn(),
      onSongChange: vi.fn(),
      onLyricUpdate: vi.fn(),
      onPlayError: vi.fn()
    }
  }
})

vi.mock('../../src/services/platformAccessor', () => ({
  getPlatformAccessor: () => platformState.platformServiceMock
}))

vi.mock('../../src/services/playerAccessor', () => ({
  getPlayerAccessor: () => playerState.playerServiceMock
}))

vi.mock('../../src/services', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      platform: () => platformState.platformServiceMock
    }
  }
})

describe('LyricFloat', () => {
  const rafQueue: FrameRequestCallback[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    platformState.listeners.clear()
    platformState.platformServiceMock.on.mockClear()
    platformState.platformServiceMock.supportsSendChannel.mockReset()
    platformState.platformServiceMock.supportsSendChannel.mockReturnValue(true)
    platformState.platformServiceMock.send.mockReset()
    playerState.playerServiceMock.play.mockClear()
    playerState.playerServiceMock.pause.mockClear()
    playerState.playerServiceMock.toggle.mockClear()
    playerState.playerServiceMock.skipToPrevious.mockClear()
    playerState.playerServiceMock.skipToNext.mockClear()
    playerState.playerBridgeMock.getState.mockReset()
    playerState.playerBridgeMock.getCurrentSong.mockReset()
    playerState.playerBridgeMock.getLyric.mockReset()
    playerState.playerBridgeMock.getState.mockResolvedValue({
      isPlaying: false,
      currentIndex: -1,
      currentSong: null,
      currentLyricIndex: -1
    })
    playerState.playerBridgeMock.getCurrentSong.mockResolvedValue(null)
    playerState.playerBridgeMock.getLyric.mockResolvedValue([])
    ;(window as unknown as Record<string, unknown>).services = {
      player: playerState.playerBridgeMock
    }
    rafQueue.length = 0

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      rafQueue.push(callback)
      return rafQueue.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    ;(window as Partial<Window & { services?: unknown }>).services = undefined
  })

  it('renders lyric updates from IPC through the shared lyric state', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()

    const lyricListeners = platformState.listeners.get('lyric-time-update')
    expect(lyricListeners).toBeDefined()

    lyricListeners?.forEach(listener => {
      listener({
        text: 'Main Line',
        trans: 'Translated Line',
        roma: 'Roma Line'
      })
    })
    await nextTick()

    expect(wrapper.find('.lrc-main').text()).toBe('Main Line')
    expect(wrapper.find('.lrc-sub').text()).toBe('Translated Line')
  })

  it('hydrates the current lyric line from player snapshot before push updates arrive', async () => {
    playerState.playerBridgeMock.getState.mockResolvedValue({
      isPlaying: true,
      currentIndex: 0,
      currentSong: {
        id: 1,
        name: 'Song',
        artists: [{ id: 1, name: 'Artist' }],
        album: { id: 1, name: 'Album', picUrl: '' },
        duration: 180000,
        mvid: 0,
        platform: 'netease',
        originalId: 1
      },
      currentLyricIndex: 1
    })
    playerState.playerBridgeMock.getLyric.mockResolvedValue([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: 'Second', roma: '' }
    ])

    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    expect(playerState.playerBridgeMock.getState).toHaveBeenCalledTimes(1)
    expect(playerState.playerBridgeMock.getLyric).toHaveBeenCalledWith(1, 'netease')
    expect(wrapper.find('.lrc-main').text()).toBe('Line 2')
    expect(wrapper.find('.lrc-sub').text()).toBe('Second')
    expect(wrapper.find('button[title="Pause"]').exists()).toBe(true)
  })

  it('ignores a stale preload that does not recognize the ready channel', async () => {
    platformState.platformServiceMock.supportsSendChannel.mockReturnValue(false)

    const wrapper = mount(LyricFloat)
    await nextTick()

    const lyricListeners = platformState.listeners.get('lyric-time-update')
    lyricListeners?.forEach(listener => {
      listener({
        text: 'Main Line',
        trans: 'Translated Line'
      })
    })
    await nextTick()

    expect(platformState.platformServiceMock.send).not.toHaveBeenCalledWith(
      'desktop-lyric-ready',
      undefined
    )
    expect(wrapper.find('.lrc-main').text()).toBe('Main Line')
  })

  it('reports unexpected errors when notifying renderer readiness', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    platformState.platformServiceMock.send.mockImplementation((channel: string) => {
      if (channel === 'desktop-lyric-ready') {
        throw new Error('boom')
      }
    })

    mount(LyricFloat)
    await nextTick()

    expect(errorSpy).toHaveBeenCalledWith(
      '[LyricFloat] Failed to notify desktop lyric renderer readiness',
      expect.any(Error)
    )
  })

  it('falls back to roma lyric when translated lyric is empty', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()

    const lyricListeners = platformState.listeners.get('lyric-time-update')
    lyricListeners?.forEach(listener => {
      listener({
        text: 'Main Line',
        trans: '',
        roma: 'Roma Line'
      })
    })
    await nextTick()

    expect(wrapper.find('.lrc-sub').text()).toBe('Roma Line')
  })

  it('requires a deliberate click after unlock activation instead of unlocking on hover', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()
    platformState.platformServiceMock.send.mockClear()

    const lockListeners = platformState.listeners.get('desktop-lyric-lock-state')
    expect(lockListeners).toBeDefined()
    lockListeners?.forEach(listener => {
      listener({ locked: true })
    })
    await nextTick()

    const unlockButton = wrapper.find('.unlock-btn')
    expect(unlockButton.exists()).toBe(true)

    // Trigger mouseenter to start unlock activation timer
    await unlockButton.trigger('mouseenter')

    // Should not unlock immediately (timer hasn't fired)
    expect(platformState.platformServiceMock.send).not.toHaveBeenCalled()

    // First click should not unlock (timer hasn't fired yet)
    await unlockButton.trigger('click')
    expect(platformState.platformServiceMock.send).not.toHaveBeenCalled()

    // Advance timers past hover activation delay (120ms)
    vi.advanceTimersByTime(120)
    await nextTick()

    // Advance time for guard delay (need to use Date.now mock)
    vi.setSystemTime(Date.now() + TIME_OFFSETS.MS_200)

    // Now click should trigger unlock
    await unlockButton.trigger('click')

    expect(platformState.platformServiceMock.send).toHaveBeenCalledWith(
      'desktop-lyric-control',
      'unlock'
    )
  })

  it('updates play button title based on lyric IPC playing state', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()

    const lyricListeners = platformState.listeners.get('lyric-time-update')
    lyricListeners?.forEach(listener => {
      listener({
        text: 'Main Line',
        playing: true
      })
    })
    await nextTick()

    expect(wrapper.find('button[title="Pause"]').exists()).toBe(true)

    lyricListeners?.forEach(listener => {
      listener({
        text: 'Main Line',
        playing: false
      })
    })
    await nextTick()

    expect(wrapper.find('button[title="Play"]').exists()).toBe(true)
  })

  it('sends explicit pause/play commands from play button based on current state', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()

    const lyricListeners = platformState.listeners.get('lyric-time-update')
    lyricListeners?.forEach(listener => {
      listener({
        text: 'Main Line',
        playing: true
      })
    })
    await nextTick()

    await wrapper.find('button[title="Pause"]').trigger('click')
    expect(playerState.playerServiceMock.pause).toHaveBeenCalledTimes(1)
    expect(playerState.playerServiceMock.play).toHaveBeenCalledTimes(0)

    lyricListeners?.forEach(listener => {
      listener({
        text: 'Main Line',
        playing: false
      })
    })
    await nextTick()

    await wrapper.find('button[title="Play"]').trigger('click')
    expect(playerState.playerServiceMock.play).toHaveBeenCalledTimes(1)
  })

  it('batches drag move IPC messages into one frame', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()

    platformState.platformServiceMock.send.mockClear()

    await wrapper.find('.lyric-window').trigger('mousedown', {
      screenX: 100,
      screenY: 200
    })

    window.dispatchEvent(new MouseEvent('mousemove', { screenX: 110, screenY: 205 }))
    window.dispatchEvent(new MouseEvent('mousemove', { screenX: 120, screenY: 220 }))

    expect(platformState.platformServiceMock.send).not.toHaveBeenCalled()
    expect(rafQueue).toHaveLength(1)

    rafQueue[0](0)
    await nextTick()

    expect(platformState.platformServiceMock.send).toHaveBeenCalledTimes(1)
    expect(platformState.platformServiceMock.send).toHaveBeenCalledWith('desktop-lyric-move', {
      x: 20,
      y: 20
    })

    window.dispatchEvent(new MouseEvent('mouseup'))
  })
})
