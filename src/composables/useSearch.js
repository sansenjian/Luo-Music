import { ref } from 'vue'
import { search } from '../api/search'
import { usePlayerStore } from '../store/playerStore'
import { useToastStore } from '../store/toastStore'

export function useSearch() {
  const playerStore = usePlayerStore()
  const toastStore = useToastStore()
  
  const searchKeyword = ref('')
  const searchResults = ref([])
  const loading = ref(false)
  
  async function handleSearch() {
    console.log('handleSearch called, keyword:', searchKeyword.value)
    if (!searchKeyword.value.trim()) {
      toastStore.error('Please enter a search keyword')
      return
    }
    
    loading.value = true
    try {
      console.log('Calling search API...')
      const res = await search(searchKeyword.value, 1, 20)
      console.log('Search response:', res)
      if (res.result && res.result.songs) {
        searchResults.value = res.result.songs
        
        const songs = res.result.songs.map(song => ({
          id: song.id,
          name: song.name,
          artist: song.ar?.map(a => a.name).join(' / ') || 'Unknown',
          album: song.al?.name || '',
          cover: song.al?.picUrl || '',
          duration: Math.floor(song.dt / 1000),
          url: ''
        }))
        
        playerStore.setSongList(songs)
        toastStore.success(`Found ${songs.length} tracks`)
        return true
      } else {
        toastStore.info('No results found')
        return false
      }
    } catch (error) {
      console.error('Search failed:', error)
      console.error('Error details:', error.message, error.response?.status, error.response?.data)
      
      // 根据错误类型显示不同的错误信息
      let errorMsg = '搜索失败'
      if (error.response?.status === 502) {
        errorMsg = '网易云音乐服务暂时不可用，请稍后重试'
      } else if (error.response?.status === 503) {
        errorMsg = '服务繁忙，请稍后重试'
      } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMsg = '请求超时，请检查网络连接'
      } else if (!error.response) {
        errorMsg = '网络连接失败，请检查网络'
      } else {
        errorMsg = `搜索失败: ${error.message || '未知错误'}`
      }
      
      toastStore.error(errorMsg)
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    searchKeyword,
    searchResults,
    loading,
    handleSearch
  }
}
