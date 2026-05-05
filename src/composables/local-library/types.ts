import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryPage,
  LocalLibraryScanStatus,
  LocalLibraryState,
  LocalLibrarySummaryQuery,
  LocalLibraryTrack,
  LocalLibraryTrackQuery
} from '@/types/localLibrary'
import type { Ref } from 'vue'

export interface LocalLibraryPlatformService {
  addLocalLibraryFolder: (folderPath: string) => Promise<LocalLibraryState>
  getLocalLibraryAlbums: (
    query?: LocalLibrarySummaryQuery
  ) => Promise<LocalLibraryPage<LocalLibraryAlbumSummary>>
  getLocalLibraryArtists: (
    query?: LocalLibrarySummaryQuery
  ) => Promise<LocalLibraryPage<LocalLibraryArtistSummary>>
  getLocalLibraryCover: (coverHash: string) => Promise<string | null>
  getLocalLibraryState: () => Promise<LocalLibraryState>
  getLocalLibraryTracks: (
    query?: LocalLibraryTrackQuery
  ) => Promise<LocalLibraryPage<LocalLibraryTrack>>
  on: (event: string, handler: (payload: unknown) => void) => () => void
  pickLocalLibraryFolder: () => Promise<string | null>
  removeLocalLibraryFolder: (folderId: string) => Promise<LocalLibraryState>
  scanLocalLibrary: () => Promise<LocalLibraryState>
  setLocalLibraryFolderEnabled: (folderId: string, enabled: boolean) => Promise<LocalLibraryState>
}

export type LocalLibraryPageRunner = <T>(task: () => Promise<T>) => Promise<T>
export type LocalLibraryRequestRunner = <T>(task: () => Promise<T>) => Promise<T>
export type LocalLibraryMutationRunner = <T>(task: () => Promise<T>) => Promise<T>

export type LocalLibraryStateUpdateHandler = (nextState: LocalLibraryState) => void
export type LocalLibraryStatusUpdateHandler = (nextStatus: LocalLibraryScanStatus) => void

export interface UseLocalLibraryStateGroup {
  loading: Ref<boolean>
  mutating: Ref<boolean>
  pageLoading: Ref<boolean>
  refresh: () => Promise<void>
  state: Ref<LocalLibraryState>
  status: Ref<LocalLibraryScanStatus>
}

export interface UseLocalLibraryQueriesGroup {
  albumsPage: Ref<LocalLibraryPage<LocalLibraryAlbumSummary>>
  artistsPage: Ref<LocalLibraryPage<LocalLibraryArtistSummary>>
  coverUrls: Ref<Record<string, string>>
  loadAlbums: (query?: LocalLibrarySummaryQuery, append?: boolean) => Promise<void>
  loadArtists: (query?: LocalLibrarySummaryQuery, append?: boolean) => Promise<void>
  loadTracks: (query?: LocalLibraryTrackQuery, append?: boolean) => Promise<void>
  patchTrackDuration: (trackId: string | number, durationMs: number) => void
  songsPage: Ref<LocalLibraryPage<LocalLibraryTrack>>
}

export interface UseLocalLibraryCommandsGroup {
  addFolder: () => Promise<LocalLibraryState | null>
  removeFolder: (folderId: string) => Promise<LocalLibraryState>
  rescan: () => Promise<LocalLibraryState>
  setFolderEnabled: (folderId: string, enabled: boolean) => Promise<LocalLibraryState>
}
