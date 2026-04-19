import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { vi } from 'vitest'

import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryPage,
  LocalLibraryScanStatus,
  LocalLibraryState,
  LocalLibraryTrack
} from '@/types/localLibrary'
import type { Song } from '@/types/schemas'

export function createLocalLibraryTrack(song: Song, index = 0): LocalLibraryTrack {
  return {
    id: String(song.id),
    folderId: 'folder-1',
    filePath: `D:\\Music\\${song.name}.mp3`,
    fileName: `${song.name}.mp3`,
    title: song.name,
    artist: song.artists.map(artist => artist.name).join(' / '),
    album: song.album.name,
    duration: song.duration,
    fileSize: 1024,
    modifiedAt: Date.now() + index,
    coverHash: null,
    song
  }
}

export function createSupportedLocalLibraryState(localSongs: Song[] = []): LocalLibraryState {
  return {
    supported: true,
    folders: localSongs.length
      ? [
          {
            id: 'folder-1',
            path: 'D:\\Music',
            name: 'Music',
            enabled: true,
            createdAt: Date.now(),
            lastScannedAt: Date.now(),
            songCount: localSongs.length
          }
        ]
      : [],
    tracks: [],
    status: {
      phase: 'idle',
      scannedFolders: localSongs.length ? 1 : 0,
      scannedFiles: localSongs.length,
      discoveredTracks: localSongs.length,
      currentFolder: null,
      startedAt: null,
      finishedAt: localSongs.length ? Date.now() : null,
      message: localSongs.length ? `已收录 ${localSongs.length} 首本地歌曲` : '还没有扫描本地音乐'
    }
  }
}

type LocalLibraryMockOverrides = {
  albumsPage?: Ref<LocalLibraryPage<LocalLibraryAlbumSummary>>
  artistsPage?: Ref<LocalLibraryPage<LocalLibraryArtistSummary>>
  coverUrls?: Ref<Record<string, string>>
  loading?: Ref<boolean>
  mutating?: Ref<boolean>
  pageLoading?: Ref<boolean>
  songsPage?: Ref<LocalLibraryPage<LocalLibraryTrack>>
  state?: Ref<LocalLibraryState>
  status?: Ref<LocalLibraryScanStatus> | ComputedRef<LocalLibraryScanStatus>
  refresh?: ReturnType<typeof vi.fn>
  addFolder?: ReturnType<typeof vi.fn>
  removeFolder?: ReturnType<typeof vi.fn>
  setFolderEnabled?: ReturnType<typeof vi.fn>
  rescan?: ReturnType<typeof vi.fn>
  loadTracks?: ReturnType<typeof vi.fn>
  loadArtists?: ReturnType<typeof vi.fn>
  loadAlbums?: ReturnType<typeof vi.fn>
}

export function createLocalLibraryMock(overrides: LocalLibraryMockOverrides = {}) {
  const state =
    overrides.state ??
    ref<LocalLibraryState>({
      supported: false,
      folders: [],
      tracks: [],
      status: {
        phase: 'idle',
        scannedFolders: 0,
        scannedFiles: 0,
        discoveredTracks: 0,
        currentFolder: null,
        startedAt: null,
        finishedAt: null,
        message: '本地音乐仅支持 Electron 桌面端'
      }
    })
  const status = overrides.status ?? computed<LocalLibraryScanStatus>(() => state.value.status)
  const loading = overrides.loading ?? ref(false)
  const pageLoading = overrides.pageLoading ?? ref(false)
  const mutating = overrides.mutating ?? ref(false)
  const songsPage =
    overrides.songsPage ??
    ref<LocalLibraryPage<LocalLibraryTrack>>({
      items: [],
      nextCursor: null,
      total: 0,
      limit: 60
    })
  const artistsPage =
    overrides.artistsPage ??
    ref<LocalLibraryPage<LocalLibraryArtistSummary>>({
      items: [],
      nextCursor: null,
      total: 0,
      limit: 60
    })
  const albumsPage =
    overrides.albumsPage ??
    ref<LocalLibraryPage<LocalLibraryAlbumSummary>>({
      items: [],
      nextCursor: null,
      total: 0,
      limit: 60
    })
  const coverUrls = overrides.coverUrls ?? ref({})

  const refresh = overrides.refresh ?? vi.fn()
  const addFolder = overrides.addFolder ?? vi.fn()
  const removeFolder = overrides.removeFolder ?? vi.fn()
  const setFolderEnabled = overrides.setFolderEnabled ?? vi.fn()
  const rescan = overrides.rescan ?? vi.fn()
  const loadTracks = overrides.loadTracks ?? vi.fn()
  const loadArtists = overrides.loadArtists ?? vi.fn()
  const loadAlbums = overrides.loadAlbums ?? vi.fn()

  return {
    stateGroup: {
      loading,
      mutating,
      pageLoading,
      refresh,
      state,
      status
    },
    queries: {
      albumsPage,
      artistsPage,
      coverUrls,
      loadAlbums,
      loadArtists,
      loadTracks,
      songsPage
    },
    commands: {
      addFolder,
      removeFolder,
      rescan,
      setFolderEnabled
    },
    state,
    status,
    loading,
    pageLoading,
    mutating,
    songsPage,
    artistsPage,
    albumsPage,
    coverUrls,
    refresh,
    addFolder,
    removeFolder,
    setFolderEnabled,
    rescan,
    loadTracks,
    loadArtists,
    loadAlbums
  }
}

export function createLocalLibraryMockFromSongs(localSongs: Song[] = []) {
  const state = ref(createSupportedLocalLibraryState(localSongs))

  return createLocalLibraryMock({
    state,
    status: computed(() => state.value.status),
    songsPage: ref({
      items: localSongs.map((song, index) => createLocalLibraryTrack(song, index)),
      nextCursor: null,
      total: localSongs.length,
      limit: 60
    }),
    coverUrls: ref({}),
    loadTracks: vi.fn().mockResolvedValue(undefined)
  })
}
