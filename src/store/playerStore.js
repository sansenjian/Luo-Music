import { defineStore } from 'pinia'
import { audioManager } from '../utils/audioManager'
import { getMusicUrl, getLyric } from '../api/song'
import { qqMusicApi } from '../api/qqmusic'
import { parseLyric, findCurrentLyricIndex } from '../utils/lyric'
import { formatTime } from '../utils/player/helpers/timeFormatter'
import { PlaybackErrorHandler } from '../utils/player/modules/playbackErrorHandler'

export const usePlayerStore = defineStore('player', {
  state: () => ({
    playing: false,
    progress: 0,
    duration: 0,
    volume: 0.7,
    playMode: 0,
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
    errorHandler: null,
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
    
    playModeText: (state) => {
      const modes = ['顺序播放', '列表循环', '单曲循环', '随机播放']
      return modes[state.playMode]
    },
  },
  
  actions: {
    initAudio() {
      if (this.initialized) return
      
      this.initialized = true
      audioManager.setVolume(this.volume)
      
      // 先清理旧事件，防止 HMR 或热重置时事件累积
      audioManager.off('timeupdate')
      audioManager.off('loadedmetadata')
      audioManager.off('ended')
      audioManager.off('play')
      audioManager.off('pause')
      audioManager.off('error')
      
      // 节流处理 timeupdate，每 100ms 更新一次
      let lastUpdate = 0
      audioManager.on('timeupdate', () => {
        const now = Date.now()
        if (now - lastUpdate < 100) return
        lastUpdate = now
        
        this.progress = audioManager.currentTime
        this.updateLyricIndex() // Sync lyric
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
      if (!this.errorHandler) {
        this.errorHandler = new PlaybackErrorHandler(this)
      }
      
      const result = await this.errorHandler.handleAudioError(error, this.currentSong)
      
      if (result.shouldRetry && result.url) {
        await audioManager.play(result.url)
        this.playing = true
      } else if (result.shouldSkip) {
        this.playNext()
      }
    },
    
    updateLyricIndex() {
      const index = findCurrentLyricIndex(this.lyricsArray, this.progress)
      if (this.currentLyricIndex !== index) {
        this.currentLyricIndex = index
      }
    },

    setSongList(songs) {
      this.songList = songs
      this.currentIndex = -1
      this.resetErrorHandler()
    },
    
    addSong(song) {
      this.songList.push(song)
    },
    
    // Internal use or simple play
    async playSongByIndex(index) {
      if (index < 0 || index >= this.songList.length) return
      
      this.initAudio()
      
      this.currentIndex = index
      this.currentSong = this.songList[index]
      
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

    // Comprehensive play action with URL fetching and lyrics
    async playSongWithDetails(index) {
      const song = this.songList[index]
      if (!song) return

      this.loading = true
      try {
        // 1. Get URL if missing
        if (!song.url) {
          if (song.server === 'qq') {
            const urlRes = await qqMusicApi.getMusicPlay(song.id, song.mediaId)
            const playUrl = urlRes?.data?.playUrl?.[song.id]
            if (playUrl && playUrl.url) {
              song.url = playUrl.url
            } else {
              console.warn('QQ Music URL unavailable:', song.id, playUrl?.error)
              throw new Error('该歌曲无法播放（可能需要 VIP 或受版权限制）')
            }
          } else {
            const urlRes = await getMusicUrl(song.id, 'standard')
            const urlData = urlRes.data || urlRes
            if (urlData && urlData[0] && urlData[0].url) {
              song.url = urlData[0].url
            } else {
              console.warn('Song URL unavailable (may require VIP or region restriction):', song.id)
              throw new Error('该歌曲无法播放（可能需要 VIP 或受版权限制）')
            }
          }
        }

        // 2. Play
        await this.playSongByIndex(index)

        // 3. Get Lyrics
        try {
          let lrcText = ''
          let tlyricText = ''
          let rlyricText = ''
          
          if (song.server === 'qq') {
            const lyricRes = await qqMusicApi.getLyric(song.id, false)
            if (lyricRes && lyricRes.response) {
              lrcText = lyricRes.response.lyric?.lyric || ''
              tlyricText = lyricRes.response.trans || ''
              console.log('QQ Music lyric:', {
                hasLrc: !!lrcText,
                hasTrans: !!tlyricText,
                transLength: tlyricText?.length || 0
              })
            }
          } else {
            const lyricRes = await getLyric(song.id)
            if (lyricRes) {
              this.setLyric(lyricRes)
              lrcText = lyricRes.lrc?.lyric || lyricRes.lyric || ''
              if (lyricRes.tlyric) {
                if (typeof lyricRes.tlyric === 'string') {
                  tlyricText = lyricRes.tlyric
                } else if (lyricRes.tlyric.lyric && typeof lyricRes.tlyric.lyric === 'string') {
                  tlyricText = lyricRes.tlyric.lyric
                }
              }
              if (lyricRes.romalrc) {
                if (typeof lyricRes.romalrc === 'string') {
                  rlyricText = lyricRes.romalrc
                } else if (lyricRes.romalrc.lyric && typeof lyricRes.romalrc.lyric === 'string') {
                  rlyricText = lyricRes.romalrc.lyric
                }
              }
            }
          }
          
          const lyrics = parseLyric(lrcText, tlyricText, rlyricText)
          this.setLyricsArray(lyrics)
        } catch (lyricError) {
          console.error('Failed to get lyrics:', lyricError)
          this.setLyricsArray([])
        }
      } catch (error) {
        console.error('Playback failed:', error)
        
        if (!this.errorHandler) {
          this.errorHandler = new PlaybackErrorHandler(this)
        }
        this.errorHandler.markAsUnavailable(this.songList[index])
        
        try {
          await this.playNextSkipUnavailable()
          return
        } catch (skipError) {
          throw new Error('无法播放任何歌曲')
        }
      } finally {
        this.loading = false
      }
    },
    
    togglePlay() {
      if (!this.initialized) {
        if (this.songList.length > 0) {
          this.playSongWithDetails(0) // Use detailed play
        }
        return
      }
      
      audioManager.toggle()
    },
    
    // 统一的随机播放辅助函数
    getRandomIndex(excludeCurrent = true) {
      if (this.songList.length === 0) return -1
      if (this.songList.length === 1) return 0
      
      let newIndex = Math.floor(Math.random() * this.songList.length)
      // 避免重复播放当前歌曲
      if (excludeCurrent && newIndex === this.currentIndex) {
        newIndex = (newIndex + 1) % this.songList.length
      }
      return newIndex
    },
    
    playPrev() {
      if (this.songList.length === 0) return
      
      let newIndex
      if (this.playMode === 3) {
        newIndex = this.getRandomIndex()
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
      if (this.playMode === 3) {
        newIndex = this.getRandomIndex()
      } else {
        newIndex = this.currentIndex + 1
        if (newIndex >= this.songList.length) {
          if (this.playMode === 0) {
            return
          }
          newIndex = 0
        }
      }
      
      this.playSongWithDetails(newIndex).catch(err => {
        console.error('播放下一首失败:', err)
      })
    },
    
    handleSongEnd() {
      if (this.playMode === 2) {
        audioManager.seek(0)
        audioManager.play()
      } else {
        this.playNext()
      }
    },

    async playNextSkipUnavailable() {
      if (!this.errorHandler) {
        this.errorHandler = new PlaybackErrorHandler(this)
      }
      await this.errorHandler.playNextSkipUnavailable((index) => this.playSongWithDetails(index))
    },

    resetErrorHandler() {
      if (this.errorHandler) {
        this.errorHandler.reset()
      }
    },
    
    seek(time) {
      audioManager.seek(time)
      this.progress = time
    },
    
    setVolume(vol) {
      this.volume = Math.max(0, Math.min(1, vol))
      audioManager.setVolume(this.volume)
    },
    
    togglePlayMode() {
      this.playMode = (this.playMode + 1) % 4
    },
    
    setLyric(lyric) {
      this.lyric = lyric
    },
    
    toggleCompactMode() {
      this.isCompact = !this.isCompact
      // 标记用户已显式设置过紧凑模式偏好
      localStorage.setItem('compactModeUserToggled', 'true')
    },

    setLyricsArray(lyrics) {
      this.lyricsArray = lyrics
    },
    
    clearPlaylist() {
      this.songList = []
      this.currentIndex = -1
      this.currentSong = null
      audioManager.pause()
      this.playing = false
      this.progress = 0
      this.duration = 0
      this.resetErrorHandler()
    },
  },
  
  persist: {
    storage: localStorage,
    paths: ['volume', 'playMode', 'lyricType', 'isCompact'],
    // Note: songList and currentIndex are excluded to avoid stale URL issues
    // Songs will be re-fetched when needed
    beforeRestore: (context) => {
      // 数据恢复前验证
      console.log('Restoring player state...')
    },
    afterRestore: (context) => {
      // 验证音量范围
      if (context.store.volume < 0 || context.store.volume > 1) {
        context.store.volume = 0.7
      }
      // 设置音量到 audioManager
      if (context.store.initialized) {
        audioManager.setVolume(context.store.volume)
      }
      // 验证播放模式
      if (context.store.playMode < 0 || context.store.playMode > 3) {
        context.store.playMode = 0
      }
      // 验证歌词类型
      if (!Array.isArray(context.store.lyricType) || context.store.lyricType.length === 0) {
        context.store.lyricType = ['original', 'trans']
      }
    }
  },
})
