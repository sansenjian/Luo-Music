import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pageMocks = vi.hoisted(() => ({
  activeTab: 'liked' as 'liked' | 'playlist' | 'events',
  loadingMap: {
    liked: false,
    playlist: false,
    events: false
  },
  mountedTabs: {
    liked: true,
    playlist: true,
    events: true
  },
  loadedTabs: {
    liked: true,
    playlist: false,
    events: false
  },
  currentUserId: 'user-1',
  avatarUrl: 'avatar.png',
  nickname: 'tester',
  activeTabError: null as unknown,
  selectedPlaylistId: null as string | null,
  selectedPlaylist: null as Record<string, unknown> | null,
  selectedPlaylistSongs: [] as Array<Record<string, unknown>>,
  playlistDetailLoading: false,
  playlistDetailError: null as unknown,
  formattedSongs: [
    {
      id: 'song-1',
      name: 'Song 1',
      artist: 'Artist 1',
      album: 'Album 1',
      cover: 'cover.jpg',
      duration: 180
    }
  ],
  playlists: [
    {
      id: 'playlist-1',
      name: 'Playlist 1',
      coverImgUrl: 'cover.jpg',
      trackCount: 12,
      playCount: 32000
    }
  ],
  events: [
    {
      eventId: 'event-1',
      message: 'event message',
      playableSong: {
        id: 'event-song-1',
        name: 'Event Song 1',
        platform: 'netease'
      },
      user: {
        nickname: 'tester',
        avatarUrl: 'avatar.png'
      },
      eventTime: Date.now()
    }
  ],
  tabCounts: {
    liked: 1,
    playlist: 1,
    events: 1
  },
  likedSongsHasMore: true,
  likedSongsLoadingMore: false,
  likedSongsError: null as unknown,
  eventsFilter: 'all' as const,
  eventsHasMore: true,
  eventsLoadingMore: false,
  eventsError: null as unknown,
  switchTab: vi.fn(),
  openPlaylistDetail: vi.fn(),
  closePlaylistDetail: vi.fn(),
  loadMoreLikedSongs: vi.fn(),
  loadMoreEvents: vi.fn(),
  playAllLikedSongs: vi.fn(),
  playEventSong: vi.fn(),
  playLikedSongAt: vi.fn(),
  playPlaylist: vi.fn(),
  playPlaylistTrackAt: vi.fn(),
  retryActiveTab: vi.fn(),
  retryLoadEvents: vi.fn(),
  retryLoadLikedSongs: vi.fn(),
  retryPlaylistDetail: vi.fn(),
  setEventsFilter: vi.fn(),
  goBack: vi.fn()
}))

