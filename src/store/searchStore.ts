import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePlaylistStore } from './playlistStore'
import { usePlayerStore } from './playerStore'
import { getMusicAdapter } from '../platform/music'
import type { Song } from '../platform/music/interface'
import { handleApiError } from '../api/responseHandler'

export interface SearchResultItem {
  id: string | number
  name: string
  artist: string
  album: string
  pic: string
  cover: string
  url: null
  platform: string
  duration: number
  [key: string]: unknown
}

export const useSearchStore = defineStore('searchStore', () => {
  // ============ State ============
  const keyword = ref('')
  const results = ref<SearchResultItem[]>([])
  const server = ref('netease')
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const totalResults = ref(0)

  // ============ Getters ============
  const hasResults = computed(() => results.value.length > 0)

  // ============ Actions ============
  
  /**
   * 设置搜索平台
   */
  function setServer(serverId: string) {
    server.value = serverId
    console.log('[searchStore] Server changed to:', serverId)
  }

  /**
   * 格式化错误信息
   */
  function formatError(err: unknown): string {
    // 使用统一的错误处理
    const error = handleApiError(err, server.value === 'qq' ? 'QQ 音乐' : '网易云音乐')
    return error.message
  }

  /**
   * 执行搜索
   */
  async function search(searchKeyword: string) {
    // 验证输入
    if (!searchKeyword?.trim()) {
      const msg = '请输入搜索关键词'
      error.value = msg
      throw new Error(msg)
    }

    const trimmedKeyword = searchKeyword.trim()
    keyword.value = trimmedKeyword
    isLoading.value = true
    error.value = null
    results.value = []

    console.log('[searchStore] Starting search:', { 
      keyword: trimmedKeyword, 
      server: server.value 
    })

    try {
      // 获取适配器
      const adapter = getMusicAdapter(server.value)
      
      // 执行搜索
      const res = await adapter.search(trimmedKeyword, 30, 1)
      
      console.log('[searchStore] Search result:', res)

      // 验证结果
      if (!res?.list || !Array.isArray(res.list)) {
        throw new Error('搜索结果格式错误')
      }

      if (res.list.length === 0) {
        error.value = '未找到相关歌曲'
        totalResults.value = 0
        return
      }

      // 转换结果格式
      totalResults.value = res.total || 0
      results.value = normalizeSearchResults(res.list)

      console.log('[searchStore] Search successful:', {
        count: results.value.length,
        total: totalResults.value
      })
    } catch (err: unknown) {
      // 统一错误处理
      const errorMessage = formatError(err)
      
      console.error('[searchStore] Search error:', errorMessage, err)
      
      error.value = errorMessage
      results.value = []
      totalResults.value = 0
      
      // 重新抛出，让调用者处理
      throw new Error(errorMessage)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 转换搜索结果格式
   */
  function normalizeSearchResults(songs: Song[]): SearchResultItem[] {
    return songs.map(song => {
      const item: SearchResultItem = {
        id: song.id,
        name: song.name,
        artist: song.artists.map(a => a.name).join(' / '),
        album: song.album.name || '',
        pic: song.album.picUrl || '',
        cover: song.album.picUrl || '',
        url: null,
        platform: song.platform,
        duration: Math.floor(song.duration / 1000)
      }

      // 添加平台特定字段
      if (song.extra) {
        Object.assign(item, song.extra)
      }

      return item
    })
  }

  /**
   * 播放指定索引的结果
   */
  function playResult(index: number) {
    if (index < 0 || index >= results.value.length) {
      console.warn('[searchStore] Invalid index:', index)
      return
    }

    const playlistStore = usePlaylistStore()
    const playerStore = usePlayerStore()

    playlistStore.setPlaylist([...results.value])
    
    const song = playlistStore.playAt(index)
    if (song) {
      playerStore.setSongList([...results.value])
      playerStore.playSongByIndex(index)
    }
  }

  /**
   * 添加歌曲到播放列表
   */
  function addToPlaylist(index: number) {
    if (index < 0 || index >= results.value.length) return
    const playlistStore = usePlaylistStore()
    playlistStore.addSong(results.value[index])
  }

  /**
   * 添加所有结果到播放列表
   */
  function addAllToPlaylist() {
    const playlistStore = usePlaylistStore()
    playlistStore.addSongs(results.value)
  }

  /**
   * 清空搜索结果
   */
  function clearResults() {
    results.value = []
    error.value = null
    keyword.value = ''
    console.log('[searchStore] Results cleared')
  }

  return {
    // State
    keyword,
    results,
    server,
    isLoading,
    error,
    totalResults,
    // Getters
    hasResults,
    // Actions
    setServer,
    search,
    playResult,
    addToPlaylist,
    addAllToPlaylist,
    clearResults
  }
}, {
  persist: {
    storage: localStorage,
    paths: ['server']
  }
})
