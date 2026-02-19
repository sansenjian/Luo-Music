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
    if (!searchKeyword.value.trim()) {
      toastStore.error('Please enter a search keyword')
      return
    }
    
    loading.value = true
    try {
      const res = await search(searchKeyword.value, 1, 20)
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
      toastStore.error('Search failed. Please check your connection.')
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