vi.mock('@/composables/useUserCenterPage', async () => {
  const { computed, ref } = await import('vue')

  return {
    useUserCenterPage: () => ({
      activeTab: ref(pageMocks.activeTab),
      loadingMap: ref({ ...pageMocks.loadingMap }),
      mountedTabs: ref({ ...pageMocks.mountedTabs }),
      loadedTabs: ref({ ...pageMocks.loadedTabs }),
      currentUserId: computed(() => pageMocks.currentUserId),
      avatarUrl: computed(() => pageMocks.avatarUrl),
      nickname: computed(() => pageMocks.nickname),
      selectedPlaylistId: ref(pageMocks.selectedPlaylistId),
      selectedPlaylist: computed(() => pageMocks.selectedPlaylist),
      selectedPlaylistSongs: ref(pageMocks.selectedPlaylistSongs),
      playlistDetailLoading: ref(pageMocks.playlistDetailLoading),
      playlistDetailError: ref(pageMocks.playlistDetailError),
      activeTabError: computed(() => pageMocks.activeTabError),
      likedCount: computed(() => pageMocks.tabCounts.liked),
      playlistCount: computed(() => pageMocks.tabCounts.playlist),
      eventsCount: computed(() => pageMocks.tabCounts.events),
      tabCounts: computed(() => ({ ...pageMocks.tabCounts })),
      likedSongsHasMore: computed(() => pageMocks.likedSongsHasMore),
      likedSongsLoadingMore: computed(() => pageMocks.likedSongsLoadingMore),
      likedSongsError: computed(() => pageMocks.likedSongsError),
      likeSongs: ref([]),
      formattedSongs: computed(() => pageMocks.formattedSongs),
      loadLikedSongs: vi.fn(),
      loadMoreLikedSongs: pageMocks.loadMoreLikedSongs,
      retryLoadLikedSongs: pageMocks.retryLoadLikedSongs,
      resetLikedSongs: vi.fn(),
      playlists: ref(pageMocks.playlists),
      loadPlaylists: vi.fn(),
      loadPlaylistSongs: vi.fn(),
      resetPlaylists: vi.fn(),
      eventsFilter: ref(pageMocks.eventsFilter),
      events: ref(pageMocks.events),
      filteredEvents: computed(() => pageMocks.events),
      eventsHasMore: computed(() => pageMocks.eventsHasMore),
      eventsLoadingMore: computed(() => pageMocks.eventsLoadingMore),
      eventsError: computed(() => pageMocks.eventsError),
      loadEvents: vi.fn(),
      loadMoreEvents: pageMocks.loadMoreEvents,
      retryLoadEvents: pageMocks.retryLoadEvents,
      resetEvents: vi.fn(),
      setEventsFilter: pageMocks.setEventsFilter,
      switchTab: pageMocks.switchTab,
      openPlaylistDetail: pageMocks.openPlaylistDetail,
      closePlaylistDetail: pageMocks.closePlaylistDetail,
      retryActiveTab: pageMocks.retryActiveTab,
      retryPlaylistDetail: pageMocks.retryPlaylistDetail,
      resetUserContent: vi.fn(),
      loadTabData: vi.fn(),
      playPlaylist: pageMocks.playPlaylist,
      playPlaylistTrackAt: pageMocks.playPlaylistTrackAt,
      playEventSong: pageMocks.playEventSong,
      playAllLikedSongs: pageMocks.playAllLikedSongs,
      playLikedSongAt: pageMocks.playLikedSongAt,
      goBack: pageMocks.goBack
    })
  }
})

const UserProfileHeaderStub = {
  name: 'UserProfileHeader',
  props: {
    userId: {
      type: [String, Number],
      required: true
    },
    avatarUrl: {
      type: String,
      default: ''
    },
    nickname: {
      type: String,
      default: ''
    }
  },
  template: '<div class="profile-header">{{ userId }}|{{ avatarUrl }}|{{ nickname }}</div>'
}

const LikedSongsViewStub = {
  name: 'LikedSongsView',
  props: {
    likeSongs: {
      type: Array,
      required: true
    },
    loading: {
      type: Boolean,
      default: false
    }
  },
  emits: ['play-all', 'play-song', 'load-more', 'retry'],
  template: `
    <div class="liked-view">
      <span class="liked-size">{{ likeSongs.length }}</span>
      <button class="liked-play-all" @click="$emit('play-all')">play all</button>
      <button class="liked-play-song" @click="$emit('play-song', 1)">play song</button>
      <button class="liked-load-more" @click="$emit('load-more')">load more</button>
      <button class="liked-retry" @click="$emit('retry')">retry</button>
    </div>
  `
}

const PlaylistsViewStub = {
  name: 'PlaylistsView',
  props: {
    playlists: {
      type: Array,
      required: true
    },
    loading: {
      type: Boolean,
      default: false
    },
    activePlaylistId: {
      type: String,
      default: null
    }
  },
  emits: ['playlist-open', 'playlist-play'],
  template: `
    <div class="playlists-view">
      <span class="playlist-size">{{ playlists.length }}</span>
      <button class="playlist-open" @click="$emit('playlist-open', 'playlist-1')">open</button>
      <button class="playlist-play" @click="$emit('playlist-play', 'playlist-1')">play</button>
    </div>
  `
}

const PlaylistDetailPanelStub = {
  name: 'PlaylistDetailPanel',
  props: {
    songs: {
      type: Array,
      required: true
    },
    loading: {
      type: Boolean,
      default: false
    },
    error: {
      type: null,
      default: null
    }
  },
  emits: ['close', 'retry', 'play-all', 'play-song'],
  template: `
    <div class="playlist-detail-panel">
      <span class="playlist-detail-size">{{ songs.length }}</span>
      <button class="detail-close" @click="$emit('close')">close</button>
      <button class="detail-retry" @click="$emit('retry')">retry</button>
      <button class="detail-play-all" @click="$emit('play-all')">play all</button>
      <button class="detail-play-song" @click="$emit('play-song', 2)">play song</button>
    </div>
  `
}

