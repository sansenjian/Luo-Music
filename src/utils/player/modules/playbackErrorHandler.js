import { getMusicUrl } from '../../../api/song'
import { qqMusicApi } from '../../../api/qqmusic'
import { PLAY_MODE } from '../constants/playMode'

export class PlaybackErrorHandler {
  constructor(options = {}) {
    this.getState = options.getState || (() => ({}))
    this.onStateChange = options.onStateChange || (() => {})
    this.skipAttempts = 0
    this.maxSkipAttempts = 5
    this.lastSkipTime = 0
    this.skipCooldownMs = 3000
    this.unavailableSongs = []
  }

  async handleAudioError(error, currentSong) {
    this.onStateChange({ playing: false })

    if (currentSong && !currentSong.retryCount) {
      currentSong.retryCount = 1
      try {
        const urlRes = await this.retryGetMusicUrl(currentSong)
        if (urlRes?.url) {
          currentSong.url = urlRes.url
          return { shouldRetry: true, url: urlRes.url }
        }
      } catch (e) {
        console.error('Retry failed:', e)
      }
    }

    if (currentSong) {
      this.markAsUnavailable(currentSong)
    }

    return { shouldRetry: false, shouldSkip: true }
  }

  async retryGetMusicUrl(song) {
    if (song.server === 'qq') {
      const urlRes = await qqMusicApi.getMusicPlay(song.id, song.mediaId)
      return urlRes?.data?.playUrl?.[song.id]
    } else {
      const urlRes = await getMusicUrl(song.id, 'standard')
      return urlRes.data?.[0]
    }
  }

  markAsUnavailable(song) {
    song.unavailable = true
    song.errorMessage = '该歌曲无法播放（可能需要 VIP 或受版权限制）'
    if (!this.unavailableSongs.includes(song.id)) {
      this.unavailableSongs.push(song.id)
    }
  }

  shouldStopSkipping() {
    const now = Date.now()
    
    if (now - this.lastSkipTime < this.skipCooldownMs) {
      this.skipAttempts++
    } else {
      this.skipAttempts = 1
    }
    
    this.lastSkipTime = now
    
    if (this.skipAttempts >= this.maxSkipAttempts) {
      return true
    }
    
    const { songList } = this.getState()
    if (songList.length > 0 && this.unavailableSongs.length / songList.length > 0.8) {
      return true
    }
    
    return false
  }

  async playNextSkipUnavailable(playNext) {
    if (this.shouldStopSkipping()) {
      console.warn('Skip frequency limit reached or too many unavailable songs')
      throw new Error('播放列表中可用歌曲较少，请尝试其他歌单')
    }

    const { currentIndex, songList } = this.getState()
    const startIndex = currentIndex
    let attempts = 0
    const maxAttempts = Math.min(songList.length, 10)
    
    while (attempts < maxAttempts) {
      const newIndex = this.getNextAvailableIndex(startIndex, attempts)
      
      if (newIndex === startIndex && attempts > 0) {
        console.warn('All songs in playlist are unavailable')
        break
      }
      
      if (!songList[newIndex].unavailable) {
        try {
          await playNext(newIndex)
          this.skipAttempts = 0
          return
        } catch (error) {
          this.markAsUnavailable(songList[newIndex])
          attempts++
          continue
        }
      }
      
      attempts++
    }
    
    throw new Error('无法播放任何歌曲')
  }

  getNextAvailableIndex(startIndex, attempts) {
    const { songList, playMode } = this.getState()
    
    if (playMode === PLAY_MODE.SHUFFLE) {
      return Math.floor(Math.random() * songList.length)
    } else {
      return (startIndex + 1 + attempts) % songList.length
    }
  }

  reset() {
    this.skipAttempts = 0
    this.lastSkipTime = 0
    this.unavailableSongs = []
    const { songList } = this.getState()
    songList.forEach(song => {
      song.unavailable = false
      song.errorMessage = null
    })
  }

  getUnavailableSongs() {
    return this.unavailableSongs
  }
}
