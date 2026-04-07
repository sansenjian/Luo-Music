import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHomePage } from '@/composables/useHomePage'
import type { SearchResultItem } from '@/store/searchStore'

const mockSwitchTab = vi.fn()
const mockSetSongList = vi.fn()
const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()
const mockSearch = vi.fn()

function createHomePageDeps() {
  const searchStore = {
    server: 'netease',
    isLoading: false,
    results: [] as SearchResultItem[],
    totalResults: 0,
    error: null as string | null,
    hasResults: false,
    search: mockSearch,
    setServer: vi.fn((value: string) => {
      searchStore.server = value
    })
  }

  return {
    toastStore: {
      error: mockToastError,
      success: mockToastSuccess
    },
    searchStore,
    homeShell: {
      activeTab: ref<'lyric' | 'playlist'>('lyric'),
      isElectron: computed(() => false),
      playerStore: {
        setSongList: mockSetSongList
      },
      switchTab: mockSwitchTab
    }
  }
}

describe('useHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a toast when searching with an empty keyword', async () => {
    const deps = createHomePageDeps()
    const viewModel = useHomePage(deps)

    viewModel.setSearchKeyword('   ')
    await viewModel.onSearch()

    expect(mockToastError).toHaveBeenCalledWith('Please enter a search keyword')
  })

  it('routes successful search results to playlist and switches tab', async () => {
    const deps = createHomePageDeps()
    deps.searchStore.search = vi.fn(async () => {
      deps.searchStore.results = [
        {
          id: 'song-1',
          name: 'Song 1',
          artist: 'Artist A',
          album: 'Album A',
          pic: 'cover.jpg',
          cover: 'cover.jpg',
          url: null,
          platform: 'netease',
          duration: 180
        }
      ]
      deps.searchStore.totalResults = 1
      deps.searchStore.error = null
      deps.searchStore.hasResults = true
    })

    const viewModel = useHomePage(deps)
    viewModel.setSearchKeyword('song')
    await viewModel.onSearch()

    expect(mockSetSongList).toHaveBeenCalledTimes(1)
    expect(mockSwitchTab).toHaveBeenCalledWith('playlist')
    expect(mockToastSuccess).toHaveBeenCalledWith('Found 1 songs')
  })

  it('updates server selection and closes the server dropdown', () => {
    const deps = createHomePageDeps()
    const viewModel = useHomePage(deps)

    viewModel.toggleSelect()
    expect(viewModel.showSelect.value).toBe(true)

    viewModel.selectServer('qq')
    expect(deps.searchStore.server).toBe('qq')
    expect(viewModel.showSelect.value).toBe(false)
  })
})
