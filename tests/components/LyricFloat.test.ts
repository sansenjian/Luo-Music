import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import LyricFloat from '@/components/LyricFloat.vue'
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
  const playStateListeners = new Set<(data: { isPlaying: boolean; currentTime: number }) => void>()
  const songChangeListeners = new Set<(data: { song: unknown; index: number }) => void>()
  const lyricUpdateListeners = new Set<(data: { index: number; line: unknown }) => void>()
  const desktopLyricStateListeners = new Set<(data: unknown) => void>()

  return {
    playStateListeners,
    songChangeListeners,
    lyricUpdateListeners,
    desktopLyricStateListeners,
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
      onPlayStateChange: vi.fn(
        (listener: (data: { isPlaying: boolean; currentTime: number }) => void) => {
          playStateListeners.add(listener)
          return () => playStateListeners.delete(listener)
        }
      ),
      onSongChange: vi.fn((listener: (data: { song: unknown; index: number }) => void) => {
        songChangeListeners.add(listener)
        return () => songChangeListeners.delete(listener)
      }),
      onLyricUpdate: vi.fn((listener: (data: { index: number; line: unknown }) => void) => {
        lyricUpdateListeners.add(listener)
        return () => lyricUpdateListeners.delete(listener)
      }),
      onDesktopLyricState: vi.fn((listener: (data: unknown) => void) => {
        desktopLyricStateListeners.add(listener)
        return () => desktopLyricStateListeners.delete(listener)
      }),
      onPlayError: vi.fn()
    }
  }
})

vi.mock('@/services', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      platform: () => platformState.platformServiceMock,
      player: () => playerState.playerServiceMock
    }
  }
})

