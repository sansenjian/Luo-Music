import { onMounted, onUnmounted, ref } from 'vue'

import { RECEIVE_CHANNELS } from '../../electron/shared/protocol/channels'
import { services } from '@/services'
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
import {
  createEmptyLocalLibraryPage,
  createUnsupportedLocalLibraryState
} from '@/types/localLibrary'
import { CoverCacheManager } from '@/utils/cache/coverCache'

function mergePageItems<T>(
  currentPage: LocalLibraryPage<T>,
  nextPage: LocalLibraryPage<T>,
  append: boolean
): LocalLibraryPage<T> {
  if (!append) {
    return nextPage
  }

  return {
    ...nextPage,
    items: [...currentPage.items, ...nextPage.items]
  }
}

export function useLocalLibrary() {
  const platformService = services.platform()
  const state = ref<LocalLibraryState>(createUnsupportedLocalLibraryState())
  const loading = ref(false)
  const pageLoading = ref(false)
  const mutating = ref(false)
  const activeRequestCount = ref(0)
  const activePageRequestCount = ref(0)
  const currentStatus = ref<LocalLibraryScanStatus>(state.value.status)
  const songsPage = ref<LocalLibraryPage<LocalLibraryTrack>>(createEmptyLocalLibraryPage())
  const artistsPage = ref<LocalLibraryPage<LocalLibraryArtistSummary>>(
    createEmptyLocalLibraryPage()
  )
  const albumsPage = ref<LocalLibraryPage<LocalLibraryAlbumSummary>>(createEmptyLocalLibraryPage())
  const coverUrls = ref<Record<string, string>>({})
  const unsubscribers: Array<() => void> = []
  const lastTrackQuery = ref<LocalLibraryTrackQuery | null>(null)
  const lastArtistQuery = ref<LocalLibrarySummaryQuery | null>(null)
  const lastAlbumQuery = ref<LocalLibrarySummaryQuery | null>(null)

  function beginRequest(): void {
    activeRequestCount.value += 1
    loading.value = activeRequestCount.value > 0
  }

  function endRequest(): void {
    activeRequestCount.value = Math.max(0, activeRequestCount.value - 1)
    loading.value = activeRequestCount.value > 0
  }

  function beginPageRequest(): void {
    activePageRequestCount.value += 1
    pageLoading.value = activePageRequestCount.value > 0
  }

  function endPageRequest(): void {
    activePageRequestCount.value = Math.max(0, activePageRequestCount.value - 1)
    pageLoading.value = activePageRequestCount.value > 0
  }

  function applyState(nextState: LocalLibraryState): void {
    state.value = nextState
    currentStatus.value = nextState.status
  }

  async function ensureCoverUrls(coverHashes: Array<string | null | undefined>): Promise<void> {
    const uniqueHashes = [
      ...new Set(
        coverHashes.filter((hash): hash is string => typeof hash === 'string' && hash.length > 0)
      )
    ]

    await Promise.all(
      uniqueHashes.map(async coverHash => {
        if (coverUrls.value[coverHash]) {
          return
        }

        const cachedUrl = CoverCacheManager.get(coverHash)
        if (cachedUrl) {
          coverUrls.value = {
            ...coverUrls.value,
            [coverHash]: cachedUrl
          }
          return
        }

        const nextUrl = await platformService.getLocalLibraryCover(coverHash)
        if (!nextUrl) {
          return
        }

        CoverCacheManager.set(coverHash, nextUrl)
        coverUrls.value = {
          ...coverUrls.value,
          [coverHash]: nextUrl
        }
      })
    )
  }

  async function refresh(): Promise<void> {
    beginRequest()
    try {
      applyState(await platformService.getLocalLibraryState())
    } finally {
      endRequest()
    }
  }

  async function addFolder(): Promise<LocalLibraryState | null> {
    const folderPath = await platformService.pickLocalLibraryFolder()
    if (!folderPath) {
      return null
    }

    mutating.value = true
    beginRequest()
    try {
      const nextState = await platformService.addLocalLibraryFolder(folderPath)
      applyState(nextState)
      return nextState
    } finally {
      endRequest()
      mutating.value = false
    }
  }

  async function removeFolder(folderId: string): Promise<LocalLibraryState> {
    mutating.value = true
    beginRequest()
    try {
      const nextState = await platformService.removeLocalLibraryFolder(folderId)
      applyState(nextState)
      return nextState
    } finally {
      endRequest()
      mutating.value = false
    }
  }

  async function setFolderEnabled(folderId: string, enabled: boolean): Promise<LocalLibraryState> {
    mutating.value = true
    beginRequest()
    try {
      const nextState = await platformService.setLocalLibraryFolderEnabled(folderId, enabled)
      applyState(nextState)
      return nextState
    } finally {
      endRequest()
      mutating.value = false
    }
  }

  async function rescan(): Promise<LocalLibraryState> {
    mutating.value = true
    beginRequest()
    try {
      const nextState = await platformService.scanLocalLibrary()
      applyState(nextState)
      return nextState
    } finally {
      endRequest()
      mutating.value = false
    }
  }

  async function loadTracks(query: LocalLibraryTrackQuery = {}, append = false): Promise<void> {
    const requestQuery = append
      ? {
          ...(lastTrackQuery.value ?? query),
          cursor: songsPage.value.nextCursor
        }
      : {
          ...query,
          cursor: null
        }

    if (append && !songsPage.value.nextCursor) {
      return
    }

    beginPageRequest()
    try {
      const nextPage = await platformService.getLocalLibraryTracks(requestQuery)
      await ensureCoverUrls(nextPage.items.map(track => track.coverHash))
      songsPage.value = mergePageItems(songsPage.value, nextPage, append)
      lastTrackQuery.value = {
        ...requestQuery,
        cursor: null
      }
    } finally {
      endPageRequest()
    }
  }

  async function loadArtists(query: LocalLibrarySummaryQuery = {}, append = false): Promise<void> {
    const requestQuery = append
      ? {
          ...(lastArtistQuery.value ?? query),
          cursor: artistsPage.value.nextCursor
        }
      : {
          ...query,
          cursor: null
        }

    if (append && !artistsPage.value.nextCursor) {
      return
    }

    beginPageRequest()
    try {
      const nextPage = await platformService.getLocalLibraryArtists(requestQuery)
      await ensureCoverUrls(nextPage.items.map(artist => artist.coverHash))
      artistsPage.value = mergePageItems(artistsPage.value, nextPage, append)
      lastArtistQuery.value = {
        ...requestQuery,
        cursor: null
      }
    } finally {
      endPageRequest()
    }
  }

  async function loadAlbums(query: LocalLibrarySummaryQuery = {}, append = false): Promise<void> {
    const requestQuery = append
      ? {
          ...(lastAlbumQuery.value ?? query),
          cursor: albumsPage.value.nextCursor
        }
      : {
          ...query,
          cursor: null
        }

    if (append && !albumsPage.value.nextCursor) {
      return
    }

    beginPageRequest()
    try {
      const nextPage = await platformService.getLocalLibraryAlbums(requestQuery)
      await ensureCoverUrls(nextPage.items.map(album => album.coverHash))
      albumsPage.value = mergePageItems(albumsPage.value, nextPage, append)
      lastAlbumQuery.value = {
        ...requestQuery,
        cursor: null
      }
    } finally {
      endPageRequest()
    }
  }

  async function reloadLoadedPages(): Promise<void> {
    const tasks: Array<Promise<void>> = []

    if (lastTrackQuery.value) {
      tasks.push(loadTracks(lastTrackQuery.value))
    }
    if (lastArtistQuery.value) {
      tasks.push(loadArtists(lastArtistQuery.value))
    }
    if (lastAlbumQuery.value) {
      tasks.push(loadAlbums(lastAlbumQuery.value))
    }

    if (tasks.length === 0) {
      return
    }

    await Promise.all(tasks)
  }

  onMounted(() => {
    unsubscribers.push(
      platformService.on(RECEIVE_CHANNELS.LOCAL_LIBRARY_UPDATED, payload => {
        applyState(payload as LocalLibraryState)
        void reloadLoadedPages()
      })
    )
    unsubscribers.push(
      platformService.on(RECEIVE_CHANNELS.LOCAL_LIBRARY_SCAN_STATUS, payload => {
        currentStatus.value = payload as LocalLibraryScanStatus
        state.value = {
          ...state.value,
          status: currentStatus.value
        }
      })
    )

    void refresh().then(() => {
      if (state.value.supported) {
        void loadTracks()
        void loadArtists()
        void loadAlbums()
      }
    })
  })

  onUnmounted(() => {
    for (const unsubscribe of unsubscribers.splice(0)) {
      unsubscribe()
    }
  })

  return {
    state,
    status: currentStatus,
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
