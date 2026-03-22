import { PLAY_MODE } from '../constants'
import { shuffleHelper } from '../helpers/shuffleHelper'
import type { Song } from '@/platform/music/interface'

export interface Playlist {
  list: Song[]
  currentIndex: number
  playMode: number
}

export interface PlaylistInfo {
  length: number
  currentIndex: number
  playMode: number
  hasCurrentSong: boolean
  currentSong: Song | null
}

export class PlaylistManager {
  private shuffledIndices: number[] = []
  private currentShuffleIndex: number = -1

  createPlaylist(songs?: Song[]): Playlist {
    return {
      list: songs || [],
      currentIndex: -1,
      playMode: PLAY_MODE.SEQUENTIAL
    }
  }

  setPlaylist(playlist: Playlist, songs: Song[]) {
    playlist.list = songs
    playlist.currentIndex = -1
    this.shuffledIndices = []
    this.currentShuffleIndex = -1
  }

  addToPlaylist(playlist: Playlist, song: Song) {
    playlist.list.push(song)
    this.shuffledIndices = []
  }

  removeFromPlaylist(playlist: Playlist, index: number): Song | null {
    if (index < 0 || index >= playlist.list.length) return null

    const removed = playlist.list.splice(index, 1)[0]

    if (playlist.currentIndex >= playlist.list.length) {
      playlist.currentIndex = playlist.list.length - 1
    } else if (index < playlist.currentIndex) {
      playlist.currentIndex--
    }

    this.shuffledIndices = []
    return removed
  }

  clearPlaylist(playlist: Playlist) {
    playlist.list = []
    playlist.currentIndex = -1
    this.shuffledIndices = []
    this.currentShuffleIndex = -1
  }

  getCurrentSong(playlist: Playlist): Song | null {
    if (playlist.currentIndex >= 0 && playlist.currentIndex < playlist.list.length) {
      return playlist.list[playlist.currentIndex]
    }
    return null
  }

  getNextSong(playlist: Playlist): Song | null {
    if (playlist.list.length === 0) return null

    const nextIndex = this.getNextIndex(playlist)
    return playlist.list[nextIndex]
  }

  getPrevSong(playlist: Playlist): Song | null {
    if (playlist.list.length === 0) return null

    const prevIndex = this.getPrevIndex(playlist)
    return playlist.list[prevIndex]
  }

  getNextIndex(playlist: Playlist): number {
    const { list, currentIndex, playMode } = playlist

    if (list.length === 0) return -1

    if (playMode === PLAY_MODE.SHUFFLE) {
      this.currentShuffleIndex = shuffleHelper.getNextShuffledIndex(
        this.shuffledIndices,
        this.currentShuffleIndex
      )
      return this.shuffledIndices[this.currentShuffleIndex]
    }

    if (playMode === PLAY_MODE.SINGLE_LOOP) {
      return currentIndex
    }

    return (currentIndex + 1) % list.length
  }

  getPrevIndex(playlist: Playlist): number {
    const { list, currentIndex, playMode } = playlist

    if (list.length === 0) return -1

    if (playMode === PLAY_MODE.SHUFFLE) {
      this.currentShuffleIndex = shuffleHelper.getPrevShuffledIndex(
        this.shuffledIndices,
        this.currentShuffleIndex
      )
      return this.shuffledIndices[this.currentShuffleIndex]
    }

    if (playMode === PLAY_MODE.SINGLE_LOOP) {
      return currentIndex
    }

    return currentIndex <= 0 ? list.length - 1 : currentIndex - 1
  }

  setPlayMode(playlist: Playlist, mode: number) {
    const validModes: number[] = [
      PLAY_MODE.SEQUENTIAL,
      PLAY_MODE.LIST_LOOP,
      PLAY_MODE.SINGLE_LOOP,
      PLAY_MODE.SHUFFLE
    ]

    if (!validModes.includes(mode)) return

    playlist.playMode = mode

    if (mode === PLAY_MODE.SHUFFLE) {
      this.initShuffle(playlist)
    } else {
      this.shuffledIndices = []
      this.currentShuffleIndex = -1
    }
  }

  cyclePlayMode(playlist: Playlist): number {
    const nextMode = (playlist.playMode + 1) % 4
    this.setPlayMode(playlist, nextMode)
    return nextMode
  }

  initShuffle(playlist: Playlist) {
    this.shuffledIndices = shuffleHelper.generateShuffledIndices(
      playlist.list.length,
      playlist.currentIndex
    )
    this.currentShuffleIndex = 0
  }

  findSongIndex(playlist: Playlist, songId: string | number): number {
    return playlist.list.findIndex(song => song.id === songId)
  }

  isSongInPlaylist(playlist: Playlist, songId: string | number): boolean {
    return this.findSongIndex(playlist, songId) !== -1
  }

  addToNext(playlist: Playlist, song: Song) {
    if (!song) return

    const existingIndex = this.findSongIndex(playlist, song.id)
    if (existingIndex !== -1) {
      playlist.list.splice(existingIndex, 1)
      if (existingIndex < playlist.currentIndex) {
        playlist.currentIndex--
      }
    }

    playlist.list.splice(playlist.currentIndex + 1, 0, song)
    this.shuffledIndices = []
  }

  getPlaylistInfo(playlist: Playlist): PlaylistInfo {
    return {
      length: playlist.list.length,
      currentIndex: playlist.currentIndex,
      playMode: playlist.playMode,
      hasCurrentSong: this.getCurrentSong(playlist) !== null,
      currentSong: this.getCurrentSong(playlist)
    }
  }
}

export const playlistManager = new PlaylistManager()
