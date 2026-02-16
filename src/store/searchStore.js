import { defineStore } from 'pinia'
import { usePlaylistStore } from './playlistStore'
import { usePlayerStore } from './playerStore'
import { search as searchApi } from '../api/search'

export const useSearchStore = defineStore('searchStore', {
    state: () => {
        return {
            keyword: '',
            results: [],
            server: 'netease',
            isLoading: false,
            error: null,
        }
    },
    getters: {
        hasResults: (state) => state.results.length > 0,
        totalResults: (state) => state.results.length,
    },
    actions: {
        setServer(server) {
            this.server = server
        },
        setKeyword(keyword) {
            this.keyword = keyword
        },
        formatArtists(item) {
            if (item.artists && Array.isArray(item.artists) && item.artists.length > 0) {
                const names = item.artists.map(a => typeof a === 'string' ? a : (a.name || '')).filter(Boolean)
                if (names.length > 0) return names.join(' / ')
            }
            if (item.ar && Array.isArray(item.ar) && item.ar.length > 0) {
                const names = item.ar.map(a => typeof a === 'string' ? a : (a.name || '')).filter(Boolean)
                if (names.length > 0) return names.join(' / ')
            }
            if (item.singer) return typeof item.singer === 'string' ? item.singer : item.singer.map(s => s.name || s).join(' / ')
            if (item.artist) return typeof item.artist === 'string' ? item.artist : item.artist.map(a => a.name || a).join(' / ')
            if (item.author) return typeof item.author === 'string' ? item.author : item.author.join(' / ')
            return 'Unknown Artist'
        },
        extractId(item) {
            const possibleIds = [item.id, item.songid, item.mid, item.song?.id, item.songId, item.trackId, item.sid]
            for (const id of possibleIds) {
                if (id !== undefined && id !== null && id !== '') return String(id)
            }
            return ''
        },
        async search(keyword) {
            if (!keyword || !keyword.trim()) {
                this.error = 'Please enter a search keyword'
                return
            }
            this.keyword = keyword.trim()
            this.isLoading = true
            this.error = null
            try {
                const res = await searchApi(this.keyword, 1, 30)
                if (!res.result || !res.result.songs || res.result.songs.length === 0) {
                    this.results = []
                    this.error = 'No results found'
                    return
                }
                this.results = res.result.songs.map((item, idx) => {
                    const artist = this.formatArtists(item)
                    return {
                        index: idx,
                        id: this.extractId(item),
                        name: item.name || item.title || item.songname || 'Unknown',
                        artist: artist,
                        album: item.al?.name || item.album || item.albumname || '',
                        pic: item.al?.picUrl || item.pic || item.cover || '',
                        url: item.url || null,
                        server: this.server,
                        duration: Math.floor((item.dt || item.duration || 0) / 1000)
                    }
                }).filter(song => song.id !== '')
                if (this.results.length === 0) {
                    this.error = 'No valid tracks found'
                }
            } catch (err) {
                console.error('Search error:', err)
                this.error = err.message || 'Search failed'
                this.results = []
            } finally {
                this.isLoading = false
            }
        },
        async playResult(index) {
            if (index < 0 || index >= this.results.length) return
            const playlistStore = usePlaylistStore()
            const playerStore = usePlayerStore()
            playlistStore.setPlaylist([...this.results])
            const song = playlistStore.playAt(index)
            if (song) {
                playerStore.setSongList([...this.results])
                await playerStore.playSongByIndex(index)
            }
        },
        addToPlaylist(index) {
            if (index < 0 || index >= this.results.length) return
            const playlistStore = usePlaylistStore()
            playlistStore.addSong(this.results[index])
        },
        addAllToPlaylist() {
            const playlistStore = usePlaylistStore()
            playlistStore.addSongs(this.results)
        },
        clearResults() {
            this.results = []
            this.error = null
        },
    },
    persist: {
        storage: localStorage,
        paths: ['server']
    },
})
