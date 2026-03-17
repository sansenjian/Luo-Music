import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import { useSearchStore } from '../../src/store/searchStore'
import { useToastStore } from '../../src/store/toastStore'
import { useHomePage } from '../../src/composables/useHomePage'

const mockSwitchTab = vi.fn()
const mockSetSongList = vi.fn()

vi.mock('../../src/composables/useHomeShell', () => ({
  useHomeShell: () => ({
    activeTab: ref('lyric'),
    closeWindow: vi.fn(),
    isElectron: ref(false),
    maximizeWindow: vi.fn(),
    minimizeWindow: vi.fn(),
    playSong: vi.fn(),
    playerStore: {
      setSongList: mockSetSongList,
      loading: false,
      songList: []
    },
    switchTab: mockSwitchTab
  })
}))

const Harness = defineComponent({
  setup() {
    return useHomePage()
  },
  template: '<div />'
})

describe('useHomePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('shows a toast when searching with an empty keyword', async () => {
    const toastStore = useToastStore()
    const toastErrorSpy = vi.spyOn(toastStore, 'error')
    const wrapper = mount(Harness)

    await (wrapper.vm as unknown as { setSearchKeyword: (value: string) => void }).setSearchKeyword(
      '   '
    )
    await (wrapper.vm as unknown as { onSearch: () => Promise<void> }).onSearch()

    expect(toastErrorSpy).toHaveBeenCalledWith('Please enter a search keyword')
  })

  it('routes successful search results to playlist and switches tab', async () => {
    const searchStore = useSearchStore()
    const toastStore = useToastStore()
    const toastSuccessSpy = vi.spyOn(toastStore, 'success')

    vi.spyOn(searchStore, 'search').mockImplementation(async () => {
      searchStore.results = [
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
      searchStore.totalResults = 1
      searchStore.error = null
    })

    const wrapper = mount(Harness)
    ;(wrapper.vm as unknown as { setSearchKeyword: (value: string) => void }).setSearchKeyword(
      'song'
    )
    await (wrapper.vm as unknown as { onSearch: () => Promise<void> }).onSearch()

    expect(mockSetSongList).toHaveBeenCalledTimes(1)
    expect(mockSwitchTab).toHaveBeenCalledWith('playlist')
    expect(toastSuccessSpy).toHaveBeenCalledWith('Found 1 songs')
  })

  it('updates server selection and closes the server dropdown', () => {
    const searchStore = useSearchStore()
    const wrapper = mount(Harness)
    const vm = wrapper.vm as unknown as {
      showSelect: boolean
      toggleSelect: () => void
      selectServer: (value: string) => void
    }

    vm.toggleSelect()
    expect(vm.showSelect).toBe(true)

    vm.selectServer('qq')
    expect(searchStore.server).toBe('qq')
    expect(vm.showSelect).toBe(false)
  })
})
