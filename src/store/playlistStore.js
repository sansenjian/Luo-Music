import { defineStore } from 'pinia'
import { usePlayerStore } from './playerStore'

export const usePlaylistStore = defineStore('playlistStore', {
    state: () => {
        return {
            songs: [],
            currentIndex: -1,
        }
    },
    getters: {
        currentSong: (state) => {
            if (state.currentIndex >= 0 && state.currentIndex < state.songs.length) {
                return state.songs[state.currentIndex]
            }
            return null
        },
        hasSongs: (state) => state.songs.length > 0,
        totalSongs: (state) => state.songs.length,
    },
    actions: {
        setPlaylist(songs) {
            this.songs = songs
            this.currentIndex = songs.length > 0 ? 0 : -1
        },
        addSong(song) {
            this.songs.push(song)
        },
        addSongs(songs) {
            this.songs.push(...songs)
        },
        removeSong(index) {
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
            const playerStore = usePlayerStore()
            playerStore.clearPlaylist()
        },
        next() {
            if (this.songs.length === 0) return null
            const playerStore = usePlayerStore()
            let nextIndex = this.currentIndex + 1
            if (playerStore.playMode === 2) {
                nextIndex = Math.floor(Math.random() * this.songs.length)
            } else {
                if (nextIndex >= this.songs.length) {
                    nextIndex = playerStore.playMode === 1 ? 0 : this.songs.length - 1
                }
            }
            this.currentIndex = nextIndex
            return this.currentSong
        },
        prev() {
            if (this.songs.length === 0) return null
            const playerStore = usePlayerStore()
            let prevIndex = this.currentIndex - 1
            if (playerStore.playMode === 2) {
                prevIndex = Math.floor(Math.random() * this.songs.length)
            } else {
                if (prevIndex < 0) {
                    prevIndex = playerStore.playMode === 1 ? this.songs.length - 1 : 0
                }
            }
            this.currentIndex = prevIndex
            return this.currentSong
        },
        playAt(index) {
            if (index >= 0 && index < this.songs.length) {
                this.currentIndex = index
                return this.currentSong
            }
            return null
        },
        setCurrentIndex(index) {
            if (index >= -1 && index < this.songs.length) {
                this.currentIndex = index
            }
        },
    },
    persist: {
        storage: localStorage,
        paths: ['songs', 'currentIndex']
    },
})
