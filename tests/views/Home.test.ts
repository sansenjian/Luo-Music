import { computed, defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useHomePageMock = vi.hoisted(() => vi.fn())
const useHomeBrandPlacementMock = vi.hoisted(() => vi.fn())
const useDockedPlayerBarLayoutMock = vi.hoisted(() => vi.fn())

vi.mock('@/composables/useHomePage', () => ({
  useHomePage: useHomePageMock
}))

vi.mock('@/composables/useHomeBrandPlacement', () => ({
  useHomeBrandPlacement: useHomeBrandPlacementMock
}))

vi.mock('@/composables/useDockedPlayerBarLayout', () => ({
  useDockedPlayerBarLayout: useDockedPlayerBarLayoutMock
}))

vi.mock('@/components/ErrorToast.vue', () => ({
  default: {
    name: 'ErrorToastAsyncStub',
    template: '<div class="error-toast-async-stub"></div>'
  }
}))

vi.mock('@/components/Toast.vue', () => ({
  default: {
    name: 'ToastAsyncStub',
    template: '<div class="toast-async-stub"></div>'
  }
}))

vi.mock('@/components/Player.vue', () => ({
  default: {
    name: 'PlayerAsyncStub',
    template: '<div class="player-async-stub"></div>'
  }
}))

vi.mock('@/components/LyricDisplay.vue', () => ({
  default: {
    name: 'LyricDisplayAsyncStub',
    template: '<div class="lyric-async-stub"></div>'
  }
}))

vi.mock('@/components/Playlist.vue', () => ({
  default: {
    name: 'PlaylistAsyncStub',
    template: '<div class="playlist-async-stub"></div>'
  }
}))

vi.mock('@/components/home/HomeLikedSongsPanel.vue', () => ({
  default: {
    name: 'HomeLikedSongsAsyncStub',
    template: '<section class="home-liked-songs-async-stub"></section>'
  }
}))

vi.mock('@/components/home/HomeLocalMusicPanel.vue', () => ({
  default: {
    name: 'HomeLocalMusicAsyncStub',
    template: '<section class="home-local-music-async-stub"></section>'
  }
}))

function createHomePageState(isPlayerDocked: boolean) {
  return {
    activeTab: ref<'lyric' | 'playlist'>('lyric'),
    closeWindow: vi.fn(),
    closeSelect: vi.fn(),
    isElectron: computed(() => false),
    maximizeWindow: vi.fn(),
    minimizeWindow: vi.fn(),
    onSearch: vi.fn(),
    playSong: vi.fn(),
    playerStore: {
      isPlayerDocked,
      loading: false,
      songList: []
    },
    searchKeyword: ref(''),
    selectedServer: computed(() => 'netease'),
    selectedServerLabel: computed(() => 'Netease'),
    selectServer: vi.fn(),
    servers: [
      { value: 'netease', label: 'Netease' },
      { value: 'qq', label: 'QQ Music' }
    ],
    setSearchKeyword: vi.fn(),
    showSelect: ref(false),
    switchTab: vi.fn(),
    toggleSelect: vi.fn(),
    isLoading: computed(() => false)
  }
}

async function mountHome(options: {
  isPlayerDocked: boolean
  dockedPlayerBarLayout: 'full' | 'with-sidebar'
}) {
  useHomePageMock.mockReturnValue(createHomePageState(options.isPlayerDocked))
  useHomeBrandPlacementMock.mockReturnValue({
    brandPlacement: ref<'header' | 'sidebar'>('sidebar')
  })
  useDockedPlayerBarLayoutMock.mockReturnValue({
    dockedPlayerBarLayout: ref<'full' | 'with-sidebar'>(options.dockedPlayerBarLayout)
  })

  const { default: Home } = await import('@/views/Home.vue')

  return mount(Home, {
    global: {
      stubs: {
        HomeHeader: defineComponent({
          name: 'HomeHeaderStub',
          template: '<header class="home-header-stub"></header>'
        }),
        HomeSidebar: defineComponent({
          name: 'HomeSidebarStub',
          props: {
            activeItemId: {
              type: String,
              required: false
            },
            collapsed: {
              type: Boolean,
              required: false
            },
            showBrand: {
              type: Boolean,
              required: false
            }
          },
          template:
            '<aside class="home-sidebar-stub" :data-active-item="activeItemId" :data-collapsed="String(collapsed)" :data-show-brand="String(showBrand)"><button class="sidebar-home-trigger" @click="$emit(\'item-select\', \'home\')">home</button><button class="sidebar-liked-trigger" @click="$emit(\'item-select\', \'liked\')">liked</button><button class="sidebar-local-trigger" @click="$emit(\'item-select\', \'local\')">local</button><button class="sidebar-collection-trigger" @click="$emit(\'collection-select\', { uiId: \'playlist:123\', sourceId: 123, kind: \'playlist\', name: \'测试歌单\', coverUrl: \'cover.jpg\', summary: \'12 首歌\' })">collection</button></aside>'
        }),
        HomeLikedSongsPanel: defineComponent({
          name: 'HomeLikedSongsPanelStub',
          template: '<section class="home-liked-songs-stub"></section>'
        }),
        HomeLocalMusicPanel: defineComponent({
          name: 'HomeLocalMusicPanelStub',
          template: '<section class="home-local-music-stub"></section>'
        }),
        HomeCollectionDetailPanel: defineComponent({
          name: 'HomeCollectionDetailPanelStub',
          props: {
            collection: {
              type: Object,
              required: false
            }
          },
          template:
            '<section class="home-collection-detail-stub" :data-collection-name="collection?.name" :data-collection-kind="collection?.kind"></section>'
        }),
        HomeWorkspace: defineComponent({
          name: 'HomeWorkspaceStub',
          props: {
            activeTab: {
              type: String,
              required: false
            }
          },
          template: '<section class="home-workspace-stub" :data-tab="activeTab"></section>'
        }),
        HomeFooter: defineComponent({
          name: 'HomeFooterStub',
          props: {
            isPlayerDocked: {
              type: Boolean,
              required: false
            },
            dockedPlayerBarLayout: {
              type: String,
              required: false
            }
          },
          template:
            '<footer class="home-footer-stub" :data-docked="String(isPlayerDocked)" :data-layout="dockedPlayerBarLayout"><slot name="docked-player" /></footer>'
        }),
        Player: defineComponent({
          name: 'PlayerStub',
          template: '<div class="player-stub"></div>'
        }),
        LyricDisplay: defineComponent({
          name: 'LyricDisplayStub',
          template: '<div class="lyric-stub"></div>'
        }),
        Playlist: defineComponent({
          name: 'PlaylistStub',
          template: '<div class="playlist-stub"></div>'
        }),
        Toast: true,
        ErrorToast: true
      }
    }
  })
}

describe('Home view layout', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('enables the adaptive sidebar layout class when the docked player uses with-sidebar', async () => {
    const wrapper = await mountHome({
      isPlayerDocked: true,
      dockedPlayerBarLayout: 'with-sidebar'
    })

    expect(wrapper.find('.window').classes()).toContain('player-docked')
    expect(wrapper.find('.window').classes()).toContain('footer-with-sidebar')
    expect(wrapper.find('.window').classes()).not.toContain('sidebar-collapsed')
    expect(wrapper.find('.app-shell').exists()).toBe(true)
    expect(wrapper.find('.home-sidebar-stub').attributes('data-collapsed')).toBe('false')
    expect(wrapper.find('.home-sidebar-stub').attributes('data-active-item')).toBe('home')
    expect(wrapper.find('.home-footer-stub').attributes('data-layout')).toBe('with-sidebar')
    expect(wrapper.find('.home-workspace-stub').exists()).toBe(true)
    expect(wrapper.find('.home-liked-songs-stub').exists()).toBe(false)
  })

  it('switches the workspace content to local music when the sidebar selects the local library item', async () => {
    const wrapper = await mountHome({
      isPlayerDocked: true,
      dockedPlayerBarLayout: 'full'
    })

    await wrapper.get('.sidebar-local-trigger').trigger('click')

    expect(wrapper.find('.home-sidebar-stub').attributes('data-active-item')).toBe('local')
    expect(wrapper.find('.home-local-music-stub').exists()).toBe(true)
    expect(wrapper.find('.home-workspace-stub').exists()).toBe(false)
    expect(wrapper.find('.home-liked-songs-stub').exists()).toBe(false)
  })

  it('keeps the docked full-width footer mode separate from the adaptive sidebar layout', async () => {
    const wrapper = await mountHome({
      isPlayerDocked: true,
      dockedPlayerBarLayout: 'full'
    })

    expect(wrapper.find('.window').classes()).toContain('player-docked')
    expect(wrapper.find('.window').classes()).not.toContain('footer-with-sidebar')
    expect(wrapper.find('.home-footer-stub').attributes('data-layout')).toBe('full')
    expect(wrapper.find('.home-sidebar-stub').attributes('data-collapsed')).toBe('false')
    expect(wrapper.find('.home-sidebar-stub').attributes('data-active-item')).toBe('home')
  })

  it('keeps the undocked desktop layout collapsed with a dedicated player column', async () => {
    const wrapper = await mountHome({
      isPlayerDocked: false,
      dockedPlayerBarLayout: 'with-sidebar'
    })

    expect(wrapper.find('.window').classes()).toContain('sidebar-collapsed')
    expect(wrapper.find('.window').classes()).not.toContain('player-docked')
    expect(wrapper.find('.window').classes()).not.toContain('footer-with-sidebar')
    expect(wrapper.find('.home-sidebar-stub').attributes('data-collapsed')).toBe('true')
    expect(wrapper.find('.home-sidebar-stub').attributes('data-active-item')).toBe('home')
    expect(wrapper.find('.left-panel').exists()).toBe(true)
  })

  it('switches the workspace content to liked songs when the sidebar selects the liked library item', async () => {
    const wrapper = await mountHome({
      isPlayerDocked: true,
      dockedPlayerBarLayout: 'full'
    })

    await wrapper.get('.sidebar-liked-trigger').trigger('click')

    expect(wrapper.find('.home-sidebar-stub').attributes('data-active-item')).toBe('liked')
    expect(wrapper.find('.home-liked-songs-stub').exists()).toBe(true)
    expect(wrapper.find('.home-workspace-stub').exists()).toBe(false)

    await wrapper.get('.sidebar-home-trigger').trigger('click')

    expect(wrapper.find('.home-sidebar-stub').attributes('data-active-item')).toBe('home')
    expect(wrapper.find('.home-workspace-stub').exists()).toBe(true)
    expect(wrapper.find('.home-liked-songs-stub').exists()).toBe(false)
  })

  it('switches the workspace content to a collection detail page when the sidebar selects a collection card', async () => {
    const wrapper = await mountHome({
      isPlayerDocked: true,
      dockedPlayerBarLayout: 'full'
    })

    await wrapper.get('.sidebar-collection-trigger').trigger('click')

    expect(wrapper.find('.home-sidebar-stub').attributes('data-active-item')).toBe('playlist:123')
    expect(wrapper.find('.home-collection-detail-stub').exists()).toBe(true)
    expect(wrapper.find('.home-collection-detail-stub').attributes('data-collection-name')).toBe(
      '测试歌单'
    )
    expect(wrapper.find('.home-workspace-stub').exists()).toBe(false)
    expect(wrapper.find('.home-liked-songs-stub').exists()).toBe(false)
  })
})
