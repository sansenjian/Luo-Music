import { playerCore as audioManager } from './playerCore'
import { PLAY_MODE } from '../constants/playMode'
import { shuffleHelper } from '../helpers/shuffleHelper'

export class PlaybackController {
  private progressTimer: ReturnType<typeof setInterval> | null = null
  private _lastProgressUpdate: number = 0

  async play(url: string): Promise<boolean> {
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

  seek(time: number) {
    audioManager.seek(time)
  }

  setVolume(volume: number) {
    audioManager.setVolume(volume)
  }

  setLoop(loop: boolean) {
    audioManager.setLoop(loop)
  }

  getNextIndex(
    currentIndex: number, 
    songListLength: number, 
    playMode: number, 
    shuffledIndices: number[] | null = null, 
    currentShuffleIndex: number = -1
  ): number {
    if (songListLength === 0) return -1

    if (playMode === PLAY_MODE.SHUFFLE && shuffledIndices) {
      return shuffleHelper.getNextShuffledIndex(shuffledIndices, currentShuffleIndex)
    }

    if (playMode === PLAY_MODE.SINGLE_LOOP) {
      return currentIndex
    }

    return (currentIndex + 1) % songListLength
  }

  getPrevIndex(
    currentIndex: number, 
    songListLength: number, 
    playMode: number, 
    shuffledIndices: number[] | null = null, 
    currentShuffleIndex: number = -1
  ): number {
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
