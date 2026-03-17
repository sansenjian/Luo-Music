import { computed, onMounted, onUnmounted, ref } from 'vue'

import { useHomeShell } from './useHomeShell'
import { searchResultItemToSong, useSearchStore } from '../store/searchStore'
import { useToastStore } from '../store/toastStore'

export interface MusicServerOption {
  value: string
  label: string
}

const SERVERS: MusicServerOption[] = [
  { value: 'netease', label: 'Netease' },
  { value: 'qq', label: 'QQ Music' }
]

export function useHomePage() {
  const toastStore = useToastStore()
  const searchStore = useSearchStore()
  const homeShell = useHomeShell()

  const searchKeyword = ref('')
  const showSelect = ref(false)

  const selectedServerLabel = computed(() => {
    const server = SERVERS.find(item => item.value === searchStore.server)
    return server?.label ?? SERVERS[0].label
  })

  const selectedServer = computed({
    get: () => searchStore.server,
    set: (value: string) => searchStore.setServer(value)
  })

  const isLoading = computed(() => searchStore.isLoading)

  function toggleSelect(): void {
    showSelect.value = !showSelect.value
  }

  function setSearchKeyword(value: string): void {
    searchKeyword.value = value
  }

  function selectServer(value: string): void {
    searchStore.setServer(value)
    showSelect.value = false
  }

  function handleClickOutside(event: MouseEvent): void {
    const wrapper = document.querySelector('.server-select-wrapper')
    const target = event.target instanceof Node ? event.target : null

    if (wrapper && target && !wrapper.contains(target)) {
      showSelect.value = false
    }
  }

  async function onSearch(): Promise<void> {
    const keyword = searchKeyword.value.trim()
    if (!keyword) {
      toastStore.error('Please enter a search keyword')
      return
    }

    try {
      await searchStore.search(keyword)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed. Please try again.'
      toastStore.error(message)
      return
    }

    if (searchStore.hasResults) {
      const songs = searchStore.results.map(searchResultItemToSong)
      homeShell.playerStore.setSongList(songs)
      homeShell.switchTab('playlist')
      toastStore.success(`Found ${searchStore.totalResults} songs`)
      return
    }

    if (searchStore.error) {
      toastStore.error(searchStore.error)
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleClickOutside)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
  })

  return {
    ...homeShell,
    isLoading,
    searchKeyword,
    selectedServer,
    selectedServerLabel,
    setSearchKeyword,
    servers: SERVERS,
    showSelect,
    onSearch,
    selectServer,
    toggleSelect
  }
}

export default useHomePage
