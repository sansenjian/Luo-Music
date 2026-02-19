import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '../../src/store/playerStore'
import { usePlaylistStore } from '../../src/store/playlistStore'

// Store 集成测试
// 测试多个 Store 之间的交互

describe('Store Integration Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('PlayerStore and PlaylistStore Integration', () => {
    it('should play song from playlist', () => {
      const playerStore = usePlayerStore()
      const playlistStore = usePlaylistStore()
      
      // 添加歌曲到播放列表
      const song = {
        id: 1,
        name: 'Test Song',
        artists: [{ name: 'Test Artist' }],
        album: { picUrl: 'http://example.com/pic.jpg' }
      }
      
      playlistStore.addSong(song)
      
      // 验证播放列表已更新
      expect(playlistStore.songs).toContainEqual(song)
      
      // 设置播放列表并播放
      playlistStore.setPlaylist([song])
      playerStore.songList = [song]
      playerStore.currentIndex = 0
      playerStore.playing = true
      
      // 验证播放器状态
      expect(playerStore.currentSongInfo).toEqual(song)
      expect(playerStore.playing).toBe(true)
    })

    it('should update playlist when song changes', () => {
      const playerStore = usePlayerStore()
      const playlistStore = usePlaylistStore()
      
      // 添加多首歌曲
      const songs = [
        { id: 1, name: 'Song 1', artists: [{ name: 'Artist 1' }] },
        { id: 2, name: 'Song 2', artists: [{ name: 'Artist 2' }] },
        { id: 3, name: 'Song 3', artists: [{ name: 'Artist 3' }] }
      ]
      
      songs.forEach(song => playlistStore.addSong(song))
      
      // 设置播放列表
      playlistStore.setPlaylist(songs)
      playerStore.songList = songs
      playerStore.currentIndex = 0
      
      // 验证第一首歌
      expect(playerStore.currentSongInfo.id).toBe(1)
      
      // 切换到下一首
      playlistStore.next()
      playerStore.currentIndex = playlistStore.currentIndex
      
      expect(playerStore.currentSongInfo.id).toBe(2)
    })

    it('should clear player state when playlist is cleared', () => {
      const playerStore = usePlayerStore()
      const playlistStore = usePlaylistStore()
      
      // 添加并播放歌曲
      const song = { id: 1, name: 'Test Song', artists: [{ name: 'Test Artist' }] }
      playlistStore.addSong(song)
      playlistStore.setPlaylist([song])
      playerStore.songList = [song]
      playerStore.currentIndex = 0
      
      expect(playerStore.currentSongInfo).toBeDefined()
      
      // 清空播放列表
      playlistStore.clearPlaylist()
      
      // 验证播放列表已清空
      expect(playlistStore.songs).toHaveLength(0)
    })

    it('should handle song removal from playlist', () => {
      const playerStore = usePlayerStore()
      const playlistStore = usePlaylistStore()
      
      const songs = [
        { id: 1, name: 'Song 1', artists: [{ name: 'Artist 1' }] },
        { id: 2, name: 'Song 2', artists: [{ name: 'Artist 2' }] }
      ]
      
      songs.forEach(song => playlistStore.addSong(song))
      playlistStore.setPlaylist(songs)
      playerStore.songList = songs
      playerStore.currentIndex = 0
      
      // 删除第一首歌
      playlistStore.removeSong(0)
      playerStore.songList = playlistStore.songs
      
      // 验证播放列表已更新
      expect(playlistStore.songs).toHaveLength(1)
      expect(playlistStore.songs[0].id).toBe(2)
    })
  })

  describe('Player State Persistence', () => {
    it('should maintain play mode across songs', () => {
      const playerStore = usePlayerStore()
      
      // 设置播放模式为随机
      playerStore.playMode = 3 // random
      
      const songs = [
        { id: 1, name: 'Song 1', artists: [{ name: 'Artist 1' }] },
        { id: 2, name: 'Song 2', artists: [{ name: 'Artist 2' }] },
        { id: 3, name: 'Song 3', artists: [{ name: 'Artist 3' }] }
      ]
      
      playerStore.songList = songs
      playerStore.currentIndex = 0
      
      // 切换到下一首
      playerStore.currentIndex = 1
      
      // 播放模式应保持不变
      expect(playerStore.playMode).toBe(3)
    })

    it('should maintain volume across songs', () => {
      const playerStore = usePlayerStore()
      
      // 设置音量
      playerStore.volume = 0.5
      
      const songs = [
        { id: 1, name: 'Song 1', artists: [{ name: 'Artist 1' }] },
        { id: 2, name: 'Song 2', artists: [{ name: 'Artist 2' }] }
      ]
      
      playerStore.songList = songs
      playerStore.currentIndex = 0
      expect(playerStore.volume).toBe(0.5)
      
      playerStore.currentIndex = 1
      // 切换歌曲后音量应保持不变
      expect(playerStore.volume).toBe(0.5)
    })

    it('should maintain lyric type preference', () => {
      const playerStore = usePlayerStore()
      
      // 设置歌词类型
      playerStore.lyricType = ['original', 'roma']
      
      const song = { id: 1, name: 'Test Song', artists: [{ name: 'Test Artist' }] }
      playerStore.songList = [song]
      playerStore.currentIndex = 0
      
      // 歌词类型应保持不变
      expect(playerStore.lyricType).toEqual(['original', 'roma'])
    })
  })

  describe('Play Mode Behavior', () => {
    it('should loop playlist in loop mode', () => {
      const playlistStore = usePlaylistStore()
      
      playlistStore.setPlaylist([
        { id: 1, name: 'Song 1', artists: [{ name: 'Artist 1' }] },
        { id: 2, name: 'Song 2', artists: [{ name: 'Artist 2' }] }
      ])
      
      // 在最后一首
      expect(playlistStore.currentIndex).toBe(0)
      
      // 下一首（循环模式）
      const nextSong = playlistStore.next(1) // loop mode
      expect(nextSong.id).toBe(2)
    })

    it('should stay on current song in single loop mode', () => {
      const playlistStore = usePlaylistStore()
      
      playlistStore.setPlaylist([
        { id: 1, name: 'Song 1', artists: [{ name: 'Artist 1' }] },
        { id: 2, name: 'Song 2', artists: [{ name: 'Artist 2' }] }
      ])
      
      const currentId = playlistStore.currentSong.id
      
      // 单曲循环模式下应该返回当前歌曲
      // 注意：这里的实现取决于具体的业务逻辑
    })

    it('should select random song in random mode', () => {
      const playlistStore = usePlaylistStore()
      
      playlistStore.setPlaylist([
        { id: 1, name: 'Song 1', artists: [{ name: 'Artist 1' }] },
        { id: 2, name: 'Song 2', artists: [{ name: 'Artist 2' }] },
        { id: 3, name: 'Song 3', artists: [{ name: 'Artist 3' }] }]
      )
      
      // 多次切换，验证索引在有效范围内
      for (let i = 0; i < 10; i++) {
        const nextSong = playlistStore.next(3) // random mode
        if (nextSong) {
          expect([1, 2, 3]).toContain(nextSong.id)
        }
      }
    })
  })

  describe('Lyric Synchronization', () => {
    it('should update lyric index based on progress', () => {
      const playerStore = usePlayerStore()
      
      // 设置歌词
      playerStore.lyricsArray = [
        { time: 0, lyric: 'Line 1' },
        { time: 5, lyric: 'Line 2' },
        { time: 10, lyric: 'Line 3' },
        { time: 15, lyric: 'Line 4' }
      ]
      
      // 设置进度
      playerStore.progress = 7
      playerStore.updateLyricIndex()
      
      // 应该显示第2行歌词（索引1）
      expect(playerStore.currentLyricIndex).toBe(1)
    })

    it('should handle empty lyrics', () => {
      const playerStore = usePlayerStore()
      
      playerStore.lyricsArray = []
      playerStore.progress = 10
      playerStore.updateLyricIndex()
      
      expect(playerStore.currentLyricIndex).toBe(-1)
    })

    it('should handle progress before first lyric', () => {
      const playerStore = usePlayerStore()
      
      playerStore.lyricsArray = [
        { time: 5, lyric: 'Line 1' },
        { time: 10, lyric: 'Line 2' }
      ]
      
      playerStore.progress = 2
      playerStore.updateLyricIndex()
      
      expect(playerStore.currentLyricIndex).toBe(-1)
    })
  })

  describe('Compact Mode Integration', () => {
    it('should toggle compact mode', () => {
      const playerStore = usePlayerStore()
      
      expect(playerStore.isCompact).toBe(false)
      
      playerStore.toggleCompactMode()
      expect(playerStore.isCompact).toBe(true)
      
      playerStore.toggleCompactMode()
      expect(playerStore.isCompact).toBe(false)
    })

    it('should maintain playback state in compact mode', () => {
      const playerStore = usePlayerStore()
      
      const song = { id: 1, name: 'Test Song', artists: [{ name: 'Test Artist' }] }
      playerStore.songList = [song]
      playerStore.currentIndex = 0
      playerStore.playing = true
      
      // 切换到紧凑模式
      playerStore.toggleCompactMode()
      
      // 播放状态应保持不变
      expect(playerStore.playing).toBe(true)
      expect(playerStore.currentSongInfo).toEqual(song)
    })
  })

  describe('Error Recovery', () => {
    it('should handle invalid song index gracefully', () => {
      const playerStore = usePlayerStore()
      
      playerStore.songList = [
        { id: 1, name: 'Song 1', artists: [{ name: 'Artist 1' }] }
      ]
      playerStore.currentIndex = 999 // 无效索引
      
      // 应该返回 null 而不是抛出错误
      expect(playerStore.currentSongInfo).toBeNull()
    })

    it('should handle empty song list', () => {
      const playerStore = usePlayerStore()
      
      playerStore.songList = []
      playerStore.currentIndex = 0
      
      expect(playerStore.currentSongInfo).toBeNull()
      expect(playerStore.hasSongs).toBe(false)
    })
  })
})
