import { computed, defineComponent, nextTick, reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocationQuery, LocationQueryRaw } from 'vue-router'

import {
  useUserCenterPage,
  type UseUserCenterPageDeps,
  type UseUserCenterPageReturn
} from '@/composables/useUserCenterPage'
import type { FavoriteAlbumItem } from '@/composables/useFavoriteAlbums'
import type { EventItem } from '@/composables/useUserEvents'
import type { PlaylistItem } from '@/composables/useUserPlaylists'
import { createSong, type Song } from '@/platform/music/interface'
import { formatSongs } from '@/utils/songFormatter'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void

  const promise = new Promise<T>(nextResolve => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

type UserStoreState = {
  isLoggedIn: boolean
  userId: string | null
  avatarUrl: string
  nickname: string
}

type RouteState = {
  query: LocationQuery
}

function createUserCenterPageDeps(initialQuery: LocationQuery = {}) {
  const userStore = reactive<UserStoreState>({
    isLoggedIn: true,
    userId: 'user-1',
    avatarUrl: 'avatar.png',
    nickname: 'tester'
  })
  const route = reactive<RouteState>({
    query: { ...initialQuery }
  })

  const likedSongsRef = ref<Song[]>([
    createSong({
      id: 'liked-1',
      name: 'Liked Song 1',
      platform: 'netease'
    }),
    createSong({
      id: 'liked-2',
      name: 'Liked Song 2',
      platform: 'netease'
    })
  ])
  const playlistsRef = ref<PlaylistItem[]>([
    {
      id: 'playlist-1',
      name: 'Playlist 1',
      trackCount: 2,
      subscribed: false
    },
    {
      id: 'playlist-favorite-1',
      name: 'Favorite Playlist 1',
      trackCount: 3,
      subscribed: true
    }
  ])
  const albumsRef = ref<FavoriteAlbumItem[]>([
    {
      id: 'album-1',
      name: 'Album 1',
      picUrl: 'album-cover.jpg',
      size: 2,
      artistName: 'Artist 1'
    }
  ])
  const eventsRef = ref<EventItem[]>([
    {
      eventId: 'event-1',
      message: 'event message'
    }
  ])
  const filteredEventsRef = computed(() => eventsRef.value)
  const likedSongsErrorRef = ref<unknown>(null)
  const playlistsErrorRef = ref<unknown>(null)
  const albumsErrorRef = ref<unknown>(null)
  const eventsErrorRef = ref<unknown>(null)

  const pushMock = vi.fn<(path: string) => Promise<void>>(() => Promise.resolve())
  const replaceMock = vi.fn<
    (location: { path?: string; query?: LocationQueryRaw }) => Promise<void>
  >(async location => {
    route.query = { ...(location.query ?? {}) } as LocationQuery
  })
  const setPlaylistMock = vi.fn<(songs: Song[]) => void>()
  const setSongListMock = vi.fn<(songs: Song[]) => void>()
  const playSongWithDetailsMock = vi.fn<(index: number) => Promise<void>>(() => Promise.resolve())
  const loadMoreLikedSongsMock = vi.fn<() => Promise<void>>(() => Promise.resolve())
  const retryLoadLikedSongsMock = vi.fn<() => Promise<void>>(() => Promise.resolve())
  const loadLikedSongsMock = vi.fn<(userId: string | number) => Promise<void>>(() =>
    Promise.resolve()
  )
  const resetLikedSongsMock = vi.fn(() => {
    likedSongsRef.value = []
    likedSongsErrorRef.value = null
  })
  const loadPlaylistsMock = vi.fn<(userId: string | number) => Promise<void>>(() =>
    Promise.resolve()
  )
  const loadPlaylistSongsMock = vi.fn<(playlistId: string | number) => Promise<Song[]>>(() =>
    Promise.resolve([])
  )
  const resetPlaylistsMock = vi.fn(() => {
    playlistsRef.value = []
    playlistsErrorRef.value = null
  })
  const loadFavoriteAlbumsMock = vi.fn<(userId: string | number) => Promise<void>>(() =>
    Promise.resolve()
  )
  const loadAlbumSongsMock = vi.fn<(albumId: string | number) => Promise<Song[]>>(() =>
    Promise.resolve([])
  )
  const resetFavoriteAlbumsMock = vi.fn(() => {
    albumsRef.value = []
    albumsErrorRef.value = null
  })
  const loadEventsMock = vi.fn<(userId: string | number) => Promise<void>>(() => Promise.resolve())
  const loadMoreEventsMock = vi.fn<() => Promise<void>>(() => Promise.resolve())
  const retryLoadEventsMock = vi.fn<() => Promise<void>>(() => Promise.resolve())
  const resetEventsMock = vi.fn(() => {
    eventsRef.value = []
    eventsErrorRef.value = null
  })

  const deps: UseUserCenterPageDeps = {
    route,
    router: {
      push: pushMock,
      replace: replaceMock
    },
    userStore,
    playlistStore: {
      setPlaylist: setPlaylistMock
    },
    playerStore: {
      setSongList: setSongListMock,
      playSongWithDetails: playSongWithDetailsMock
    },
    likedSongs: {
      likeSongs: likedSongsRef,
      formattedSongs: computed(() => formatSongs(likedSongsRef.value)),
      count: computed(() => likedSongsRef.value.length),
      error: likedSongsErrorRef,
      hasMore: computed(() => true),
      loadLikedSongs: loadLikedSongsMock,
      loadMoreLikedSongs: loadMoreLikedSongsMock,
      loadingMore: ref(false),
      retryLoadLikedSongs: retryLoadLikedSongsMock,
      resetLikedSongs: resetLikedSongsMock
    },
    userPlaylists: {
      playlists: playlistsRef,
      createdPlaylists: computed(() =>
        playlistsRef.value.filter(playlist => playlist.subscribed !== true)
      ),
      favoritePlaylists: computed(() =>
        playlistsRef.value.filter(playlist => playlist.subscribed === true)
      ),
      count: computed(
        () => playlistsRef.value.filter(playlist => playlist.subscribed !== true).length
      ),
      error: playlistsErrorRef,
      loadPlaylists: loadPlaylistsMock,
      loadPlaylistSongs: loadPlaylistSongsMock,
      resetPlaylists: resetPlaylistsMock
    },
    favoriteAlbums: {
      albums: albumsRef,
      count: computed(() => albumsRef.value.length),
      error: albumsErrorRef,
      loadFavoriteAlbums: loadFavoriteAlbumsMock,
      loadAlbumSongs: loadAlbumSongsMock,
      resetFavoriteAlbums: resetFavoriteAlbumsMock
    },
    userEvents: {
      activeFilter: ref('all'),
      events: eventsRef,
      filteredEvents: filteredEventsRef,
      count: computed(() => eventsRef.value.length),
      error: eventsErrorRef,
      hasMore: computed(() => false),
      loadEvents: loadEventsMock,
      loadMoreEvents: loadMoreEventsMock,
      loadingMore: ref(false),
      retryLoadEvents: retryLoadEventsMock,
      resetEvents: resetEventsMock,
      setFilter: vi.fn()
    }
  }

  return {
    deps,
    userStore,
    route,
    likedSongsRef,
    likedSongsErrorRef,
    playlistsRef,
    playlistsErrorRef,
    albumsRef,
    albumsErrorRef,
    eventsErrorRef,
    pushMock,
    replaceMock,
    setPlaylistMock,
    setSongListMock,
    playSongWithDetailsMock,
    loadLikedSongsMock,
    loadMoreLikedSongsMock,
    retryLoadLikedSongsMock,
    resetLikedSongsMock,
    loadPlaylistsMock,
    loadPlaylistSongsMock,
    resetPlaylistsMock,
    loadFavoriteAlbumsMock,
    loadAlbumSongsMock,
    resetFavoriteAlbumsMock,
    loadEventsMock,
    loadMoreEventsMock,
    retryLoadEventsMock,
    resetEventsMock
  }
}

function mountUserCenterPage(factory = createUserCenterPageDeps()) {
  let viewModel!: UseUserCenterPageReturn

  const Harness = defineComponent({
    setup() {
      viewModel = useUserCenterPage(factory.deps)
      return () => null
    }
  })

  mount(Harness)

  return {
    ...factory,
    viewModel
  }
}

describe('useUserCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reloads user scoped data when the account changes on the same route', async () => {
    const {
      viewModel,
      loadFavoriteAlbumsMock,
      userStore,
      loadEventsMock,
      loadLikedSongsMock,
      loadPlaylistsMock,
      resetFavoriteAlbumsMock,
      resetEventsMock,
      resetLikedSongsMock,
      resetPlaylistsMock
    } = mountUserCenterPage()

    await flushPromises()

    expect(viewModel.activeTab.value).toBe('liked')
    expect(viewModel.mountedTabs.value).toEqual({
      liked: true,
      playlist: false,
      album: false,
      events: false
    })
    expect(resetLikedSongsMock).toHaveBeenCalled()
    expect(resetPlaylistsMock).toHaveBeenCalled()
    expect(resetFavoriteAlbumsMock).toHaveBeenCalled()
    expect(resetEventsMock).toHaveBeenCalled()
    expect(loadLikedSongsMock).toHaveBeenCalledWith('user-1')
    expect(loadPlaylistsMock).not.toHaveBeenCalled()
    expect(loadFavoriteAlbumsMock).not.toHaveBeenCalled()
    expect(loadEventsMock).not.toHaveBeenCalled()

    vi.clearAllMocks()

    userStore.userId = 'user-2'
    await nextTick()
    await flushPromises()

    expect(resetLikedSongsMock).toHaveBeenCalled()
    expect(resetPlaylistsMock).toHaveBeenCalled()
    expect(resetFavoriteAlbumsMock).toHaveBeenCalled()
    expect(resetEventsMock).toHaveBeenCalled()
    expect(loadLikedSongsMock).toHaveBeenCalledWith('user-2')
    expect(loadPlaylistsMock).not.toHaveBeenCalled()
    expect(loadFavoriteAlbumsMock).not.toHaveBeenCalled()
    expect(loadEventsMock).not.toHaveBeenCalled()
  })

  it('clears stale user data and redirects when logout happens on the user route', async () => {
    const {
      userStore,
      pushMock,
      loadFavoriteAlbumsMock,
      loadEventsMock,
      loadLikedSongsMock,
      loadPlaylistsMock,
      resetFavoriteAlbumsMock,
      resetEventsMock,
      resetLikedSongsMock,
      resetPlaylistsMock
    } = mountUserCenterPage()

    await flushPromises()
    vi.clearAllMocks()

    userStore.isLoggedIn = false
    userStore.userId = null
    await nextTick()
    await flushPromises()

    expect(resetLikedSongsMock).toHaveBeenCalled()
    expect(resetPlaylistsMock).toHaveBeenCalled()
    expect(resetFavoriteAlbumsMock).toHaveBeenCalled()
    expect(resetEventsMock).toHaveBeenCalled()
    expect(loadLikedSongsMock).not.toHaveBeenCalled()
    expect(loadPlaylistsMock).not.toHaveBeenCalled()
    expect(loadFavoriteAlbumsMock).not.toHaveBeenCalled()
    expect(loadEventsMock).not.toHaveBeenCalled()
    expect(pushMock).toHaveBeenCalledWith('/')
  })

  it('restores active tab and playlist detail from route query', async () => {
    const playlistSongs = [
      createSong({
        id: 'playlist-song-1',
        name: 'Playlist Song 1',
        platform: 'netease'
      })
    ]
    const factory = createUserCenterPageDeps({
      tab: 'playlist',
      playlistId: 'playlist-1'
    })

    factory.loadPlaylistSongsMock.mockResolvedValue(playlistSongs)

    const { viewModel, loadLikedSongsMock, loadPlaylistSongsMock, loadPlaylistsMock, route } =
      mountUserCenterPage(factory)

    await flushPromises()

    expect(viewModel.activeTab.value).toBe('playlist')
    expect(viewModel.selectedPlaylistId.value).toBe('playlist-1')
    expect(viewModel.mountedTabs.value.playlist).toBe(true)
    expect(route.query).toEqual({
      tab: 'playlist',
      playlistId: 'playlist-1'
    })
    expect(loadPlaylistsMock).toHaveBeenCalledWith('user-1')
    expect(loadLikedSongsMock).not.toHaveBeenCalled()
    expect(loadPlaylistSongsMock).toHaveBeenCalledWith('playlist-1')
    expect(viewModel.selectedPlaylistSongs.value).toEqual(playlistSongs)
  })

  it('restores active tab and album detail from route query', async () => {
    const albumSongs = [
      createSong({
        id: 'album-song-1',
        name: 'Album Song 1',
        platform: 'netease'
      })
    ]
    const factory = createUserCenterPageDeps({
      tab: 'album',
      albumId: 'album-1'
    })

    factory.loadAlbumSongsMock.mockResolvedValue(albumSongs)

    const {
      viewModel,
      loadAlbumSongsMock,
      loadFavoriteAlbumsMock,
      loadLikedSongsMock,
      loadPlaylistsMock,
      route
    } = mountUserCenterPage(factory)

    await flushPromises()

    expect(viewModel.activeTab.value).toBe('album')
    expect(viewModel.selectedAlbumId.value).toBe('album-1')
    expect(viewModel.mountedTabs.value.album).toBe(true)
    expect(route.query).toEqual({
      tab: 'album',
      albumId: 'album-1'
    })
    expect(loadPlaylistsMock).toHaveBeenCalledWith('user-1')
    expect(loadFavoriteAlbumsMock).toHaveBeenCalledWith('user-1')
    expect(loadLikedSongsMock).not.toHaveBeenCalled()
    expect(loadAlbumSongsMock).toHaveBeenCalledWith('album-1')
    expect(viewModel.selectedAlbumSongs.value).toEqual(albumSongs)
  })

  it('does not restore stale album detail songs after logout resets the detail state', async () => {
    const albumSongs = [
      createSong({
        id: 'album-song-1',
        name: 'Album Song 1',
        platform: 'netease'
      })
    ]
    const albumSongsDeferred = createDeferred<Song[]>()
    const factory = createUserCenterPageDeps({
      tab: 'album',
      albumId: 'album-1'
    })

    factory.loadAlbumSongsMock.mockImplementation(() => albumSongsDeferred.promise)

    const { loadAlbumSongsMock, pushMock, userStore, viewModel } = mountUserCenterPage(factory)

    await vi.waitFor(() => {
      expect(loadAlbumSongsMock).toHaveBeenCalledWith('album-1')
    })

    userStore.isLoggedIn = false
    userStore.userId = null
    await nextTick()
    await flushPromises()

    expect(pushMock).toHaveBeenCalledWith('/')
    expect(viewModel.selectedAlbumSongs.value).toEqual([])

    albumSongsDeferred.resolve(albumSongs)
    await flushPromises()

    expect(viewModel.selectedAlbumSongs.value).toEqual([])
  })

  it('keeps albumCount scoped to favorite albums and exposes a combined collections tab count', async () => {
    const factory = createUserCenterPageDeps()
    const { albumsRef, playlistsRef, viewModel } = mountUserCenterPage(factory)

    await flushPromises()
    playlistsRef.value = [
      {
        id: 'playlist-1',
        name: 'Playlist 1',
        trackCount: 2,
        subscribed: false
      },
      {
        id: 'playlist-favorite-1',
        name: 'Favorite Playlist 1',
        trackCount: 3,
        subscribed: true
      }
    ]
    albumsRef.value = [
      {
        id: 'album-1',
        name: 'Album 1',
        picUrl: 'album-cover.jpg',
        size: 2,
        artistName: 'Artist 1'
      }
    ]
    await nextTick()

    expect(viewModel.albumCount.value).toBe(1)
    expect(viewModel.tabCounts.value.playlist).toBe(1)
    expect(viewModel.tabCounts.value.album).toBe(2)
  })

  it('loads non-active tabs only when the user switches to them and syncs query state', async () => {
    const {
      route,
      replaceMock,
      viewModel,
      loadEventsMock,
      loadFavoriteAlbumsMock,
      loadLikedSongsMock,
      loadPlaylistsMock
    } = mountUserCenterPage()

    await flushPromises()

    expect(loadLikedSongsMock).toHaveBeenCalledTimes(1)
    expect(loadPlaylistsMock).not.toHaveBeenCalled()
    expect(loadFavoriteAlbumsMock).not.toHaveBeenCalled()
    expect(loadEventsMock).not.toHaveBeenCalled()

    viewModel.switchTab('playlist')
    await flushPromises()

    expect(viewModel.activeTab.value).toBe('playlist')
    expect(viewModel.mountedTabs.value.playlist).toBe(true)
    expect(loadPlaylistsMock).toHaveBeenCalledWith('user-1')
    expect(route.query).toEqual({ tab: 'playlist' })
    expect(replaceMock).toHaveBeenLastCalledWith({
      path: '/user',
      query: { tab: 'playlist' }
    })

    viewModel.switchTab('album')
    await flushPromises()

    expect(viewModel.activeTab.value).toBe('album')
    expect(viewModel.mountedTabs.value.album).toBe(true)
    expect(loadFavoriteAlbumsMock).toHaveBeenCalledWith('user-1')
    expect(route.query).toEqual({ tab: 'album' })

    viewModel.switchTab('events')
    await flushPromises()

    expect(viewModel.activeTab.value).toBe('events')
    expect(viewModel.mountedTabs.value.events).toBe(true)
    expect(loadEventsMock).toHaveBeenCalledWith('user-1')
    expect(route.query).toEqual({ tab: 'events' })

    viewModel.switchTab('playlist')
    await flushPromises()

    expect(loadPlaylistsMock).toHaveBeenCalledTimes(1)
  })

  it('marks playlist dependency as loaded when album tab preloads playlists and reloads it on force refresh', async () => {
    const { loadFavoriteAlbumsMock, loadPlaylistsMock, viewModel } = mountUserCenterPage(
      createUserCenterPageDeps({
        tab: 'album'
      })
    )

    await flushPromises()

    expect(loadPlaylistsMock).toHaveBeenCalledTimes(1)
    expect(loadFavoriteAlbumsMock).toHaveBeenCalledTimes(1)
    expect(viewModel.loadedTabs.value.album).toBe(true)
    expect(viewModel.loadedTabs.value.playlist).toBe(true)
    expect(viewModel.loadingMap.value.album).toBe(false)
    expect(viewModel.loadingMap.value.playlist).toBe(false)

    vi.clearAllMocks()

    await viewModel.loadTabData('album', 'user-1', true)

    expect(loadPlaylistsMock).toHaveBeenCalledTimes(1)
    expect(loadFavoriteAlbumsMock).toHaveBeenCalledTimes(1)
    expect(viewModel.loadedTabs.value.playlist).toBe(true)
    expect(viewModel.loadingMap.value.playlist).toBe(false)
  })

  it('does not reload a tab while its previous request is still in flight', async () => {
    const likedDeferred = createDeferred<void>()
    const playlistDeferred = createDeferred<void>()
    const albumDeferred = createDeferred<void>()
    const factory = createUserCenterPageDeps()

    factory.loadLikedSongsMock.mockImplementationOnce(() => likedDeferred.promise)
    factory.loadPlaylistsMock.mockImplementationOnce(() => playlistDeferred.promise)
    factory.loadFavoriteAlbumsMock.mockImplementationOnce(() => albumDeferred.promise)

    const { viewModel, loadFavoriteAlbumsMock, loadLikedSongsMock, loadPlaylistsMock } =
      mountUserCenterPage(factory)

    await nextTick()

    expect(loadLikedSongsMock).toHaveBeenCalledTimes(1)

    viewModel.switchTab('playlist')
    await nextTick()

    expect(loadPlaylistsMock).toHaveBeenCalledTimes(1)

    viewModel.switchTab('liked')
    await nextTick()

    expect(loadLikedSongsMock).toHaveBeenCalledTimes(1)

    viewModel.switchTab('album')
    await nextTick()

    expect(loadFavoriteAlbumsMock).toHaveBeenCalledTimes(1)

    likedDeferred.resolve()
    playlistDeferred.resolve()
    albumDeferred.resolve()
    await flushPromises()
  })

  it('opens playlist detail, syncs query, and retries detail loading after failure', async () => {
    const playlistSongs = [
      createSong({
        id: 'playlist-song-1',
        name: 'Playlist Song 1',
        platform: 'netease'
      })
    ]
    const factory = createUserCenterPageDeps()

    factory.loadPlaylistSongsMock
      .mockRejectedValueOnce(new Error('detail failed'))
      .mockResolvedValueOnce(playlistSongs)

    const { route, replaceMock, viewModel, loadPlaylistSongsMock } = mountUserCenterPage(factory)

    await flushPromises()
    await viewModel.openPlaylistDetail('playlist-1')

    expect(viewModel.activeTab.value).toBe('playlist')
    expect(viewModel.selectedPlaylistId.value).toBe('playlist-1')
    expect(route.query).toEqual({
      tab: 'playlist',
      playlistId: 'playlist-1'
    })
    expect(replaceMock).toHaveBeenLastCalledWith({
      path: '/user',
      query: {
        tab: 'playlist',
        playlistId: 'playlist-1'
      }
    })
    expect(viewModel.playlistDetailError.value).toBeInstanceOf(Error)
    expect(viewModel.selectedPlaylistSongs.value).toEqual([])

    await viewModel.retryPlaylistDetail()

    expect(loadPlaylistSongsMock).toHaveBeenCalledTimes(2)
    expect(viewModel.playlistDetailError.value).toBe(null)
    expect(viewModel.selectedPlaylistSongs.value).toEqual(playlistSongs)

    viewModel.closePlaylistDetail()
    await flushPromises()

    expect(viewModel.selectedPlaylistId.value).toBe(null)
    expect(route.query).toEqual({ tab: 'playlist' })
  })

  it('opens album detail, syncs query, and retries detail loading after failure', async () => {
    const albumSongs = [
      createSong({
        id: 'album-song-1',
        name: 'Album Song 1',
        platform: 'netease'
      })
    ]
    const factory = createUserCenterPageDeps()

    factory.loadAlbumSongsMock
      .mockRejectedValueOnce(new Error('detail failed'))
      .mockResolvedValueOnce(albumSongs)

    const { route, replaceMock, viewModel, loadAlbumSongsMock } = mountUserCenterPage(factory)

    await flushPromises()
    await viewModel.openAlbumDetail('album-1')

    expect(viewModel.activeTab.value).toBe('album')
    expect(viewModel.selectedAlbumId.value).toBe('album-1')
    expect(route.query).toEqual({
      tab: 'album',
      albumId: 'album-1'
    })
    expect(replaceMock).toHaveBeenLastCalledWith({
      path: '/user',
      query: {
        tab: 'album',
        albumId: 'album-1'
      }
    })
    expect(viewModel.albumDetailError.value).toBeInstanceOf(Error)
    expect(viewModel.selectedAlbumSongs.value).toEqual([])

    await viewModel.retryAlbumDetail()

    expect(loadAlbumSongsMock).toHaveBeenCalledTimes(2)
    expect(viewModel.albumDetailError.value).toBe(null)
    expect(viewModel.selectedAlbumSongs.value).toEqual(albumSongs)

    viewModel.closeAlbumDetail()
    await flushPromises()

    expect(viewModel.selectedAlbumId.value).toBe(null)
    expect(route.query).toEqual({ tab: 'album' })
  })

  it('retries the active tab through the shell state', async () => {
    const factory = createUserCenterPageDeps({
      tab: 'events'
    })

    const { eventsErrorRef, retryLoadEventsMock, viewModel } = mountUserCenterPage(factory)

    await flushPromises()
    vi.clearAllMocks()

    eventsErrorRef.value = new Error('events failed')
    retryLoadEventsMock.mockImplementation(async () => {
      eventsErrorRef.value = null
    })

    await viewModel.retryActiveTab()

    expect(viewModel.activeTabError.value).toBe(null)
    expect(retryLoadEventsMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces active tab errors for liked and events tabs', async () => {
    const likedFactory = createUserCenterPageDeps()
    const likedMount = mountUserCenterPage(likedFactory)

    await flushPromises()

    const likedError = new Error('liked failed')
    likedMount.likedSongsErrorRef.value = likedError
    await nextTick()

    expect(likedMount.viewModel.activeTabError.value).toBe(likedError)

    const eventsFactory = createUserCenterPageDeps({
      tab: 'events'
    })
    const eventsMount = mountUserCenterPage(eventsFactory)

    await flushPromises()

    const eventsError = new Error('events failed')
    eventsMount.eventsErrorRef.value = eventsError
    await nextTick()

    expect(eventsMount.viewModel.activeTabError.value).toBe(eventsError)
  })

  it('coordinates playlist and player stores across playback actions', async () => {
    const factory = createUserCenterPageDeps()
    const playlistSongs = [
      createSong({
        id: 'playlist-song-1',
        name: 'Playlist Song 1',
        platform: 'netease'
      })
    ]
    const albumSongs = [
      createSong({
        id: 'album-song-1',
        name: 'Album Song 1',
        platform: 'netease'
      })
    ]

    factory.loadPlaylistSongsMock.mockResolvedValue(playlistSongs)
    factory.loadAlbumSongsMock.mockResolvedValue(albumSongs)

    const {
      viewModel,
      likedSongsRef,
      loadAlbumSongsMock,
      loadPlaylistSongsMock,
      playSongWithDetailsMock,
      pushMock,
      setPlaylistMock,
      setSongListMock
    } = mountUserCenterPage(factory)

    await flushPromises()

    const likedSongs = [
      createSong({
        id: 'liked-a',
        name: 'Liked Song A',
        platform: 'netease'
      }),
      createSong({
        id: 'liked-b',
        name: 'Liked Song B',
        platform: 'netease'
      })
    ]

    likedSongsRef.value = likedSongs

    await viewModel.playAllLikedSongs()

    expect(setPlaylistMock).toHaveBeenCalledWith(likedSongs)
    expect(setSongListMock).toHaveBeenCalledWith(likedSongs)
    expect(playSongWithDetailsMock).toHaveBeenCalledWith(0)
    expect(pushMock).toHaveBeenCalledWith('/')

    vi.clearAllMocks()

    await viewModel.playLikedSongAt(1)

    expect(setPlaylistMock).toHaveBeenCalledWith(likedSongs)
    expect(setSongListMock).toHaveBeenCalledWith(likedSongs)
    expect(playSongWithDetailsMock).toHaveBeenCalledWith(1)
    expect(pushMock).toHaveBeenCalledWith('/')

    vi.clearAllMocks()

    await viewModel.openPlaylistDetail('playlist-1')
    await viewModel.playPlaylistTrackAt(0)

    expect(loadPlaylistSongsMock).toHaveBeenCalledWith('playlist-1')
    expect(setPlaylistMock).toHaveBeenCalledWith(playlistSongs)
    expect(setSongListMock).toHaveBeenCalledWith(playlistSongs)
    expect(playSongWithDetailsMock).toHaveBeenCalledWith(0)
    expect(pushMock).toHaveBeenCalledWith('/')

    vi.clearAllMocks()

    await viewModel.playPlaylist('playlist-1')

    expect(loadPlaylistSongsMock).toHaveBeenCalledTimes(0)
    expect(setPlaylistMock).toHaveBeenCalledWith(playlistSongs)
    expect(setSongListMock).toHaveBeenCalledWith(playlistSongs)
    expect(playSongWithDetailsMock).toHaveBeenCalledWith(0)
    expect(pushMock).toHaveBeenCalledWith('/')
    expect(viewModel.loadingMap.value.playlist).toBe(false)

    vi.clearAllMocks()

    await viewModel.openAlbumDetail('album-1')
    await viewModel.playAlbumTrackAt(0)

    expect(loadAlbumSongsMock).toHaveBeenCalledWith('album-1')
    expect(setPlaylistMock).toHaveBeenCalledWith(albumSongs)
    expect(setSongListMock).toHaveBeenCalledWith(albumSongs)
    expect(playSongWithDetailsMock).toHaveBeenCalledWith(0)
    expect(pushMock).toHaveBeenCalledWith('/')

    vi.clearAllMocks()

    await viewModel.playAlbum('album-1')

    expect(loadAlbumSongsMock).toHaveBeenCalledTimes(0)
    expect(setPlaylistMock).toHaveBeenCalledWith(albumSongs)
    expect(setSongListMock).toHaveBeenCalledWith(albumSongs)
    expect(playSongWithDetailsMock).toHaveBeenCalledWith(0)
    expect(pushMock).toHaveBeenCalledWith('/')
    expect(viewModel.loadingMap.value.album).toBe(false)
  })

  it('routes playlist detail failures into the playback error path', async () => {
    const detailError = new Error('detail failed')
    const factory = createUserCenterPageDeps()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    factory.loadPlaylistSongsMock.mockRejectedValue(detailError)

    const { playSongWithDetailsMock, setPlaylistMock, setSongListMock, viewModel } =
      mountUserCenterPage(factory)

    try {
      await flushPromises()
      await viewModel.openPlaylistDetail('playlist-1')
      vi.clearAllMocks()

      await viewModel.playPlaylist('playlist-1')

      expect(setPlaylistMock).not.toHaveBeenCalled()
      expect(setSongListMock).not.toHaveBeenCalled()
      expect(playSongWithDetailsMock).not.toHaveBeenCalled()
      expect(viewModel.playlistDetailError.value).toBe(detailError)
      expect(consoleErrorSpy).toHaveBeenCalledWith('获取歌单详情失败:', detailError)
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('routes album detail failures into the playback error path', async () => {
    const detailError = new Error('detail failed')
    const factory = createUserCenterPageDeps()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    factory.loadAlbumSongsMock.mockRejectedValue(detailError)

    const { playSongWithDetailsMock, setPlaylistMock, setSongListMock, viewModel } =
      mountUserCenterPage(factory)

    try {
      await flushPromises()
      await viewModel.openAlbumDetail('album-1')
      vi.clearAllMocks()

      await viewModel.playAlbum('album-1')

      expect(setPlaylistMock).not.toHaveBeenCalled()
      expect(setSongListMock).not.toHaveBeenCalled()
      expect(playSongWithDetailsMock).not.toHaveBeenCalled()
      expect(viewModel.albumDetailError.value).toBe(detailError)
      expect(consoleErrorSpy).toHaveBeenCalledWith('获取专辑详情失败:', detailError)
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('ignores stale playlist play requests when a newer target starts playing first', async () => {
    const firstPlaylistDeferred = createDeferred<Song[]>()
    const secondPlaylistSongs = [
      createSong({
        id: 'playlist-song-2',
        name: 'Playlist Song 2',
        platform: 'netease'
      })
    ]
    const factory = createUserCenterPageDeps()

    factory.loadPlaylistSongsMock.mockImplementation(playlistId => {
      if (playlistId === 'playlist-1') {
        return firstPlaylistDeferred.promise
      }

      return Promise.resolve(secondPlaylistSongs)
    })

    const { playSongWithDetailsMock, setPlaylistMock, setSongListMock, viewModel } =
      mountUserCenterPage(factory)

    await flushPromises()

    const firstPlay = viewModel.playPlaylist('playlist-1')
    await nextTick()
    const secondPlay = viewModel.playPlaylist('playlist-2')

    firstPlaylistDeferred.resolve([
      createSong({
        id: 'playlist-song-1',
        name: 'Playlist Song 1',
        platform: 'netease'
      })
    ])

    await Promise.all([firstPlay, secondPlay])
    await flushPromises()

    expect(setPlaylistMock).toHaveBeenCalledTimes(1)
    expect(setPlaylistMock).toHaveBeenCalledWith(secondPlaylistSongs)
    expect(setSongListMock).toHaveBeenCalledTimes(1)
    expect(setSongListMock).toHaveBeenCalledWith(secondPlaylistSongs)
    expect(playSongWithDetailsMock).toHaveBeenCalledTimes(1)
    expect(playSongWithDetailsMock).toHaveBeenCalledWith(0)
  })

  it('ignores stale album play requests when a newer target starts playing first', async () => {
    const firstAlbumDeferred = createDeferred<Song[]>()
    const secondAlbumSongs = [
      createSong({
        id: 'album-song-2',
        name: 'Album Song 2',
        platform: 'netease'
      })
    ]
    const factory = createUserCenterPageDeps()

    factory.loadAlbumSongsMock.mockImplementation(albumId => {
      if (albumId === 'album-1') {
        return firstAlbumDeferred.promise
      }

      return Promise.resolve(secondAlbumSongs)
    })

    const { playSongWithDetailsMock, setPlaylistMock, setSongListMock, viewModel } =
      mountUserCenterPage(factory)

    await flushPromises()

    const firstPlay = viewModel.playAlbum('album-1')
    await nextTick()
    const secondPlay = viewModel.playAlbum('album-2')

    firstAlbumDeferred.resolve([
      createSong({
        id: 'album-song-1',
        name: 'Album Song 1',
        platform: 'netease'
      })
    ])

    await Promise.all([firstPlay, secondPlay])
    await flushPromises()

    expect(setPlaylistMock).toHaveBeenCalledTimes(1)
    expect(setPlaylistMock).toHaveBeenCalledWith(secondAlbumSongs)
    expect(setSongListMock).toHaveBeenCalledTimes(1)
    expect(setSongListMock).toHaveBeenCalledWith(secondAlbumSongs)
    expect(playSongWithDetailsMock).toHaveBeenCalledTimes(1)
    expect(playSongWithDetailsMock).toHaveBeenCalledWith(0)
  })

  it('exposes liked songs pagination state and delegates incremental loading', async () => {
    const { retryLoadLikedSongsMock, viewModel, loadMoreLikedSongsMock } = mountUserCenterPage()

    await flushPromises()

    expect(viewModel.likedSongsHasMore.value).toBe(true)
    expect(viewModel.likedSongsLoadingMore.value).toBe(false)

    await viewModel.loadMoreLikedSongs()

    expect(loadMoreLikedSongsMock).toHaveBeenCalledTimes(1)

    await viewModel.retryLoadLikedSongs()

    expect(retryLoadLikedSongsMock).toHaveBeenCalledTimes(1)
  })

  it('exposes events filtering, pagination, and playback actions', async () => {
    const eventSong = createSong({
      id: 'event-song-1',
      name: 'Event Song 1',
      platform: 'netease'
    })
    const factory = createUserCenterPageDeps({
      tab: 'events'
    })

    const {
      loadMoreEventsMock,
      retryLoadEventsMock,
      setPlaylistMock,
      setSongListMock,
      playSongWithDetailsMock,
      pushMock,
      viewModel
    } = mountUserCenterPage(factory)

    await flushPromises()

    expect(viewModel.eventsFilter.value).toBe('all')

    viewModel.setEventsFilter('song')
    await viewModel.loadMoreEvents()
    await viewModel.retryLoadEvents()
    await viewModel.playEventSong(eventSong)

    expect(loadMoreEventsMock).toHaveBeenCalledTimes(1)
    expect(retryLoadEventsMock).toHaveBeenCalledTimes(1)
    expect(setPlaylistMock).toHaveBeenCalledWith([eventSong])
    expect(setSongListMock).toHaveBeenCalledWith([eventSong])
    expect(playSongWithDetailsMock).toHaveBeenCalledWith(0)
    expect(pushMock).toHaveBeenCalledWith('/')
  })
})
