import { ref } from 'vue'

import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryPage,
  LocalLibrarySummaryQuery,
  LocalLibraryTrack,
  LocalLibraryTrackQuery
} from '@/types/localLibrary'
import { createEmptyLocalLibraryPage } from '@/types/localLibrary'
import { CoverCacheManager } from '@/utils/cache/coverCache'

import type { LocalLibraryPageRunner, LocalLibraryPlatformService } from './types'

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

export function useLocalLibraryQueries(
  platformService: LocalLibraryPlatformService,
  runPageRequest: LocalLibraryPageRunner
) {
  const songsPage = ref<LocalLibraryPage<LocalLibraryTrack>>(createEmptyLocalLibraryPage())
  const artistsPage = ref<LocalLibraryPage<LocalLibraryArtistSummary>>(
    createEmptyLocalLibraryPage()
  )
  const albumsPage = ref<LocalLibraryPage<LocalLibraryAlbumSummary>>(createEmptyLocalLibraryPage())
  const coverUrls = ref<Record<string, string>>({})
  const lastTrackQuery = ref<LocalLibraryTrackQuery | null>(null)
  const lastArtistQuery = ref<LocalLibrarySummaryQuery | null>(null)
  const lastAlbumQuery = ref<LocalLibrarySummaryQuery | null>(null)

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

    const nextPage = await runPageRequest(() => platformService.getLocalLibraryTracks(requestQuery))
    await ensureCoverUrls(nextPage.items.map(track => track.coverHash))
    songsPage.value = mergePageItems(songsPage.value, nextPage, append)
    lastTrackQuery.value = {
      ...requestQuery,
      cursor: null
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

    const nextPage = await runPageRequest(() =>
      platformService.getLocalLibraryArtists(requestQuery)
    )
    await ensureCoverUrls(nextPage.items.map(artist => artist.coverHash))
    artistsPage.value = mergePageItems(artistsPage.value, nextPage, append)
    lastArtistQuery.value = {
      ...requestQuery,
      cursor: null
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

    const nextPage = await runPageRequest(() => platformService.getLocalLibraryAlbums(requestQuery))
    await ensureCoverUrls(nextPage.items.map(album => album.coverHash))
    albumsPage.value = mergePageItems(albumsPage.value, nextPage, append)
    lastAlbumQuery.value = {
      ...requestQuery,
      cursor: null
    }
  }

  async function loadInitialPages(): Promise<void> {
    await Promise.all([loadTracks(), loadArtists(), loadAlbums()])
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

  return {
    albumsPage,
    artistsPage,
    coverUrls,
    loadAlbums,
    loadArtists,
    loadInitialPages,
    loadTracks,
    reloadLoadedPages,
    songsPage
  }
}