const EventsViewStub = {
  name: 'EventsView',
  props: {
    events: {
      type: Array,
      required: true
    },
    activeFilter: {
      type: String,
      default: 'all'
    },
    error: {
      type: null,
      default: null
    },
    hasMore: {
      type: Boolean,
      default: false
    },
    loading: {
      type: Boolean,
      default: false
    },
    loadingMore: {
      type: Boolean,
      default: false
    }
  },
  emits: ['retry', 'load-more', 'update:filter', 'play-song'],
  template: `
    <div class="events-view">
      <span class="events-size">{{ events.length }}</span>
      <button class="events-filter" @click="$emit('update:filter', 'song')">filter</button>
      <button class="events-load-more" @click="$emit('load-more')">load more</button>
      <button class="events-retry" @click="$emit('retry')">retry</button>
      <button class="events-play-song" @click="$emit('play-song', events[0]?.playableSong)">play song</button>
    </div>
  `
}

async function mountUserCenter() {
  const UserCenter = (await import('@/views/UserCenter.vue')).default

  return mount(UserCenter, {
    global: {
      stubs: {
        UserProfileHeader: UserProfileHeaderStub,
        LikedSongsView: LikedSongsViewStub,
        PlaylistsView: PlaylistsViewStub,
        PlaylistDetailPanel: PlaylistDetailPanelStub,
        EventsView: EventsViewStub
      }
    }
  })
}

