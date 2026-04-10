import { computed, ref } from 'vue'

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

type ToastStoreLike = Pick<ReturnType<typeof useToastStore>, 'error' | 'success'>
type SearchStoreLike = Pick<
  ReturnType<typeof useSearchStore>,
  | 'server'
  | 'isLoading'
  | 'search'
  | 'hasResults'
  | 'results'
  | 'totalResults'
  | 'error'
  | 'setServer'
>
type HomePagePlayerStoreLike = Pick<ReturnType<typeof useHomeShell>['playerStore'], 'setSongList'> &
  Partial<
    Pick<ReturnType<typeof useHomeShell>['playerStore'], 'isCompact' | 'loading' | 'songList'>
  >
type HomeShellReturn = ReturnType<typeof useHomeShell>

interface HomeShellLike {
  playerStore?: HomePagePlayerStoreLike
  switchTab?: HomeShellReturn['switchTab']
  activeTab?: HomeShellReturn['activeTab']
  closeWindow?: HomeShellReturn['closeWindow']
  isElectron?: HomeShellReturn['isElectron']
  maximizeWindow?: HomeShellReturn['maximizeWindow']
  minimizeWindow?: HomeShellReturn['minimizeWindow']
  playSong?: HomeShellReturn['playSong']
}

export interface HomePageDeps {
  toastStore?: ToastStoreLike
  searchStore?: SearchStoreLike
  homeShell?: HomeShellLike
}

export function useHomePage(deps: HomePageDeps = {}) {
  const toastStore = deps.toastStore ?? useToastStore()
  const searchStore = deps.searchStore ?? useSearchStore()
  const actualHomeShell = useHomeShell()
  const homeShell: HomeShellReturn = {
    ...actualHomeShell,
    activeTab: deps.homeShell?.activeTab ?? actualHomeShell.activeTab,
    closeWindow: deps.homeShell?.closeWindow ?? actualHomeShell.closeWindow,
    isElectron: deps.homeShell?.isElectron ?? actualHomeShell.isElectron,
    maximizeWindow: deps.homeShell?.maximizeWindow ?? actualHomeShell.maximizeWindow,
    minimizeWindow: deps.homeShell?.minimizeWindow ?? actualHomeShell.minimizeWindow,
    playSong: deps.homeShell?.playSong ?? actualHomeShell.playSong,
    playerStore: actualHomeShell.playerStore,
    switchTab: deps.homeShell?.switchTab ?? actualHomeShell.switchTab
  }
  const effectivePlayerStore = homeShell.playerStore

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

  function closeSelect(): void {
    showSelect.value = false
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
      const targetPlayerStore = deps.homeShell?.playerStore ?? effectivePlayerStore
      targetPlayerStore.setSongList(songs)
      homeShell.switchTab('playlist')
      toastStore.success(`Found ${searchStore.totalResults} songs`)
      return
    }

    if (searchStore.error) {
      toastStore.error(searchStore.error)
    }
  }

  return {
    ...homeShell,
    closeSelect,
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
