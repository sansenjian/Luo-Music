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
            '<aside class="home-sidebar-stub" :data-collapsed="String(collapsed)" :data-show-brand="String(showBrand)"></aside>'
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
    expect(wrapper.find('.home-footer-stub').attributes('data-layout')).toBe('with-sidebar')
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
    expect(wrapper.find('.left-panel').exists()).toBe(true)
  })
})