describe('UserCenter', () => {
  beforeEach(() => {
    pageMocks.activeTab = 'liked'
    pageMocks.loadingMap = {
      liked: false,
      playlist: false,
      events: false
    }
    pageMocks.mountedTabs = {
      liked: true,
      playlist: true,
      events: true
    }
    pageMocks.loadedTabs = {
      liked: true,
      playlist: false,
      events: false
    }
    pageMocks.currentUserId = 'user-1'
    pageMocks.avatarUrl = 'avatar.png'
    pageMocks.nickname = 'tester'
    pageMocks.activeTabError = null
    pageMocks.selectedPlaylistId = null
    pageMocks.selectedPlaylist = null
    pageMocks.selectedPlaylistSongs = []
    pageMocks.playlistDetailLoading = false
    pageMocks.playlistDetailError = null
    pageMocks.tabCounts = {
      liked: 1,
      playlist: 1,
      events: 1
    }
    pageMocks.likedSongsHasMore = true
    pageMocks.likedSongsLoadingMore = false
    pageMocks.likedSongsError = null
    pageMocks.eventsFilter = 'all'
    pageMocks.eventsHasMore = true
    pageMocks.eventsLoadingMore = false
    pageMocks.eventsError = null

    vi.clearAllMocks()
  })

  it('renders profile info and tab counts from the page composable', async () => {
    const wrapper = await mountUserCenter()
    await flushPromises()

    expect(wrapper.find('.profile-header').text()).toContain('user-1|avatar.png|tester')
    const tabButtons = wrapper.findAll('button.tab-btn')
    expect(tabButtons[0].text()).toContain('我喜欢的音乐')
    expect(tabButtons[0].text()).toContain('1')
    expect(tabButtons[1].text()).toContain('歌单')
    expect(tabButtons[2].text()).toContain('动态')
  })

  it('renders only mounted tab views', async () => {
    pageMocks.mountedTabs = {
      liked: true,
      playlist: false,
      events: false
    }

    const wrapper = await mountUserCenter()
    await flushPromises()

    expect(wrapper.find('.liked-view').exists()).toBe(true)
    expect(wrapper.find('.playlists-view').exists()).toBe(false)
    expect(wrapper.find('.events-view').exists()).toBe(false)
  })

  it('delegates tab switching to the page composable', async () => {
    const wrapper = await mountUserCenter()
    await flushPromises()

    const tabButtons = wrapper.findAll('button.tab-btn')
    await tabButtons[1].trigger('click')
    await tabButtons[2].trigger('click')

    expect(pageMocks.switchTab).toHaveBeenNthCalledWith(1, 'playlist')
    expect(pageMocks.switchTab).toHaveBeenNthCalledWith(2, 'events')
  })

  it('forwards liked songs actions to the page composable', async () => {
    const wrapper = await mountUserCenter()
    await flushPromises()

    await wrapper.find('.liked-play-all').trigger('click')
    await wrapper.find('.liked-play-song').trigger('click')
    await wrapper.find('.liked-load-more').trigger('click')
    await wrapper.find('.liked-retry').trigger('click')

    expect(pageMocks.playAllLikedSongs).toHaveBeenCalledTimes(1)
    expect(pageMocks.playLikedSongAt).toHaveBeenCalledWith(1)
    expect(pageMocks.loadMoreLikedSongs).toHaveBeenCalledTimes(1)
    expect(pageMocks.retryLoadLikedSongs).toHaveBeenCalledTimes(1)
  })

  it('forwards playlist entry and playback actions to the page composable', async () => {
    const wrapper = await mountUserCenter()
    await flushPromises()

    await wrapper.find('.playlist-open').trigger('click')
    await wrapper.find('.playlist-play').trigger('click')

    expect(pageMocks.openPlaylistDetail).toHaveBeenCalledWith('playlist-1')
    expect(pageMocks.playPlaylist).toHaveBeenCalledWith('playlist-1')
  })

  it('renders and wires the playlist detail panel when a playlist is selected', async () => {
    pageMocks.activeTab = 'playlist'
    pageMocks.selectedPlaylistId = 'playlist-1'
    pageMocks.selectedPlaylist = {
      id: 'playlist-1',
      name: 'Playlist 1'
    }
    pageMocks.selectedPlaylistSongs = [
      {
        id: 'song-1',
        name: 'Song 1'
      }
    ]

    const wrapper = await mountUserCenter()
    await flushPromises()

    expect(wrapper.find('.playlist-detail-panel').exists()).toBe(true)

    await wrapper.find('.detail-play-all').trigger('click')
    await wrapper.find('.detail-play-song').trigger('click')
    await wrapper.find('.detail-retry').trigger('click')
    await wrapper.find('.detail-close').trigger('click')

    expect(pageMocks.playPlaylist).toHaveBeenCalledWith('playlist-1')
    expect(pageMocks.playPlaylistTrackAt).toHaveBeenCalledWith(2)
    expect(pageMocks.retryPlaylistDetail).toHaveBeenCalledTimes(1)
    expect(pageMocks.closePlaylistDetail).toHaveBeenCalledTimes(1)
  })

  it('renders the shell error state and delegates retry handling', async () => {
    pageMocks.activeTabError = new Error('load failed')

    const wrapper = await mountUserCenter()
    await flushPromises()

    expect(wrapper.text()).toContain('当前内容加载失败')

    await wrapper.find('.status-action').trigger('click')

    expect(pageMocks.retryActiveTab).toHaveBeenCalledTimes(1)
  })

  it('forwards events controls to the page composable', async () => {
    pageMocks.activeTab = 'events'

    const wrapper = await mountUserCenter()
    await flushPromises()

    await wrapper.find('.events-filter').trigger('click')
    await wrapper.find('.events-load-more').trigger('click')
    await wrapper.find('.events-retry').trigger('click')
    await wrapper.find('.events-play-song').trigger('click')

    expect(pageMocks.setEventsFilter).toHaveBeenCalledWith('song')
    expect(pageMocks.loadMoreEvents).toHaveBeenCalledTimes(1)
    expect(pageMocks.retryLoadEvents).toHaveBeenCalledTimes(1)
    expect(pageMocks.playEventSong).toHaveBeenCalledWith(pageMocks.events[0].playableSong)
  })

  it('uses the page composable navigation handler for the back button', async () => {
    const wrapper = await mountUserCenter()
    await flushPromises()

    await wrapper.find('button.back-btn').trigger('click')

    expect(pageMocks.goBack).toHaveBeenCalledTimes(1)
  })
})
