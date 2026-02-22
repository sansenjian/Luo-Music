import { audioManager } from './audioManager'
import { PLAY_MODE, TIME_INTERVAL } from '../constants'
import { shuffleHelper } from '../helpers/shuffleHelper'

export class PlaybackController {
    constructor() {
        this.progressTimer = null
        this._lastProgressUpdate = 0
    }

    async play(url) {
        if (!url) {
            console.error('No URL provided for playback')
            return false
        }
        
        try {
            await audioManager.play(url)
            return true
        } catch (error) {
            console.error('Playback failed:', error)
            audioManager.emit('playbackError', error)
            throw error
        }
    }

    pause() {
        audioManager.pause()
    }

    toggle() {
        return audioManager.toggle()
    }

    seek(time) {
        audioManager.seek(time)
    }

    setVolume(volume) {
        audioManager.setVolume(volume)
    }

    setLoop(loop) {
        audioManager.setLoop(loop)
    }

    getNextIndex(currentIndex, songListLength, playMode, shuffledIndices = null, currentShuffleIndex = -1) {
        if (songListLength === 0) return -1

        if (playMode === PLAY_MODE.SHUFFLE && shuffledIndices) {
            return shuffleHelper.getNextShuffledIndex(shuffledIndices, currentShuffleIndex)
        }

        if (playMode === PLAY_MODE.SINGLE_LOOP) {
            return currentIndex
        }

        return (currentIndex + 1) % songListLength
    }

    getPrevIndex(currentIndex, songListLength, playMode, shuffledIndices = null, currentShuffleIndex = -1) {
        if (songListLength === 0) return -1

        if (playMode === PLAY_MODE.SHUFFLE && shuffledIndices) {
            return shuffleHelper.getPrevShuffledIndex(shuffledIndices, currentShuffleIndex)
        }

        if (playMode === PLAY_MODE.SINGLE_LOOP) {
            return currentIndex
        }

        return currentIndex <= 0 ? songListLength - 1 : currentIndex - 1
    }

    get duration() {
        return audioManager.duration
    }

    get currentTime() {
        return audioManager.currentTime
    }

    get paused() {
        return audioManager.paused
    }

    get volume() {
        return audioManager.getVolume()
    }

    destroy() {
        audioManager.destroy()
    }
}

export const playbackController = new PlaybackController()
