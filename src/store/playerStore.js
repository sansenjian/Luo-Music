import { defineStore } from 'pinia'
import { audioManager } from '../utils/audioManager'
import { getMusicUrl, getLyric } from '../api/song'
import { parseLyric } from '../utils/lyric'

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
    loading: false, // New loading state
    isCompact: false, // Compact mode state
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
      this.playing = false
      
      // 尝试重新获取 URL 并重试
      if (this.currentSong && !this.currentSong.retryCount) {
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
      
      // 重试失败或已重试过，播放下一首
      this.playNext()
    },
    
    updateLyricIndex() {
      if (!this.lyricsArray || this.lyricsArray.length === 0) return

      const currentTime = this.progress

      // Use binary search for better performance with large lyrics
      let left = 0
      let right = this.lyricsArray.length - 1
      let index = -1

      while (left <= right) {
        const mid = Math.floor((left + right) / 2)
        if (this.lyricsArray[mid].time <= currentTime) {
          index = mid
          left = mid + 1
        } else {
          right = mid - 1
        }
      }

      if (this.currentLyricIndex !== index) {
        this.currentLyricIndex = index
      }
    },

    setSongList(songs) {
      this.songList = songs
      this.currentIndex = -1
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
           const urlRes = await getMusicUrl(song.id, 'standard')
           // Handle different API response formats
           // urlRes could be { data: [...] } or directly [...] depending on request interceptor
           const urlData = urlRes.data || urlRes
           if (urlData && urlData[0] && urlData[0].url) {
             song.url = urlData[0].url
             // Force update song in list if needed, but object ref should work
           } else {
             // API returned data but URL is null - likely due to copyright/VIP restrictions
             console.warn('Song URL unavailable (may require VIP or region restriction):', song.id)
             throw new Error('该歌曲无法播放（可能需要 VIP 或受版权限制）')
           }
        }

        // 2. Play
        await this.playSongByIndex(index)

        // 3. Get Lyrics
        try {
          const lyricRes = await getLyric(song.id)
          console.log('Lyric response:', lyricRes)
          if (lyricRes) {
            this.setLyric(lyricRes)
            // Handle different API response formats
            const lrcText = lyricRes.lrc?.lyric || lyricRes.lyric || ''
            // tlyric might be an object { lyric: '...' } or a string, or null
            let tlyricText = ''
            if (lyricRes.tlyric) {
              if (typeof lyricRes.tlyric === 'string') {
                tlyricText = lyricRes.tlyric
              } else if (lyricRes.tlyric.lyric && typeof lyricRes.tlyric.lyric === 'string') {
                tlyricText = lyricRes.tlyric.lyric
              }
            }
            // romalrc might also be an object or string
            let rlyricText = ''
            if (lyricRes.romalrc) {
              if (typeof lyricRes.romalrc === 'string') {
                rlyricText = lyricRes.romalrc
              } else if (lyricRes.romalrc.lyric && typeof lyricRes.romalrc.lyric === 'string') {
                rlyricText = lyricRes.romalrc.lyric
              }
            }
            console.log('Parsing lyrics:', { lrcText: lrcText?.substring(0, 100), tlyricText: tlyricText?.substring(0, 100) })
            const lyrics = parseLyric(lrcText, tlyricText, rlyricText)
            console.log('Parsed lyrics count:', lyrics.length)
            this.setLyricsArray(lyrics)
          }
        } catch (lyricError) {
          console.error('Failed to get lyrics:', lyricError)
          this.setLyricsArray([])
        }
      } catch (error) {
        console.error('Playback failed:', error)
        throw error 
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
    
    playPrev() {
      if (this.songList.length === 0) return
      
      let newIndex
      if (this.playMode === 3) {
        // 随机播放优化：避免重复播放当前歌曲
        newIndex = Math.floor(Math.random() * this.songList.length)
        if (this.songList.length > 1 && newIndex === this.currentIndex) {
          newIndex = (newIndex + 1) % this.songList.length
        }
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
        // 随机播放优化：避免重复播放当前歌曲
        newIndex = Math.floor(Math.random() * this.songList.length)
        if (this.songList.length > 1 && newIndex === this.currentIndex) {
          newIndex = (newIndex + 1) % this.songList.length
        }
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

function formatTime(seconds) {
  if (!isFinite(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}
