import { defineStore } from 'pinia'
import { audioManager } from '../utils/player/core/audioManager'
import { lyricProcessor } from '../utils/player/modules/lyricProcessor'
import { PLAY_MODE, PLAY_MODE_LABELS, PLAY_MODE_ICONS, SKIP_CONFIG, VOLUME } from '../utils/player/constants'
import { formatTime } from '../utils/player/helpers/timeFormatter'
import { shuffleHelper } from '../utils/player/helpers/shuffleHelper'
import { getMusicUrl, getLyric } from '../api/song'

export const usePlayerStore = defineStore('player', {
  state: () => ({
    playing: false,
    progress: 0,
    duration: 0,
    volume: VOLUME.DEFAULT,
    playMode: PLAY_MODE.SEQUENTIAL,
    songList: [],
    currentIndex: -1,
    currentSong: null,
    lyric: null,
    lyricsArray: [],
    currentLyricIndex: -1,
    lyricSize: 20,
    tlyricSize: 14,
    rlyricSize: 12,
    lyricType: ['original', 'trans'],
    showLyric: true,
    showPlaylist: false,
    initialized: false,
    loading: false,
    isCompact: false,
    skipAttempts: 0,
    lastSkipTime: 0,
    unavailableSongs: new Set(),
    shuffledIndices: [],
    currentShuffleIndex: -1
  }),
  
  getters: {
    hasSongs: (state) => state.songList.length > 0,
    
    currentSongInfo: (state) => {
      if (state.currentIndex >= 0 && state.currentIndex < state.songList.length) {
        return state.songList[state.currentIndex]
      }
      return null
    },
    
    formattedProgress: (state) => formatTime(state.progress),
    formattedDuration: (state) => formatTime(state.duration),
    
    playModeText: (state) => PLAY_MODE_LABELS[state.playMode] || '未知',
    
    playModeIcon: (state) => PLAY_MODE_ICONS[state.playMode] || PLAY_MODE_ICONS[PLAY_MODE.SEQUENTIAL],
    
    canPlayNext: (state) => {
      if (!state.songList || state.songList.length === 0) return false
      if (state.playMode === PLAY_MODE.SEQUENTIAL) {
        return state.currentIndex < state.songList.length - 1
      }
      return true
    },
    
    canPlayPrev: (state) => {
      if (!state.songList || state.songList.length === 0) return false
      return true
    }
  },
  
  actions: {
    _ensureSetInstance() {
      if (!(this.unavailableSongs instanceof Set)) {
        this.unavailableSongs = new Set()
      }
    },

    _addToUnavailable(songId) {
      this._ensureSetInstance()
      this.unavailableSongs.add(songId)
    },

    _getUnavailableCount() {
      this._ensureSetInstance()
      return this.unavailableSongs.size
    },

    initAudio() {
      if (this.initialized) return
      
      this.initialized = true
      audioManager.setVolume(this.volume)
      
      audioManager.on('timeupdate', () => {
        const currentTime = audioManager.currentTime
        const dur = audioManager.duration
        this.progress = currentTime
        if (dur && dur !== this.duration) {
          this.duration = dur
        }
        this.updateLyricIndex()
      })
      
      audioManager.on('loadedmetadata', () => {
        this.duration = audioManager.duration
      })
      
      audioManager.on('ended', () => {
        this.handleSongEnd()
      })
      
      audioManager.on('play', () => {
        this.playing = true
      })
      
      audioManager.on('pause', () => {
        this.playing = false
      })
      
      audioManager.on('error', (e) => {
        console.error('Audio error:', e)
        this.handleAudioError(e)
      })
    },
    
    async handleAudioError(error) {
      this.playing = false
      
      if (this.currentSong && this.currentSong.retryCount === undefined) {
        this.currentSong.retryCount = 1
        try {
          const urlRes = await getMusicUrl(this.currentSong.id, 'standard')
          if (urlRes.data?.[0]?.url) {
            this.currentSong.url = urlRes.data[0].url
            await audioManager.play(this.currentSong.url)
            this.playing = true
            return
          }
        } catch (e) {
          console.error('Retry failed:', e)
        }
      }
      
      this.playNextSkipUnavailable()
    },
    
    updateLyricIndex() {
      const result = lyricProcessor.updateCurrentIndex(this.progress)
      if (result.changed) {
        this.currentLyricIndex = result.index
      }
    },

    setSongList(songs) {
      console.log('setSongList called with:', songs?.length, 'songs')
      // 强制确保 unavailableSongs 是 Set
      if (!(this.unavailableSongs instanceof Set)) {
        console.log('Force resetting unavailableSongs to Set in setSongList')
        this.unavailableSongs = new Set()
      }
      this.songList = songs
      this.currentIndex = -1
      this.resetSkipState()
      // 重置歌词状态
      this.lyricsArray = []
      this.currentLyricIndex = -1
      lyricProcessor.clear()
    },
    
    addSong(song) {
      this.songList.push(song)
    },
    
    async playSongByIndex(index) {
      if (index < 0 || index >= this.songList.length) return
      
      this.initAudio()
      
      this.currentIndex = index
      this.currentSong = this.songList[index]
      
      // 重置进度和歌词
      this.progress = 0
      this.duration = 0
      this.currentLyricIndex = -1
      
      if (!this.currentSong.url) {
        console.error('No URL for song')
        return
      }
      
      try {
        await audioManager.play(this.currentSong.url)
      } catch (error) {
        console.error('播放失败:', error)
        this.playing = false
        throw error
      }
    },

    async playSongWithDetails(index) {
      const song = this.songList[index]
      if (!song) return

      this.loading = true
      try {
        if (!song.url) {
           const urlRes = await getMusicUrl(song.id, 'standard')
           const urlData = urlRes.data || urlRes
           if (urlData && urlData[0] && urlData[0].url) {
             song.url = urlData[0].url
           } else {
             console.warn('Song URL unavailable:', song.id)
             throw new Error('该歌曲无法播放（可能需要 VIP 或受版权限制）')
           }
        }

        await this.playSongByIndex(index)

        try {
          const lyricRes = await getLyric(song.id)
          if (lyricRes) {
            this.setLyric(lyricRes)
            const lrcText = lyricRes.lrc?.lyric || lyricRes.lyric || ''
            let tlyricText = ''
            if (lyricRes.tlyric) {
              tlyricText = typeof lyricRes.tlyric === 'string' 
                ? lyricRes.tlyric 
                : lyricRes.tlyric.lyric || ''
            }
            let rlyricText = ''
            if (lyricRes.romalrc) {
              rlyricText = typeof lyricRes.romalrc === 'string' 
                ? lyricRes.romalrc 
                : lyricRes.romalrc.lyric || ''
            }
            const lyrics = lyricProcessor.parseAndSet(lrcText, tlyricText, rlyricText)
            this.setLyricsArray(lyrics)
          }
        } catch (lyricError) {
          console.error('Failed to get lyrics:', lyricError)
          this.setLyricsArray([])
        }
      } catch (error) {
        console.error('Playback failed:', error)
        if (this.songList[index]) {
          this.songList[index].unavailable = true
          this.songList[index].errorMessage = error.message
          this._addToUnavailable(this.songList[index].id)
        }
        if (this.shouldStopSkipping()) {
          console.warn('Too many failed songs, stopping auto-skip')
          throw new Error('播放列表中可用歌曲较少，请尝试其他歌单')
        }
        await this.playNextSkipUnavailable()
        throw error 
      } finally {
        this.loading = false
      }
    },
    
    togglePlay() {
      if (!this.initialized) {
        if (this.songList.length > 0) {
          this.playSongWithDetails(0)
        }
        return
      }
      
      audioManager.toggle()
    },
    
    playPrev() {
      if (this.songList.length === 0) return
      
      let newIndex
      if (this.playMode === PLAY_MODE.SHUFFLE) {
        newIndex = this._getShuffledIndex(-1)
      } else {
        newIndex = this.currentIndex - 1
        if (newIndex < 0) {
          newIndex = this.songList.length - 1
        }
      }
      
      this.playSongWithDetails(newIndex).catch(err => {
        console.error('播放上一首失败:', err)
      })
    },
    
    playNext() {
      if (this.songList.length === 0) return
      
      let newIndex
      if (this.playMode === PLAY_MODE.SHUFFLE) {
        newIndex = this._getShuffledIndex(1)
      } else {
        newIndex = this.currentIndex + 1
        if (newIndex >= this.songList.length) {
          if (this.playMode === PLAY_MODE.SEQUENTIAL) {
            return
          }
          newIndex = 0
        }
      }
      
      this.playSongWithDetails(newIndex).catch(err => {
        console.error('播放下一首失败:', err)
      })
    },

    _getShuffledIndex(direction) {
      if (this.shuffledIndices.length === 0 || this.shuffledIndices.length !== this.songList.length) {
        this.initShuffleMode()
      }
      
      this.currentShuffleIndex = (this.currentShuffleIndex + direction + this.shuffledIndices.length) % this.shuffledIndices.length
      return this.shuffledIndices[this.currentShuffleIndex]
    },
    
    handleSongEnd() {
      if (this.playMode === PLAY_MODE.SINGLE_LOOP) {
        audioManager.seek(0)
        audioManager.play()
      } else {
        this.playNext()
      }
    },

    shouldStopSkipping() {
      const now = Date.now()
      
      if (now - this.lastSkipTime < SKIP_CONFIG.COOLDOWN_MS) {
        this.skipAttempts++
      } else {
        this.skipAttempts = 1
      }
      
      this.lastSkipTime = now
      
      if (this.skipAttempts >= SKIP_CONFIG.MAX_ATTEMPTS) {
        return true
      }
      
      if (this.songList.length > 0 && 
          this._getUnavailableCount() / this.songList.length > SKIP_CONFIG.MAX_UNAVAILABLE_RATIO) {
        return true
      }
      
      return false
    },

    async playNextSkipUnavailable() {
      if (this.songList.length === 0) return
      
      if (this.shouldStopSkipping()) {
        console.warn('Skip frequency limit reached or too many unavailable songs')
        return
      }
      
      const startIndex = this.currentIndex
      let attempts = 0
      const maxAttempts = Math.min(this.songList.length, 10)
      
      while (attempts < maxAttempts) {
        let newIndex
        if (this.playMode === PLAY_MODE.SHUFFLE) {
          newIndex = Math.floor(Math.random() * this.songList.length)
        } else {
          newIndex = (this.currentIndex + 1) % this.songList.length
        }
        
        if (newIndex === startIndex && attempts > 0) {
          console.warn('All songs in playlist are unavailable')
          break
        }
        
        if (newIndex >= 0 && newIndex < this.songList.length && !this.songList[newIndex].unavailable) {
          try {
            await this.playSongWithDetails(newIndex)
            this.skipAttempts = 0
            return
          } catch (error) {
            this.songList[newIndex].unavailable = true
            this._addToUnavailable(this.songList[newIndex].id)
            attempts++
            continue
          }
        }
        
        attempts++
        this.currentIndex = newIndex
      }
      
      console.error('No available songs to play after', maxAttempts, 'attempts')
    },

    resetSkipState() {
      console.log('resetSkipState called, unavailableSongs type:', typeof this.unavailableSongs, this.unavailableSongs instanceof Set)
      this.skipAttempts = 0
      this.lastSkipTime = 0
      if (this.unavailableSongs instanceof Set) {
        this.unavailableSongs.clear()
      } else {
        this.unavailableSongs = new Set()
      }
      if (this.songList && Array.isArray(this.songList)) {
        this.songList.forEach(song => {
          song.unavailable = false
          song.errorMessage = null
        })
      }
    },
    
    seek(time) {
      audioManager.seek(time)
      this.progress = time
      // 立即更新歌词索引
      this.updateLyricIndex()
    },
    
    setVolume(vol) {
      this.volume = Math.max(VOLUME.MIN, Math.min(VOLUME.MAX, vol))
      audioManager.setVolume(this.volume)
    },
    
    togglePlayMode() {
      const modeCount = Object.keys(PLAY_MODE).length
      this.playMode = (this.playMode + 1) % modeCount
      
      if (this.playMode === PLAY_MODE.SHUFFLE) {
        this.initShuffleMode()
      } else {
        this.shuffledIndices = []
        this.currentShuffleIndex = -1
      }
    },
    
    initShuffleMode() {
      this.shuffledIndices = shuffleHelper.generateShuffledIndices(
        this.songList.length,
        this.currentIndex
      )
      this.currentShuffleIndex = 0
    },
    
    setLyric(lyric) {
      this.lyric = lyric
    },
    
    toggleCompactMode() {
      this.isCompact = !this.isCompact
    },

    setLyricsArray(lyrics) {
      this.lyricsArray = lyrics
      lyricProcessor.setLyrics(lyrics)
    },
    
    clearPlaylist() {
      this.songList = []
      this.currentIndex = -1
      this.currentSong = null
      audioManager.pause()
      this.playing = false
      this.progress = 0
      this.duration = 0
      lyricProcessor.clear()
      this.lyricsArray = []
      this.currentLyricIndex = -1
    },
    
    destroy() {
      audioManager.off('timeupdate')
      audioManager.off('loadedmetadata')
      audioManager.off('ended')
      audioManager.off('play')
      audioManager.off('pause')
      audioManager.off('error')
      this.initialized = false
    },
  },
  
  persist: {
    storage: localStorage,
    paths: ['volume', 'playMode', 'lyricType', 'isCompact'],
    beforeRestore: (context) => {
      console.log('Restoring player state...')
    },
    afterRestore: (context) => {
      console.log('afterRestore called, unavailableSongs before:', typeof context.store.unavailableSongs, context.store.unavailableSongs instanceof Set)
      if (context.store.volume < 0 || context.store.volume > 1) {
        context.store.volume = VOLUME.DEFAULT
      }
      if (context.store.playMode < 0 || context.store.playMode > 3) {
        context.store.playMode = PLAY_MODE.SEQUENTIAL
      }
      if (!Array.isArray(context.store.lyricType) || context.store.lyricType.length === 0) {
        context.store.lyricType = ['original', 'trans']
      }
      if (!(context.store.unavailableSongs instanceof Set)) {
        console.log('Resetting unavailableSongs to Set')
        context.store.unavailableSongs = new Set()
      }
      console.log('afterRestore done, unavailableSongs after:', typeof context.store.unavailableSongs, context.store.unavailableSongs instanceof Set)
    }
  },
})
