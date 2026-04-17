import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PLAY_MODE } from '@/utils/player/constants/playMode'
import type { LyricLine } from '@/utils/player/core/lyric'
import { createPlayerStore, usePlayerStore } from '@/store/playerStore.ts'
import { createMockSong } from '../utils/test-utils'

let storeCounter = 0

function createAudioManagerMock() {
  return {
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    getMuted: vi.fn(() => false),
    setMuted: vi.fn()
  }
}

function createInjectedPlayerStore(options: { isElectron?: boolean } = {}) {
  storeCounter += 1
  const audioManager = createAudioManagerMock()
  const platformAccessor = {
    isElectron: vi.fn(() => options.isElectron ?? false),
    send: vi.fn(),
    sendPlayingState: vi.fn(),
    sendPlayModeChange: vi.fn(),
    on: vi.fn(() => () => {})
  }
  const storageService = {
    setItem: vi.fn()
  }
  const useInjectedStore = createPlayerStore(
    {
      audioManager,
      getStorageService: () => storageService,
      getPlatformAccessor: () => platformAccessor
    },
    `player-test-${storeCounter}`
  )

  return {
    store: useInjectedStore(),
    audioManager,
    platformAccessor,
    storageService
  }
}

describe('playerStore', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const store = usePlayerStore()

      expect(store.playing).toBe(false)
      expect(store.progress).toBe(0)
      expect(store.duration).toBe(0)
      expect(store.volume).toBe(0.7)
      expect(store.playMode).toBe(PLAY_MODE.SEQUENTIAL)
      expect(store.songList).toEqual([])
      expect(store.currentIndex).toBe(-1)
      expect(store.currentSong).toBeNull()
      expect(store.initialized).toBe(false)
      expect(store.isPlayerDocked).toBe(true)
    })

    it('has correct getters', () => {
      const store = usePlayerStore()

      expect(store.hasSongs).toBe(false)
      expect(store.currentSongInfo).toBeNull()
      expect(store.formattedProgress).toBe('00:00')
      expect(store.formattedDuration).toBe('00:00')
      expect(store.playModeText).toBe('顺序播放')
    })

    it('prefers committed currentSong over playlist index for currentSongInfo', () => {
      const store = usePlayerStore()
      const currentSong = createMockSong({ id: 9, name: 'Playing Song' })
      const indexedSong = createMockSong({ id: 10, name: 'Indexed Song' })

      store.songList = [indexedSong]
      store.currentIndex = 0
      store.currentSong = currentSong

      expect(store.currentSongInfo).toStrictEqual(currentSong)
    })
  })

  describe('playlist management', () => {
    it('setSongList sets songs', () => {
      const store = usePlayerStore()
      const songs = [
        createMockSong({ id: 1, name: 'Song 1' }),
        createMockSong({ id: 2, name: 'Song 2' })
      ]

      store.setSongList(songs)

      expect(store.songList).toHaveLength(2)
      expect(store.songList[0].name).toBe('Song 1')
      expect(store.currentIndex).toBe(-1)
    })

    it('clears stale currentSong when the new playlist no longer contains it', () => {
      const store = usePlayerStore()
      store.currentSong = createMockSong({ id: 99, name: 'Stale Song' })

      store.setSongList([
        createMockSong({ id: 1, name: 'Song 1' }),
        createMockSong({ id: 2, name: 'Song 2' })
      ])

      expect(store.currentIndex).toBe(-1)
      expect(store.currentSong).toBeNull()
      expect(store.currentSongInfo).toBeNull()
    })

    it('matches current songs by id and platform when replacing the playlist', () => {
      const store = usePlayerStore()
      store.currentSong = createMockSong({ id: 'shared-id', platform: 'qq', name: 'QQ Song' })
      store.currentIndex = 0

      store.setSongList([
        createMockSong({ id: 'shared-id', platform: 'netease', name: 'Netease Song' }),
        createMockSong({ id: 'shared-id', platform: 'qq', name: 'QQ Song' })
      ])

      expect(store.currentIndex).toBe(1)
      expect(store.currentSong?.platform).toBe('qq')
    })

    it('addSong appends a song', () => {
      const store = usePlayerStore()
      const song = createMockSong({ id: 1, name: 'New Song' })

      store.addSong(song)

      expect(store.songList).toHaveLength(1)
      expect(store.songList[0].name).toBe('New Song')
    })

    it('allows direct songList updates', () => {
      const store = usePlayerStore()
      store.setSongList([
        createMockSong({ id: 1, name: 'Song 1' }),
        createMockSong({ id: 2, name: 'Song 2' }),
        createMockSong({ id: 3, name: 'Song 3' })
      ])

      store.songList = store.songList.filter(song => song.id !== 2)

      expect(store.songList).toHaveLength(2)
      expect(store.songList.find(song => song.id === 2)).toBeUndefined()
    })
  })

  describe('playback controls', () => {
    it('togglePlayMode cycles play modes', () => {
      const store = usePlayerStore()

      expect(store.playMode).toBe(PLAY_MODE.SEQUENTIAL)
      store.togglePlayMode()
      expect(store.playMode).toBe(PLAY_MODE.LIST_LOOP)
      store.togglePlayMode()
      expect(store.playMode).toBe(PLAY_MODE.SINGLE_LOOP)
      store.togglePlayMode()
      expect(store.playMode).toBe(PLAY_MODE.SHUFFLE)
      store.togglePlayMode()
      expect(store.playMode).toBe(PLAY_MODE.SEQUENTIAL)
    })

    it('setVolume sets volume', () => {
      const { store, audioManager } = createInjectedPlayerStore()
      store.setVolume(0.5)
      expect(store.volume).toBe(0.5)
      expect(audioManager.setVolume).toHaveBeenCalledWith(0.5)
    })

    it('setPlayMode falls back to sequential for invalid numeric input', () => {
      const store = usePlayerStore()

      store.setPlayMode(Number.NaN as never)

      expect(store.playMode).toBe(PLAY_MODE.SEQUENTIAL)
    })

    it('seek updates progress', () => {
      const { store, audioManager } = createInjectedPlayerStore()
      store.duration = 180
      store.seek(60)
      expect(store.progress).toBe(60)
      expect(audioManager.seek).toHaveBeenCalledWith(60)
    })

    it('resets playback state when togglePlay cannot start the first track', async () => {
      const { store, platformAccessor } = createInjectedPlayerStore()
      store.songList = [createMockSong({ id: 1, name: 'Song 1', url: 'http://test.com/1.mp3' })]
      store.playing = true
      vi.spyOn(store, 'playSongWithDetails').mockRejectedValueOnce(new Error('start failed'))

      store.togglePlay()
      await Promise.resolve()

      expect(store.playing).toBe(false)
      expect(platformAccessor.sendPlayingState).toHaveBeenCalledWith(false)
    })

    it('resets playback state when audioManager.toggle rejects', async () => {
      const { store, audioManager, platformAccessor } = createInjectedPlayerStore()
      store.initialized = true
      store.playing = true
      audioManager.toggle.mockRejectedValueOnce(new Error('toggle failed'))

      store.togglePlay()
      await Promise.resolve()

      expect(store.playing).toBe(false)
      expect(platformAccessor.sendPlayingState).toHaveBeenCalledWith(false)
    })

    it('falls back to the next track when single-loop replay fails at song end', async () => {
      const { store, audioManager, platformAccessor } = createInjectedPlayerStore()
      const playNextSpy = vi.spyOn(store, 'playNext').mockImplementation(() => {})
      store.playMode = PLAY_MODE.SINGLE_LOOP
      store.playing = true
      audioManager.play.mockRejectedValueOnce(new Error('replay failed'))

      store.handleSongEnd()
      await Promise.resolve()

      expect(audioManager.seek).toHaveBeenCalledWith(0)
      expect(store.playing).toBe(false)
      expect(platformAccessor.sendPlayingState).toHaveBeenCalledWith(false)
      expect(playNextSpy).toHaveBeenCalledTimes(1)
    })

    it('keeps the next selection and resets playback state when replaying after removal fails', async () => {
      const { store, platformAccessor } = createInjectedPlayerStore({ isElectron: true })
      const firstSong = createMockSong({ id: 1, name: 'Song 1', url: 'http://test.com/1.mp3' })
      const secondSong = createMockSong({ id: 2, name: 'Song 2', url: 'http://test.com/2.mp3' })

      store.songList = [firstSong, secondSong]
      store.currentIndex = 0
      store.currentSong = firstSong
      store.playing = true
      store.initAudio()
      platformAccessor.sendPlayingState.mockClear()

      vi.spyOn(store, 'playSongWithDetails').mockRejectedValueOnce(
        new Error('remove replay failed')
      )

      const onCalls = platformAccessor.on.mock.calls as unknown as Array<
        [string, (payload: unknown) => void]
      >
      const songControlListener = onCalls.find(
        ([channel]) => channel === 'music-song-control'
      )?.[1] as ((payload: unknown) => void) | undefined

      songControlListener?.({ type: 'remove-from-playlist', index: 0 })
      await Promise.resolve()

      expect(store.songList).toEqual([secondSong])
      expect(store.currentIndex).toBe(0)
      expect(store.currentSong).toStrictEqual(secondSong)
      expect(store.playing).toBe(false)
      expect(platformAccessor.sendPlayingState).toHaveBeenCalledWith(false)
    })

    it('does not loop with playNext when a local song audio error should skip', async () => {
      const { store } = createInjectedPlayerStore()
      const localSong = createMockSong({
        id: 'local:track-1',
        name: 'Local Song',
        url: 'luo-media://media?path=D%3A%5CMusic%5Clocal.mp3',
        extra: {
          localSource: true,
          localFilePath: 'D:\\Music\\local.mp3'
        }
      })

      store.songList = [localSong]
      store.currentIndex = 0
      store.currentSong = localSong

      const playNextSpy = vi.spyOn(store, 'playNext').mockImplementation(() => {})
      const playNextSkipUnavailableSpy = vi
        .spyOn(store, 'playNextSkipUnavailable')
        .mockRejectedValueOnce(new Error('no playable songs'))

      await store.handleAudioError(new Error('decode failed'))

      expect(playNextSkipUnavailableSpy).toHaveBeenCalledTimes(1)
      expect(playNextSpy).not.toHaveBeenCalled()
      expect(localSong.unavailable).toBe(true)
    })
  })

  describe('lyrics', () => {
    it('setLyric stores lyric payload', () => {
      const store = usePlayerStore()
      const lyricData = { lrc: { lyric: '[00:00.00]Test lyric' } }

      store.setLyric(lyricData)
      expect(store.lyric).toEqual(lyricData)
    })

    it('setLyricsArray stores parsed lyrics', () => {
      const store = usePlayerStore()
      const lyrics: LyricLine[] = [
        { time: 0, text: 'Line 1', trans: '', roma: '' },
        { time: 5, text: 'Line 2', trans: '', roma: '' }
      ]

      store.currentLyricIndex = 1
      store.setLyricsArray(lyrics)

      expect(store.lyricsArray).toHaveLength(2)
      expect(store.lyricsArray[0].text).toBe('Line 1')
      expect(store.currentLyricIndex).toBe(-1)
    })

    it('uses default lyricType', () => {
      const store = usePlayerStore()
      expect(store.lyricType).toEqual(['original', 'trans'])
    })

    it('toggles optional lyric layers without dropping original', () => {
      const store = usePlayerStore()

      store.toggleLyricType('trans')
      expect(store.lyricType).toEqual(['original'])

      store.toggleLyricType('roma')
      expect(store.lyricType).toEqual(['original', 'roma'])

      store.toggleLyricType('trans')
      expect(store.lyricType).toEqual(['original', 'roma', 'trans'])
    })

    it('restores original lyrics when toggling from a corrupted persisted lyricType state', () => {
      const store = usePlayerStore()

      store.lyricType = ['trans'] as Array<'original' | 'trans' | 'roma'>
      store.toggleLyricType('trans')
      expect(store.lyricType).toEqual(['original'])

      store.lyricType = ['roma'] as Array<'original' | 'trans' | 'roma'>
      store.toggleLyricType('trans')
      expect(store.lyricType).toEqual(['original', 'roma', 'trans'])
    })
  })

  describe('docked player mode', () => {
    beforeEach(() => {
      const store = usePlayerStore()
      store.setSongList([
        createMockSong({ id: 1, name: 'Song 1', url: 'http://test.com/1.mp3' }),
        createMockSong({ id: 2, name: 'Song 2', url: 'http://test.com/2.mp3' }),
        createMockSong({ id: 3, name: 'Song 3', url: 'http://test.com/3.mp3' })
      ])
    })

    it('togglePlayerDocked toggles the docked player mode', () => {
      const { store, storageService } = createInjectedPlayerStore()

      expect(store.isPlayerDocked).toBe(true)
      store.togglePlayerDocked()
      expect(store.isPlayerDocked).toBe(false)
      store.togglePlayerDocked()
      expect(store.isPlayerDocked).toBe(true)
      expect(storageService.setItem).toHaveBeenCalledWith('playerDockedUserToggled', 'true')
    })
  })
})
