import { defineStore } from 'pinia'
import { storageAdapter } from '@/services/storageService'

type PlaylistSong = {
  id: string | number
}

interface PlaylistState {
  songs: PlaylistSong[]
  currentIndex: number
}

export const usePlaylistStore = defineStore('playlistStore', {
  state: (): PlaylistState => ({
    songs: [],
    currentIndex: -1
  }),
  getters: {
    currentSong: (state): PlaylistSong | null => {
      if (state.currentIndex >= 0 && state.currentIndex < state.songs.length) {
        return state.songs[state.currentIndex]
      }
      return null
    },
    hasSongs: (state): boolean => state.songs.length > 0,
    totalSongs: (state): number => state.songs.length
  },
  actions: {
    setPlaylist(songs: PlaylistSong[]) {
      this.songs = songs
      this.currentIndex = songs.length > 0 ? 0 : -1
    },
    addSong(song: PlaylistSong) {
      this.songs.push(song)
    },
    addSongs(songs: PlaylistSong[]) {
      this.songs.push(...songs)
    },
    removeSong(index: number) {
      if (index >= 0 && index < this.songs.length) {
        this.songs.splice(index, 1)
        if (this.currentIndex >= this.songs.length) {
          this.currentIndex = this.songs.length - 1
        }
        if (this.songs.length === 0) {
          this.currentIndex = -1
        }
      }
    },
    clearPlaylist() {
      this.songs = []
      this.currentIndex = -1
    },
    next(playMode = 0): PlaylistSong | null {
      if (this.songs.length === 0) return null
      let nextIndex = this.currentIndex + 1
      if (playMode === 3) {
        nextIndex = Math.floor(Math.random() * this.songs.length)
      } else if (nextIndex >= this.songs.length) {
        nextIndex = playMode === 1 ? 0 : this.songs.length - 1
      }
      this.currentIndex = nextIndex
      return this.currentSong
    },
    prev(playMode = 0): PlaylistSong | null {
      if (this.songs.length === 0) return null
      let prevIndex = this.currentIndex - 1
      if (playMode === 3) {
        prevIndex = Math.floor(Math.random() * this.songs.length)
      } else if (prevIndex < 0) {
        prevIndex = playMode === 1 ? this.songs.length - 1 : 0
      }
      this.currentIndex = prevIndex
      return this.currentSong
    },
    playAt(index: number): PlaylistSong | null {
      if (index >= 0 && index < this.songs.length) {
        this.currentIndex = index
        return this.currentSong
      }
      return null
    },
    setCurrentIndex(index: number) {
      if (index >= -1 && index < this.songs.length) {
        this.currentIndex = index
      }
    }
  },
  persist: {
    storage: storageAdapter,
    pick: ['currentIndex']
  }
})
