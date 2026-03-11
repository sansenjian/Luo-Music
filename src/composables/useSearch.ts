/**
 * useSearch composable
 * 搜索功能的便捷封装，底层使用 searchStore 维护状态
 * 遵循单一数据源原则，避免状态重复
 */
import { computed } from 'vue'
import { useSearchStore } from '../store/searchStore'
import type { Song } from '../platform/music/interface'

export interface SearchOptions {
  limit?: number
  page?: number
}

/**
 * 搜索功能 composable
 * 封装 searchStore 提供更简洁的 API
 */
export function useSearch() {
  const searchStore = useSearchStore()

  // 计算属性 - 直接代理 store 状态
  const keyword = computed(() => searchStore.keyword)
  const results = computed(() => searchStore.results)
  const total = computed(() => searchStore.totalResults)
  const loading = computed(() => searchStore.isLoading)
  const error = computed(() => searchStore.error)
  const platform = computed(() => searchStore.server)
  const hasResults = computed(() => searchStore.hasResults)

  /**
   * 执行搜索
   */
  async function search(searchKeyword: string, options?: SearchOptions): Promise<{ success: boolean; results?: typeof searchStore.results; total?: number; error?: string }> {
    await searchStore.search(searchKeyword)
    
    if (searchStore.hasResults) {
      return {
        success: true,
        results: searchStore.results,
        total: searchStore.totalResults
      }
    } else {
      return {
        success: false,
        error: searchStore.error || '搜索失败'
      }
    }
  }

  /**
   * 清空搜索结果
   */
  function clear(): void {
    searchStore.clearResults()
  }

  /**
   * 设置搜索平台
   */
  function setPlatform(platformId: string): void {
    searchStore.setServer(platformId)
  }

  /**
   * 获取指定索引的歌曲
   */
  function getSongAt(index: number): (typeof searchStore.results)[number] | null {
    if (index < 0 || index >= searchStore.results.length) {
      return null
    }
    return searchStore.results[index]
  }

  /**
   * 播放指定索引的结果
   */
  function playResult(index: number): void {
    searchStore.playResult(index)
  }

  /**
   * 添加歌曲到播放列表
   */
  function addToPlaylist(index: number): void {
    searchStore.addToPlaylist(index)
  }

  /**
   * 添加所有结果到播放列表
   */
  function addAllToPlaylist(): void {
    searchStore.addAllToPlaylist()
  }

  return {
    // 状态（计算属性代理）
    keyword,
    results,
    total,
    loading,
    error,
    platform,
    hasResults,
    
    // 方法
    search,
    clear,
    setPlatform,
    getSongAt,
    playResult,
    addToPlaylist,
    addAllToPlaylist
  }
}

// 导出类型兼容的 Song 类型
export type { Song }

export default useSearch