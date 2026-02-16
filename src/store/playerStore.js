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
      
      audioManager.on('timeupdate', () => {
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
        this.playing = false
      })
    },
    
    updateLyricIndex() {
      if (!this.lyricsArray || this.lyricsArray.length === 0) return
      
      const currentTime = this.progress
      
      // Find the last lyric line that is <= current time
      // This is a simple linear search. For large lyrics, binary search would be better.
      let index = -1
      for (let i = 0; i < this.lyricsArray.length; i++) {
        if (currentTime >= this.lyricsArray[i].time) {
          index = i
        } else {
          break
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
           if (urlRes.data && urlRes.data[0] && urlRes.data[0].url) {
             song.url = urlRes.data[0].url
             // Force update song in list if needed, but object ref should work
           } else {
             throw new Error('Unable to get playback URL')
           }
        }

        // 2. Play
        await this.playSongByIndex(index)

        // 3. Get Lyrics
        const lyricRes = await getLyric(song.id)
        if (lyricRes) {
           this.setLyric(lyricRes)
           const lrcText = lyricRes.lrc?.lyric || ''
           const tlyricText = lyricRes.tlyric?.lyric || ''
           const rlyricText = lyricRes.romalrc?.lyric || ''
           const lyrics = parseLyric(lrcText, tlyricText, rlyricText)
           this.setLyricsArray(lyrics)
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
    paths: ['volume', 'playMode', 'lyricType', 'songList', 'currentIndex', 'isCompact'],
  },
})

function formatTime(seconds) {
  if (!isFinite(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}
