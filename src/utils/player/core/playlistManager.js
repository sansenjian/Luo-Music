import { PLAY_MODE } from '../constants'
import { shuffleHelper } from '../helpers/shuffleHelper'

export class PlaylistManager {
    constructor() {
        this.shuffledIndices = []
        this.currentShuffleIndex = -1
    }

    createPlaylist(songs) {
        return {
            list: songs || [],
            currentIndex: -1,
            playMode: PLAY_MODE.SEQUENTIAL
        }
    }

    setPlaylist(playlist, songs) {
        playlist.list = songs
        playlist.currentIndex = -1
        this.shuffledIndices = []
        this.currentShuffleIndex = -1
    }

    addToPlaylist(playlist, song) {
        playlist.list.push(song)
        this.shuffledIndices = []
    }

    removeFromPlaylist(playlist, index) {
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

    clearPlaylist(playlist) {
        playlist.list = []
        playlist.currentIndex = -1
        this.shuffledIndices = []
        this.currentShuffleIndex = -1
    }

    getCurrentSong(playlist) {
        if (playlist.currentIndex >= 0 && playlist.currentIndex < playlist.list.length) {
            return playlist.list[playlist.currentIndex]
        }
        return null
    }

    getNextSong(playlist) {
        if (playlist.list.length === 0) return null
        
        const nextIndex = this.getNextIndex(playlist)
        return playlist.list[nextIndex]
    }

    getPrevSong(playlist) {
        if (playlist.list.length === 0) return null
        
        const prevIndex = this.getPrevIndex(playlist)
        return playlist.list[prevIndex]
    }

    getNextIndex(playlist) {
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

    getPrevIndex(playlist) {
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

    setPlayMode(playlist, mode) {
        const validModes = [PLAY_MODE.SEQUENTIAL, PLAY_MODE.LIST_LOOP, PLAY_MODE.SINGLE_LOOP, PLAY_MODE.SHUFFLE]
        
        if (!validModes.includes(mode)) return
        
        playlist.playMode = mode
        
        if (mode === PLAY_MODE.SHUFFLE) {
            this.initShuffle(playlist)
        } else {
            this.shuffledIndices = []
            this.currentShuffleIndex = -1
        }
    }

    cyclePlayMode(playlist) {
        const nextMode = (playlist.playMode + 1) % 4
        this.setPlayMode(playlist, nextMode)
        return nextMode
    }

    initShuffle(playlist) {
        this.shuffledIndices = shuffleHelper.generateShuffledIndices(
            playlist.list.length, 
            playlist.currentIndex
        )
        this.currentShuffleIndex = 0
    }

    findSongIndex(playlist, songId) {
        return playlist.list.findIndex(song => song.id === songId)
    }

    isSongInPlaylist(playlist, songId) {
        return this.findSongIndex(playlist, songId) !== -1
    }

    addToNext(playlist, song) {
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

    getPlaylistInfo(playlist) {
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
