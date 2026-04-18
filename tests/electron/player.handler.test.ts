import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerInvokeMock = vi.hoisted(() => vi.fn())
const registerSendMock = vi.hoisted(() => vi.fn())
const broadcastMock = vi.hoisted(() => vi.fn())

describe('player.handler', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doMock('../../electron/ipc/IpcService', () => ({
      ipcService: {
        registerInvoke: registerInvokeMock,
        registerSend: registerSendMock,
        broadcast: broadcastMock
      }
    }))
  })

  it('forwards player commands and serves synced state', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    const sendHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )
    registerSendMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        sendHandlers.set(channel, handler)
      }
    )

    const { registerPlayerHandlers } = await import('../../electron/ipc/handlers/player.handler')

    const song = {
      id: 'song-1',
      name: 'Song 1',
      artists: [{ id: 'artist-1', name: 'Artist 1' }],
      album: { id: 'album-1', name: 'Album 1', picUrl: '' },
      duration: 180000,
      mvid: 0,
      platform: 'netease',
      originalId: 'song-1'
    } as const

    const windowManager = {
      send: vi.fn(),
      syncPlaybackState: vi.fn(),
      syncTrayPlayMode: vi.fn()
    }

    const serviceManager = {
      handleRequest: vi.fn()
    }

    registerPlayerHandlers(windowManager as never, serviceManager as never)

    await invokeHandlers.get('player:play-song')?.({
      song,
      playlist: [song]
    })
    await invokeHandlers.get('player:play-song-by-id')?.({
      id: 'song-2',
      platform: 'qq'
    })
    await invokeHandlers.get('player:add-to-next')?.(song)
    await invokeHandlers.get('player:remove-from-playlist')?.(3)
    await invokeHandlers.get('player:clear-playlist')?.()

    expect(windowManager.send).toHaveBeenCalledWith('music-song-control', {
      type: 'play-song',
      song,
      playlist: [song]
    })
    expect(windowManager.send).toHaveBeenCalledWith('music-song-control', {
      type: 'play-song-by-id',
      id: 'song-2',
      platform: 'qq'
    })
    expect(windowManager.send).toHaveBeenCalledWith('music-song-control', {
      type: 'add-to-next',
      song
    })
    expect(windowManager.send).toHaveBeenCalledWith('music-song-control', {
      type: 'remove-from-playlist',
      index: 3
    })
    expect(windowManager.send).toHaveBeenCalledWith('music-song-control', {
      type: 'clear-playlist'
    })

    const syncState = sendHandlers.get('player:sync-state')
    syncState?.({
      isPlaying: true,
      isLoading: false,
      progress: 42,
      duration: 180,
      volume: 0.8,
      isMuted: false,
      playMode: 1,
      playlist: [song],
      currentIndex: 0,
      currentSong: song,
      lyricSong: song,
      currentLyricIndex: 0,
      showLyric: true,
      showPlaylist: false,
      isPlayerDocked: false,
      lyricType: ['original', 'trans', 'roma'],
      lyrics: [{ time: 42, text: 'line', trans: '', roma: '' }],
      desktopLyricSequence: 3
    })

    // 刷新待处理的广播（节流策略需要）
    const { flushStateBroadcasts } = await import('../../electron/ipc/handlers/player.handler')
    flushStateBroadcasts()

    await expect(invokeHandlers.get('player:get-state')?.()).resolves.toMatchObject({
      isPlaying: true,
      progress: 42,
      playlist: [song],
      currentSong: song
    })
    await expect(invokeHandlers.get('player:get-current-song')?.()).resolves.toEqual(song)
    await expect(invokeHandlers.get('player:get-playlist')?.()).resolves.toEqual([song])
    await expect(invokeHandlers.get('player:get-desktop-lyric-snapshot')?.()).resolves.toEqual({
      currentSong: song,
      currentLyricIndex: 0,
      progress: 42,
      isPlaying: true,
      lyrics: [{ time: 42, text: 'line', trans: '', roma: '' }],
      songId: 'song-1',
      platform: 'netease',
      sequence: 3,
      lyricType: ['original', 'trans', 'roma']
    })
    await expect(
      invokeHandlers.get('player:get-lyric')?.({ id: 'song-1', platform: 'netease' })
    ).resolves.toEqual([{ time: 42, text: 'line', trans: '', roma: '' }])

    expect(broadcastMock).toHaveBeenCalledWith('player:state-change', {
      isPlaying: true,
      currentTime: 42
    })
    expect(broadcastMock).toHaveBeenCalledWith('player:track-changed', {
      song,
      index: 0
    })
    expect(broadcastMock).toHaveBeenCalledWith('player:lyric-update', {
      index: 0,
      line: { time: 42, text: 'line', trans: '', roma: '' }
    })
    expect(broadcastMock).toHaveBeenCalledWith('player:desktop-lyric-state', {
      currentSong: song,
      currentLyricIndex: 0,
      progress: 42,
      isPlaying: true,
      lyrics: [{ time: 42, text: 'line', trans: '', roma: '' }],
      songId: 'song-1',
      platform: 'netease',
      sequence: 3,
      lyricType: ['original', 'trans', 'roma']
    })
  })

  it('fetches lyrics for a non-current song by payload instead of returning current cached lyrics', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    const sendHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )
    registerSendMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        sendHandlers.set(channel, handler)
      }
    )

    const { registerPlayerHandlers } = await import('../../electron/ipc/handlers/player.handler')

    const currentSong = {
      id: 'song-1',
      name: 'Song 1',
      artists: [{ id: 'artist-1', name: 'Artist 1' }],
      album: { id: 'album-1', name: 'Album 1', picUrl: '' },
      duration: 180000,
      mvid: 0,
      platform: 'netease',
      originalId: 'song-1'
    } as const

    const windowManager = {
      send: vi.fn(),
      syncPlaybackState: vi.fn(),
      syncTrayPlayMode: vi.fn()
    }

    const serviceManager = {
      handleRequest: vi.fn().mockResolvedValue({
        lyric: { lyric: '[00:01.00]Fetched line' },
        tlyric: { lyric: '[00:01.00]翻译行' },
        romalrc: { lyric: '[00:01.00]roma line' }
      })
    }

    registerPlayerHandlers(windowManager as never, serviceManager as never)

    const syncState = sendHandlers.get('player:sync-state')
    syncState?.({
      isPlaying: true,
      isLoading: false,
      progress: 42,
      duration: 180,
      volume: 0.8,
      isMuted: false,
      playMode: 1,
      playlist: [currentSong],
      currentIndex: 0,
      currentSong,
      lyricSong: currentSong,
      currentLyricIndex: 0,
      showLyric: true,
      showPlaylist: false,
      isPlayerDocked: false,
      lyrics: [{ time: 42, text: 'current line', trans: '', roma: '' }],
      desktopLyricSequence: 1
    })

    await expect(
      invokeHandlers.get('player:get-lyric')?.({ id: 'song-2', platform: 'qq' })
    ).resolves.toEqual([{ time: 1, text: 'Fetched line', trans: '翻译行', roma: 'roma line' }])

    expect(serviceManager.handleRequest).toHaveBeenCalledWith('qq', 'getLyric', {
      songmid: 'song-2'
    })
  })

  it('refetches current-song lyrics when the synced cache is still empty', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    const sendHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )
    registerSendMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        sendHandlers.set(channel, handler)
      }
    )

    const { registerPlayerHandlers } = await import('../../electron/ipc/handlers/player.handler')

    const currentSong = {
      id: 'song-1',
      name: 'Song 1',
      artists: [{ id: 'artist-1', name: 'Artist 1' }],
      album: { id: 'album-1', name: 'Album 1', picUrl: '' },
      duration: 180000,
      mvid: 0,
      platform: 'netease',
      originalId: 'song-1'
    } as const

    const windowManager = {
      send: vi.fn(),
      syncPlaybackState: vi.fn(),
      syncTrayPlayMode: vi.fn()
    }

    const serviceManager = {
      handleRequest: vi.fn().mockResolvedValue({
        lrc: { lyric: '[00:01.00]Fetched current line' },
        tlyric: { lyric: '' },
        romalrc: { lyric: '' }
      })
    }

    registerPlayerHandlers(windowManager as never, serviceManager as never)

    sendHandlers.get('player:sync-state')?.({
      isPlaying: true,
      isLoading: false,
      progress: 42,
      duration: 180,
      volume: 0.8,
      isMuted: false,
      playMode: 1,
      playlist: [currentSong],
      currentIndex: 0,
      currentSong,
      lyricSong: null,
      currentLyricIndex: -1,
      showLyric: true,
      showPlaylist: false,
      isPlayerDocked: false,
      lyrics: [],
      desktopLyricSequence: 0
    })

    await expect(
      invokeHandlers.get('player:get-lyric')?.({ id: 'song-1', platform: 'netease' })
    ).resolves.toEqual([{ time: 1, text: 'Fetched current line', trans: '', roma: '' }])

    expect(serviceManager.handleRequest).toHaveBeenCalledWith('netease', 'lyric', {
      id: 'song-1'
    })
  })

  it('refetches current-song lyrics when the cached lyrics belong to a previous song', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    const sendHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )
    registerSendMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        sendHandlers.set(channel, handler)
      }
    )

    const { registerPlayerHandlers } = await import('../../electron/ipc/handlers/player.handler')

    const staleLyricSong = {
      id: 'song-1',
      name: 'Song 1',
      artists: [{ id: 'artist-1', name: 'Artist 1' }],
      album: { id: 'album-1', name: 'Album 1', picUrl: '' },
      duration: 180000,
      mvid: 0,
      platform: 'netease',
      originalId: 'song-1'
    } as const

    const currentSong = {
      id: 'song-2',
      name: 'Song 2',
      artists: [{ id: 'artist-2', name: 'Artist 2' }],
      album: { id: 'album-2', name: 'Album 2', picUrl: '' },
      duration: 180000,
      mvid: 0,
      platform: 'netease',
      originalId: 'song-2'
    } as const

    const windowManager = {
      send: vi.fn(),
      syncPlaybackState: vi.fn(),
      syncTrayPlayMode: vi.fn()
    }

    const serviceManager = {
      handleRequest: vi.fn().mockResolvedValue({
        lrc: { lyric: '[00:01.00]Fresh current line' },
        tlyric: { lyric: '' },
        romalrc: { lyric: '' }
      })
    }

    registerPlayerHandlers(windowManager as never, serviceManager as never)

    sendHandlers.get('player:sync-state')?.({
      isPlaying: true,
      isLoading: false,
      progress: 42,
      duration: 180,
      volume: 0.8,
      isMuted: false,
      playMode: 1,
      playlist: [currentSong],
      currentIndex: 0,
      currentSong,
      lyricSong: staleLyricSong,
      currentLyricIndex: 0,
      showLyric: true,
      showPlaylist: false,
      isPlayerDocked: false,
      lyrics: [{ time: 42, text: 'stale line', trans: '', roma: '' }],
      desktopLyricSequence: 9
    })

    await expect(
      invokeHandlers.get('player:get-lyric')?.({ id: 'song-2', platform: 'netease' })
    ).resolves.toEqual([{ time: 1, text: 'Fresh current line', trans: '', roma: '' }])

    expect(serviceManager.handleRequest).toHaveBeenCalledWith('netease', 'lyric', {
      id: 'song-2'
    })
  })

  it('does not expose stale cached lyrics through the desktop lyric snapshot', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    const sendHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )
    registerSendMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        sendHandlers.set(channel, handler)
      }
    )

    const { registerPlayerHandlers } = await import('../../electron/ipc/handlers/player.handler')

    const staleLyricSong = {
      id: 'song-1',
      name: 'Song 1',
      artists: [{ id: 'artist-1', name: 'Artist 1' }],
      album: { id: 'album-1', name: 'Album 1', picUrl: '' },
      duration: 180000,
      mvid: 0,
      platform: 'netease',
      originalId: 'song-1'
    } as const

    const currentSong = {
      id: 'song-2',
      name: 'Song 2',
      artists: [{ id: 'artist-2', name: 'Artist 2' }],
      album: { id: 'album-2', name: 'Album 2', picUrl: '' },
      duration: 180000,
      mvid: 0,
      platform: 'netease',
      originalId: 'song-2'
    } as const

    registerPlayerHandlers(
      {
        send: vi.fn(),
        syncPlaybackState: vi.fn(),
        syncTrayPlayMode: vi.fn()
      } as never,
      {
        handleRequest: vi.fn()
      } as never
    )

    sendHandlers.get('player:sync-state')?.({
      isPlaying: true,
      isLoading: false,
      progress: 42,
      duration: 180,
      volume: 0.8,
      isMuted: false,
      playMode: 1,
      playlist: [currentSong],
      currentIndex: 0,
      currentSong,
      lyricSong: staleLyricSong,
      currentLyricIndex: 0,
      showLyric: true,
      showPlaylist: false,
      isPlayerDocked: false,
      lyrics: [{ time: 42, text: 'stale line', trans: '', roma: '' }],
      desktopLyricSequence: 9
    })

    await expect(invokeHandlers.get('player:get-desktop-lyric-snapshot')?.()).resolves.toEqual({
      currentSong,
      currentLyricIndex: -1,
      progress: 42,
      isPlaying: true,
      lyrics: [],
      songId: 'song-2',
      platform: 'netease',
      sequence: 0,
      lyricType: ['original', 'trans']
    })
  })

  it('rebroadcasts desktop lyric state when lyric display settings change', async () => {
    const sendHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(() => {})
    registerSendMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        sendHandlers.set(channel, handler)
      }
    )

    const { flushStateBroadcasts, registerPlayerHandlers } =
      await import('../../electron/ipc/handlers/player.handler')

    const song = {
      id: 'song-1',
      name: 'Song 1',
      artists: [{ id: 'artist-1', name: 'Artist 1' }],
      album: { id: 'album-1', name: 'Album 1', picUrl: '' },
      duration: 180000,
      mvid: 0,
      platform: 'netease',
      originalId: 'song-1'
    } as const

    registerPlayerHandlers(
      {
        send: vi.fn(),
        syncPlaybackState: vi.fn(),
        syncTrayPlayMode: vi.fn()
      } as never,
      {
        handleRequest: vi.fn()
      } as never
    )

    const syncState = sendHandlers.get('player:sync-state')
    syncState?.({
      isPlaying: true,
      isLoading: false,
      progress: 42,
      duration: 180,
      volume: 0.8,
      isMuted: false,
      playMode: 1,
      playlist: [song],
      currentIndex: 0,
      currentSong: song,
      lyricSong: song,
      currentLyricIndex: 0,
      showLyric: true,
      showPlaylist: false,
      isPlayerDocked: false,
      lyricType: ['original', 'trans'],
      lyrics: [{ time: 42, text: 'line', trans: 'trans', roma: 'roma' }],
      desktopLyricSequence: 3
    })
    flushStateBroadcasts()
    broadcastMock.mockClear()

    syncState?.({
      isPlaying: true,
      isLoading: false,
      progress: 42,
      duration: 180,
      volume: 0.8,
      isMuted: false,
      playMode: 1,
      playlist: [song],
      currentIndex: 0,
      currentSong: song,
      lyricSong: song,
      currentLyricIndex: 0,
      showLyric: true,
      showPlaylist: false,
      isPlayerDocked: false,
      lyricType: ['original', 'trans', 'roma'],
      lyrics: [{ time: 42, text: 'line', trans: 'trans', roma: 'roma' }],
      desktopLyricSequence: 3
    })
    flushStateBroadcasts()

    expect(broadcastMock).toHaveBeenCalledWith('player:desktop-lyric-state', {
      currentSong: song,
      currentLyricIndex: 0,
      progress: 42,
      isPlaying: true,
      lyrics: [{ time: 42, text: 'line', trans: 'trans', roma: 'roma' }],
      songId: 'song-1',
      platform: 'netease',
      sequence: 3,
      lyricType: ['original', 'trans', 'roma']
    })
  })

  it('rejects invalid seek, volume, and add-to-next payloads', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )

    const { registerPlayerHandlers } = await import('../../electron/ipc/handlers/player.handler')

    const windowManager = {
      send: vi.fn(),
      syncPlaybackState: vi.fn(),
      syncTrayPlayMode: vi.fn()
    }

    registerPlayerHandlers(windowManager as never, { handleRequest: vi.fn() } as never)

    await expect(invokeHandlers.get('player:seek-to')?.(-1)).rejects.toThrow('Invalid seek time')
    await expect(invokeHandlers.get('player:set-volume')?.(1.5)).rejects.toThrow('Invalid volume')
    await expect(invokeHandlers.get('player:add-to-next')?.({ id: 'song-1' })).rejects.toThrow(
      'Invalid song payload'
    )

    expect(windowManager.send).not.toHaveBeenCalled()
  })
})