describe('LyricFloat', () => {
  const rafQueue: FrameRequestCallback[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.removeItem('luo.desktopLyricDebug')
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
    ;(
      playerState.playerBridgeMock as {
        getDesktopLyricSnapshot?: ReturnType<typeof vi.fn>
      }
    ).getDesktopLyricSnapshot = undefined
    playerState.playStateListeners.clear()
    playerState.songChangeListeners.clear()
    playerState.lyricUpdateListeners.clear()
    playerState.desktopLyricStateListeners.clear()
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
    window.localStorage.removeItem('luo.desktopLyricDebug')
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

  it('prefers the unified desktop lyric state stream when it is available', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    playerState.desktopLyricStateListeners.forEach(listener => {
      listener({
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
        currentLyricIndex: 1,
        progress: 6,
        isPlaying: true,
        songId: 1,
        platform: 'netease',
        sequence: 4,
        lyrics: [
          { time: 0, text: 'Line 1', trans: '', roma: '' },
          { time: 5, text: 'Line 2', trans: 'Second', roma: '' }
        ]
      })
    })
    await nextTick()

    expect(wrapper.find('.lrc-main').text()).toBe('Line 2')
    expect(wrapper.find('.lrc-sub').text()).toBe('Second')
  })

  it('keeps the desktop lyric text aligned with player lyric-update events', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    playerState.lyricUpdateListeners.forEach(listener => {
      listener({
        index: 2,
        line: {
          time: 12,
          text: 'Bridge Main',
          trans: 'Bridge Trans',
          roma: ''
        }
      })
    })
    await nextTick()

    expect(wrapper.find('.lrc-main').text()).toBe('Bridge Main')
    expect(wrapper.find('.lrc-sub').text()).toBe('Bridge Trans')
  })

  it('does not let a following play-state refresh overwrite a fresh player lyric update', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    playerState.lyricUpdateListeners.forEach(listener => {
      listener({
        index: 2,
        line: {
          time: 12,
          text: 'Realtime Main',
          trans: 'Realtime Trans',
          roma: ''
        }
      })
    })
    await nextTick()

    playerState.playStateListeners.forEach(listener => {
      listener({ isPlaying: true, currentTime: 12 })
    })
    await nextTick()

    expect(wrapper.find('.lrc-main').text()).toBe('Realtime Main')
    expect(wrapper.find('.lrc-sub').text()).toBe('Realtime Trans')
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

  it('prefers desktop lyric snapshot hydration when the snapshot bridge is available', async () => {
    ;(
      playerState.playerBridgeMock as {
        getDesktopLyricSnapshot?: ReturnType<typeof vi.fn>
      }
    ).getDesktopLyricSnapshot = vi.fn().mockResolvedValue({
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
      currentLyricIndex: 1,
      progress: 6,
      isPlaying: true,
      songId: 1,
      platform: 'netease',
      sequence: 4,
      lyrics: [
        { time: 0, text: 'Line 1', trans: '', roma: '' },
        { time: 5, text: 'Line 2', trans: 'Second', roma: '' }
      ]
    })

    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    expect(
      (
        playerState.playerBridgeMock as {
          getDesktopLyricSnapshot?: ReturnType<typeof vi.fn>
        }
      ).getDesktopLyricSnapshot
    ).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.lrc-main').text()).toBe('Line 2')
    expect(wrapper.find('.lrc-sub').text()).toBe('Second')
  })

  it('falls back to getLyric when the desktop lyric snapshot has no lyric cache', async () => {
    ;(
      playerState.playerBridgeMock as {
        getDesktopLyricSnapshot?: ReturnType<typeof vi.fn>
      }
    ).getDesktopLyricSnapshot = vi.fn().mockResolvedValue({
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
      currentLyricIndex: 1,
      progress: 6,
      isPlaying: true,
      songId: 1,
      platform: 'netease',
      sequence: 4,
      lyrics: []
    })
    playerState.playerBridgeMock.getLyric.mockResolvedValue([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: 'Second', roma: '' }
    ])

    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    expect(playerState.playerBridgeMock.getLyric).toHaveBeenCalledWith(1, 'netease')
    expect(wrapper.find('.lrc-main').text()).toBe('Line 2')
    expect(wrapper.find('.lrc-sub').text()).toBe('Second')
  })

  it('derives the current lyric line from playback progress when the snapshot index is stale', async () => {
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
      currentLyricIndex: -1,
      progress: 6
    })
    playerState.playerBridgeMock.getLyric.mockResolvedValue([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: 'Second', roma: '' }
    ])

    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    expect(wrapper.find('.lrc-main').text()).toBe('Line 2')
    expect(wrapper.find('.lrc-sub').text()).toBe('Second')
  })

  it('updates the desktop lyric from player state change events when lyric push payloads are unavailable', async () => {
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
      currentLyricIndex: -1,
      progress: 0
    })
    playerState.playerBridgeMock.getLyric.mockResolvedValue([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: 'Second', roma: '' }
    ])

    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    playerState.playStateListeners.forEach(listener => {
      listener({ isPlaying: true, currentTime: 6 })
    })
    await nextTick()

    expect(wrapper.find('.lrc-main').text()).toBe('Line 2')
    expect(wrapper.find('.lrc-sub').text()).toBe('Second')
  })

  it('recomputes the lyric index from playback progress when cached index is stale', async () => {
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
      currentLyricIndex: 0,
      progress: 0
    })
    playerState.playerBridgeMock.getLyric.mockResolvedValue([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: 'Second', roma: '' }
    ])

    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    playerState.playStateListeners.forEach(listener => {
      listener({ isPlaying: true, currentTime: 6 })
    })
    await nextTick()

    expect(wrapper.find('.lrc-main').text()).toBe('Line 2')
    expect(wrapper.find('.lrc-sub').text()).toBe('Second')
  })

  it('does not let delayed player state updates override a newer lyric push', async () => {
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
      currentLyricIndex: -1,
      progress: 0
    })
    playerState.playerBridgeMock.getLyric.mockResolvedValue([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: 'Second', roma: '' }
    ])

    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    const lyricListeners = platformState.listeners.get('lyric-time-update')
    lyricListeners?.forEach(listener => {
      listener({
        index: 1,
        time: 5,
        text: 'Line 2',
        trans: 'Second',
        roma: '',
        playing: true,
        songId: 1,
        platform: 'netease',
        sequence: 2
      })
    })
    await nextTick()

    playerState.playStateListeners.forEach(listener => {
      listener({ isPlaying: true, currentTime: 4.2 })
    })
    await nextTick()

    expect(wrapper.find('.lrc-main').text()).toBe('Line 2')
    expect(wrapper.find('.lrc-sub').text()).toBe('Second')
  })

  it('ignores out-of-order lyric pushes that arrive after a newer desktop lyric snapshot', async () => {
    ;(
      playerState.playerBridgeMock as {
        getDesktopLyricSnapshot?: ReturnType<typeof vi.fn>
      }
    ).getDesktopLyricSnapshot = vi.fn().mockResolvedValue({
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
      currentLyricIndex: 1,
      progress: 6,
      isPlaying: true,
      songId: 1,
      platform: 'netease',
      sequence: 10,
      lyrics: [
        { time: 0, text: 'Line 1', trans: '', roma: '' },
        { time: 5, text: 'Line 2', trans: 'Second', roma: '' }
      ]
    })

    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    platformState.listeners.get('lyric-time-update')?.forEach(listener => {
      listener({
        index: 0,
        time: 2,
        text: 'Line 1',
        trans: '',
        roma: '',
        playing: true,
        songId: 1,
        platform: 'netease',
        sequence: 9
      })
    })
    await nextTick()

    expect(wrapper.find('.lrc-main').text()).toBe('Line 2')
    expect(wrapper.find('.lrc-sub').text()).toBe('Second')
  })

  it('writes diagnostic traces for snapshot hydration and ignored stale pushes when debug is enabled', async () => {
    window.localStorage.setItem('luo.desktopLyricDebug', '1')
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    ;(
      playerState.playerBridgeMock as {
        getDesktopLyricSnapshot?: ReturnType<typeof vi.fn>
      }
    ).getDesktopLyricSnapshot = vi.fn().mockResolvedValue({
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
      currentLyricIndex: 1,
      progress: 6,
      isPlaying: true,
      songId: 1,
      platform: 'netease',
      sequence: 10,
      lyrics: [
        { time: 0, text: 'Line 1', trans: '', roma: '' },
        { time: 5, text: 'Line 2', trans: 'Second', roma: '' }
      ]
    })

    mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    platformState.listeners.get('lyric-time-update')?.forEach(listener => {
      listener({
        index: 0,
        time: 2,
        text: 'Line 1',
        trans: '',
        roma: '',
        playing: true,
        songId: 1,
        platform: 'netease',
        sequence: 9,
        cause: 'interval'
      })
    })
    await nextTick()

    expect(debugSpy).toHaveBeenCalledWith(
      '[DesktopLyric]',
      'hydrate-desktop-lyric-snapshot',
      expect.objectContaining({
        source: 'snapshot',
        songId: 1,
        sequence: 10,
        currentLyricIndex: 1
      })
    )
    expect(debugSpy).toHaveBeenCalledWith(
      '[DesktopLyric]',
      'ignore-out-of-order-push',
      expect.objectContaining({
        source: 'push',
        songId: 1,
        sequence: 9,
        lastAcceptedSequence: 10,
        cause: 'interval'
      })
    )
  })

  it('ignores lyric pushes from a previous song after song change', async () => {
    playerState.playerBridgeMock.getState.mockResolvedValue({
      isPlaying: true,
      currentIndex: 0,
      currentSong: {
        id: 2,
        name: 'Song 2',
        artists: [{ id: 2, name: 'Artist 2' }],
        album: { id: 2, name: 'Album 2', picUrl: '' },
        duration: 180000,
        mvid: 0,
        platform: 'netease',
        originalId: 2
      },
      currentLyricIndex: -1,
      progress: 0
    })
    playerState.playerBridgeMock.getLyric.mockResolvedValue([
      { time: 0, text: 'Song 2 Line 1', trans: '', roma: '' },
      { time: 5, text: 'Song 2 Line 2', trans: 'Second', roma: '' }
    ])

    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    playerState.songChangeListeners.forEach(listener => {
      listener({
        song: {
          id: 2,
          name: 'Song 2',
          artists: [{ id: 2, name: 'Artist 2' }],
          album: { id: 2, name: 'Album 2', picUrl: '' },
          duration: 180000,
          mvid: 0,
          platform: 'netease',
          originalId: 2
        },
        index: 0
      })
    })
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    platformState.listeners.get('lyric-time-update')?.forEach(listener => {
      listener({
        index: 0,
        time: 1,
        text: 'Old Song Line',
        trans: '',
        roma: '',
        playing: true,
        songId: 1,
        platform: 'netease',
        sequence: 11
      })
    })
    await nextTick()

    expect(wrapper.find('.lrc-main').text()).toBe('Song 2 Line 1')
  })

  it('rehydrates desktop lyric data after late player state sync when the initial snapshot is empty', async () => {
    playerState.playerBridgeMock.getState
      .mockResolvedValueOnce({
        isPlaying: true,
        currentIndex: -1,
        currentSong: null,
        currentLyricIndex: -1,
        progress: 0
      })
      .mockResolvedValueOnce({
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
        currentLyricIndex: 1,
        progress: 6
      })
    playerState.playerBridgeMock.getLyric.mockResolvedValue([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: 'Second', roma: '' }
    ])

    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    expect(wrapper.find('.lrc-main').text()).toBe('Desktop Lyric')

    playerState.playStateListeners.forEach(listener => {
      listener({ isPlaying: true, currentTime: 6 })
    })
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(playerState.playerBridgeMock.getState).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.lrc-main').text()).toBe('Line 2')
    expect(wrapper.find('.lrc-sub').text()).toBe('Second')
  })

  it('derives the current lyric line from cached lyrics when push updates carry time but no index text', async () => {
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
      currentLyricIndex: -1,
      progress: 0
    })
    playerState.playerBridgeMock.getLyric.mockResolvedValue([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: 'Second', roma: '' }
    ])

    const wrapper = mount(LyricFloat)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    const lyricListeners = platformState.listeners.get('lyric-time-update')
    lyricListeners?.forEach(listener => {
      listener({
        index: -1,
        time: 6,
        text: '',
        trans: '',
        roma: '',
        playing: true
      })
    })
    await nextTick()

    expect(wrapper.find('.lrc-main').text()).toBe('Line 2')
    expect(wrapper.find('.lrc-sub').text()).toBe('Second')
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
