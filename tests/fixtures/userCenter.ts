import { computed, reactive, ref } from 'vue'
import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import { vi } from 'vitest'

import type { FavoriteAlbumItem } from '@/composables/useFavoriteAlbums'
import type { EventItem } from '@/composables/useUserEvents'
import type { PlaylistItem } from '@/composables/useUserPlaylists'
import type { UseUserCenterPageDeps } from '@/composables/useUserCenterPage'
import { createSong, type Song } from '@/platform/music/interface'
import { formatSongs } from '@/utils/songFormatter'

export type UserStoreState = {
  isLoggedIn: boolean
  userId: string | null
  avatarUrl: string
  nickname: string
}

type RouteState = {
  query: LocationQuery
}

export type UserCenterPageMockState = {
  activeTab: 'liked' | 'playlist' | 'album' | 'events'
  loadingMap: Record<'liked' | 'playlist' | 'album' | 'events', boolean>
  mountedTabs: Record<'liked' | 'playlist' | 'album' | 'events', boolean>
  loadedTabs: Record<'liked' | 'playlist' | 'album' | 'events', boolean>
  currentUserId: string | null
  avatarUrl: string
  nickname: string
  playingPlaylistId: string | null
  playingAlbumId: string | null
  activeTabError: unknown
  selectedPlaylistId: string | null
  selectedPlaylist: Record<string, unknown> | null
  selectedPlaylistSongs: Array<Record<string, unknown>>
  playlistDetailLoading: boolean
  playlistDetailError: unknown
  selectedAlbumId: string | null
  selectedAlbum: Record<string, unknown> | null
  selectedAlbumSongs: Array<Record<string, unknown>>
  albumDetailLoading: boolean
  albumDetailError: unknown
  formattedSongs: Array<Record<string, unknown>>
  playlists: Array<Record<string, unknown>>
  favoritePlaylists: Array<Record<string, unknown>>
  albums: Array<Record<string, unknown>>
  events: Array<Record<string, unknown>>
  tabCounts: Record<'liked' | 'playlist' | 'album' | 'events', number>
  likedSongsHasMore: boolean
  likedSongsLoadingMore: boolean
  likedSongsError: unknown
  eventsFilter: 'all' | 'song'
  eventsHasMore: boolean
  eventsLoadingMore: boolean
  eventsError: unknown
}

export function assignDefaultUserCenterPageMockState(state: UserCenterPageMockState) {
  state.activeTab = 'liked'
  state.loadingMap = {
    liked: false,
    playlist: false,
    album: false,
    events: false
  }
  state.mountedTabs = {
    liked: true,
    playlist: true,
    album: true,
    events: true
  }
  state.loadedTabs = {
    liked: true,
    playlist: false,
    album: false,
    events: false
  }
  state.currentUserId = 'user-1'
  state.avatarUrl = 'avatar.png'
  state.nickname = 'tester'
  state.playingPlaylistId = null
  state.playingAlbumId = null
  state.activeTabError = null
  state.selectedPlaylistId = null
  state.selectedPlaylist = null
  state.selectedPlaylistSongs = []
  state.playlistDetailLoading = false
  state.playlistDetailError = null
  state.selectedAlbumId = null
  state.selectedAlbum = null
  state.selectedAlbumSongs = []
  state.albumDetailLoading = false
  state.albumDetailError = null
  state.formattedSongs = [
    {
      id: 'song-1',
      name: 'Song 1',
      artist: 'Artist 1',
      album: 'Album 1',
      cover: 'cover.jpg',
      duration: 180
    }
  ]
  state.playlists = [
    {
      id: 'playlist-1',
      name: 'Playlist 1',
      coverImgUrl: 'cover.jpg',
      trackCount: 12,
      playCount: 32000
    }
  ]
  state.favoritePlaylists = [
    {
      id: 'playlist-favorite-1',
      name: 'Favorite Playlist 1',
      coverImgUrl: 'favorite-cover.jpg',
      trackCount: 18,
      playCount: 64000,
      subscribed: true
    }
  ]
  state.albums = [
    {
      id: 'album-1',
      name: 'Album 1',
      picUrl: 'album-cover.jpg',
      size: 10,
      artistName: 'Artist 1'
    }
  ]
  state.events = [
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
  ]
  state.tabCounts = {
    liked: 1,
    playlist: 1,
    album: 1,
    events: 1
  }
  state.likedSongsHasMore = true
  state.likedSongsLoadingMore = false
  state.likedSongsError = null
  state.eventsFilter = 'all'
  state.eventsHasMore = true
  state.eventsLoadingMore = false
  state.eventsError = null
}

export function createUserCenterPageDeps(initialQuery: LocationQuery = {}) {
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
