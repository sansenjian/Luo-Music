import { defineStore } from 'pinia'
import { usePlaylistStore } from './playlistStore'
import { usePlayerStore } from './playerStore'
import { getMusicAdapter } from '../platform/music'

export const useSearchStore = defineStore('searchStore', {
    state: () => {
        return {
            keyword: '',
            results: [],
            server: 'netease',
            isLoading: false,
            error: null,
            totalResults: 0
        }
    },
    getters: {
        hasResults: (state) => state.results.length > 0,
    },
    actions: {
        setServer(server) {
            this.server = server
        },
        
        async search(keyword) {
            if (!keyword || !keyword.trim()) {
                this.error = 'Please enter a search keyword'
                return
            }
            this.keyword = keyword.trim()
            this.isLoading = true
            this.error = null
            this.results = []
            
            try {
                const adapter = getMusicAdapter(this.server)
                const res = await adapter.search(this.keyword, 30, 1)
                
                if (res.list.length === 0) {
                    this.error = 'No results found'
                    this.totalResults = 0
                    return
                }
                
                this.totalResults = res.total
                
                // Convert normalized Song objects to UI model
                this.results = res.list.map((song, idx) => {
                    return {
                        index: idx,
                        id: song.id,
                        name: song.name,
                        artist: song.artists.map(a => a.name).join(' / '),
                        album: song.album.name || '',
                        pic: song.album.picUrl || '',
                        cover: song.album.picUrl || '', // Keep compatibility
                        url: null,
                        server: song.platform,
                        duration: Math.floor(song.duration / 1000), // Convert ms to seconds
                        // Extra fields needed for QQ playback if any
                        mediaId: song.mediaId
                    }
                })
            } catch (err) {
                console.error('Search error:', err)
                this.error = err.message || 'Search failed'
                this.results = []
            } finally {
                this.isLoading = false
            }
        },
        
        // ... keep other actions ...
        playResult(index) {
            if (index < 0 || index >= this.results.length) return
            const playlistStore = usePlaylistStore()
            const playerStore = usePlayerStore()
            // Note: playlistStore might need update if it expects different structure
            playlistStore.setPlaylist([...this.results])
            const song = playlistStore.playAt(index)
            if (song) {
                playerStore.setSongList([...this.results])
                // playSongByIndex will trigger playerStore logic
                playerStore.playSongByIndex(index)
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

