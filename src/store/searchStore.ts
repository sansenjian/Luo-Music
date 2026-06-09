import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import type { Song } from '@/platform/music/interface'
import { services } from '@/services'
import type { LoggerService } from '@/services/loggerService'
import type { MusicService } from '@/services/musicService'
import type { PlatformService } from '@/services/platformService'
import { storageAdapter } from '@/services/storageService'
import type { LocalLibraryPage, LocalLibraryTrack } from '@shared/types/localLibrary'
import { handleApiError } from '@/utils/error/legacy'
import { isCanceledRequestError } from '@/utils/http/cancelError'
import { createLatestRequestController } from '@/utils/http/requestScope'
import {
  isUnknownLocalArtist,
  normalizeDisplayText,
  resolveLocalTrackAlbum,
  resolveLocalTrackArtist,
  resolveLocalTrackName
} from '@/utils/localLibrary/display'
import { usePlayerStore } from './playerStore'
import { usePlaylistStore } from './playlistStore'

export interface SearchResultItem {
  id: string | number
  name: string
  artist: string
  album: string
  pic: string
  cover: string
  url: null
  platform: string
  duration: number
  /** Preserved original Song to avoid double-conversion when playing */
  _song?: Song
  [key: string]: unknown
}

const SEARCH_PAGE_SIZE = 50
const MAX_SEARCH_PAGES = 100
const PARALLEL_PAGE_BATCH = 3

export function searchResultItemToSong(item: SearchResultItem): Song {
  if (item._song) return item._song

  const { id, name, artist, album, pic, cover, url, platform, duration, ...extraFields } = item

  return {
    id,
    name,
    artists: [{ id: 0, name: artist }],
    album: { id: 0, name: album, picUrl: cover || pic || '' },
    duration: duration * 1000,
    mvid:
      typeof extraFields.mvid === 'string' || typeof extraFields.mvid === 'number'
        ? extraFields.mvid
        : 0,
    platform: platform as Song['platform'],
    originalId: id,
    ...(url ? { url } : {}),
    ...extraFields
  }
}

function normalizeSearchResults(songs: Song[]): SearchResultItem[] {
  return songs.map(song => {
    const item: SearchResultItem = {
      id: song.id,
      name: song.name,
      artist: song.artists.map(artist => artist.name).join(' / '),
      album: song.album.name || '',
      pic: song.album.picUrl || '',
      cover: song.album.picUrl || '',
      url: null,
      platform: song.platform,
      duration: Math.floor(song.duration / 1000),
      _song: song
    }

    if (song.extra) {
      Object.assign(item, song.extra)
    }

    return item
  })
}

export type SearchStoreDeps = {
  logger?: Pick<LoggerService, 'info' | 'debug' | 'warn' | 'error'>
  musicService?: Pick<
    MusicService,
    'getDefaultSearchPlatformId' | 'getSearchPlatformOptions' | 'search'
  >
  platformService?: PlatformService
  getPlayerStore?: typeof usePlayerStore
  getPlaylistStore?: typeof usePlaylistStore
  createRequestController?: typeof createLatestRequestController
}

export type SearchStoreOptions = {
  storeId?: string
}

function getDefaultSearchStoreDeps(): Required<SearchStoreDeps> {
  return {
    logger: services.logger(),
    musicService: services.music(),
    platformService: services.platform(),
    getPlayerStore: usePlayerStore,
    getPlaylistStore: usePlaylistStore,
    createRequestController: createLatestRequestController
  }
}

function resolveSearchPlatformId(
  musicService: Pick<MusicService, 'getDefaultSearchPlatformId' | 'getSearchPlatformOptions'>,
  serverId?: string
): string {
  const searchPlatformOptions = musicService.getSearchPlatformOptions()

  if (serverId && searchPlatformOptions.some(option => option.value === serverId)) {
    return serverId
  }

  return searchPlatformOptions[0]?.value ?? musicService.getDefaultSearchPlatformId()
}

function hasMeaningfulSongArtists(song: Song): boolean {
  return song.artists.some(artist => {
    const artistName = normalizeDisplayText(artist.name)
    return artistName.length > 0 && !isUnknownLocalArtist(artistName)
  })
}

function localTrackToSearchResult(track: LocalLibraryTrack): SearchResultItem {
  const fallbackName = resolveLocalTrackName(track)
  const fallbackArtist = resolveLocalTrackArtist(track)
  const fallbackAlbum = resolveLocalTrackAlbum(track)
  const song: Song = {
    ...track.song,
    name: fallbackName,
    artists: hasMeaningfulSongArtists(track.song)
      ? track.song.artists
      : [{ id: 0, name: fallbackArtist }],
    album: {
      ...track.song.album,
      name: fallbackAlbum,
      picUrl: track.song.album.picUrl || ''
    }
  }
  const item: SearchResultItem = {
    id: track.song.id,
    name: fallbackName,
    artist: fallbackArtist,
    album: fallbackAlbum,
    pic: song.album.picUrl || '',
    cover: song.album.picUrl || '',
    url: null,
    platform: 'local',
    duration: Math.floor(track.duration / 1000),
    _song: song
  }

  if (song.extra) {
    Object.assign(item, song.extra)
  }

  return item
}

export function createSearchStore(deps: SearchStoreDeps = {}, options: SearchStoreOptions = {}) {
  const storeId = options.storeId ?? 'searchStore'
  return defineStore(
    storeId,
    () => {
      const {
        logger,
        musicService,
        platformService,
        getPlayerStore,
        getPlaylistStore,
        createRequestController
      } = {
        ...getDefaultSearchStoreDeps(),
        ...deps
      }
      const keyword = ref('')
      const results = ref<SearchResultItem[]>([])
      const server = ref(resolveSearchPlatformId(musicService))
      const isLoading = ref(false)
      const error = ref<string | null>(null)
      const totalResults = ref(0)
      const hasResults = computed(() => results.value.length > 0)
      const activeSearch = createRequestController()

      watch(
        server,
        serverId => {
          const resolvedServerId = resolveSearchPlatformId(musicService, serverId)

          if (resolvedServerId !== serverId) {
            logger.warn('searchStore', 'Reset invalid search platform', {
              requestedServerId: serverId,
              resolvedServerId
            })
            server.value = resolvedServerId
          }
        },
        { immediate: true }
      )

      function setServer(serverId: string) {
        const resolvedServerId = resolveSearchPlatformId(musicService, serverId)

        if (resolvedServerId !== serverId) {
          logger.warn('searchStore', 'Requested unsupported search platform', {
            requestedServerId: serverId,
            resolvedServerId
          })
        }

        server.value = resolvedServerId
        logger.info('searchStore', 'Server changed', {
          serverId: resolvedServerId,
          requestedServerId: serverId
        })
      }

      function formatError(err: unknown): string {
        const appError = handleApiError(err)
        return appError.message
      }

      async function search(searchKeyword: string) {
        if (!searchKeyword?.trim()) {
          const message = 'Please enter a search keyword'
          error.value = message
          throw new Error(message)
        }

        const trimmedKeyword = searchKeyword.trim()
        const task = activeSearch.start()
        keyword.value = trimmedKeyword
        isLoading.value = true
        error.value = null

        const activeServer = resolveSearchPlatformId(musicService, server.value)
        if (activeServer !== server.value) {
          server.value = activeServer
        }

        logger.info('searchStore', 'Starting search', {
          keyword: trimmedKeyword,
          server: activeServer
        })

        if (activeServer === 'local') {
          try {
            const localItems: SearchResultItem[] = []
            let nextCursor: string | null = null
            let total = 0
            let pageCount = 0

            do {
              const page: LocalLibraryPage<LocalLibraryTrack> = await task.guard(
                platformService.getLocalLibraryTracks({
                  search: trimmedKeyword,
                  limit: SEARCH_PAGE_SIZE,
                  cursor: nextCursor
                })
              )
              const nextItems = page.items.map(localTrackToSearchResult)
              localItems.push(...nextItems)
              total = page.total
              nextCursor = page.nextCursor
              pageCount += 1

              task.commit(() => {
                results.value = [...localItems]
                totalResults.value = total
              })

              if (pageCount >= MAX_SEARCH_PAGES && nextCursor) {
                logger.warn('searchStore', 'Local search paging stopped at safety limit', {
                  keyword: trimmedKeyword,
                  loadedCount: localItems.length,
                  total,
                  pageLimit: MAX_SEARCH_PAGES
                })
                break
              }
            } while (nextCursor)

            task.commit(() => {
              isLoading.value = false
            })

            if (localItems.length === 0) {
              error.value = '没有找到匹配的本地音乐'
            }
          } catch (err: unknown) {
            if (isCanceledRequestError(err)) return

            const errorMessage = formatError(err)
            logger.error('searchStore', 'Local search error', { errorMessage, err })

            task.commit(() => {
              error.value = errorMessage
              results.value = []
              totalResults.value = 0
              isLoading.value = false
            })

            throw new Error(errorMessage, { cause: err })
          }
          return
        }

        let hasCommittedCurrentSearchResults = false

        try {
          const firstPage = await task.guard(
            musicService.search(activeServer, trimmedKeyword, SEARCH_PAGE_SIZE, 1)
          )

          logger.debug('searchStore', 'Search result page', {
            page: 1,
            response: firstPage
          })

          if (!firstPage?.list || !Array.isArray(firstPage.list)) {
            throw new Error('Invalid search result payload')
          }

          const initialTotal =
            typeof firstPage.total === 'number' && firstPage.total > 0 ? firstPage.total : undefined

          if (firstPage.list.length === 0) {
            task.commit(() => {
              results.value = []
              totalResults.value = 0
              error.value = 'No songs found for the current keyword'
            })
            return
          }

          task.commit(() => {
            totalResults.value = initialTotal ?? firstPage.list.length
            results.value = normalizeSearchResults(firstPage.list)
            hasCommittedCurrentSearchResults = true

            logger.info('searchStore', 'Search first page loaded', {
              count: results.value.length,
              total: totalResults.value
            })
          })

          // Load remaining pages in parallel batches
          let loadedCount = firstPage.list.length
          let nextPage = 2
          let total = initialTotal
          let shouldContinue = total === undefined || loadedCount < (total ?? 0)

          while (shouldContinue && nextPage <= MAX_SEARCH_PAGES) {
            const remaining = total !== undefined ? total - loadedCount : SEARCH_PAGE_SIZE
            const pagesNeeded = Math.ceil(remaining / SEARCH_PAGE_SIZE)
            const batchSize = Math.min(pagesNeeded, PARALLEL_PAGE_BATCH)

            const batchPromises = Array.from({ length: batchSize }, (_, i) =>
              task
                .guard(
                  musicService.search(activeServer, trimmedKeyword, SEARCH_PAGE_SIZE, nextPage + i)
                )
                .then(result => ({ result, page: nextPage + i }))
            )

            const batchResults = await Promise.all(batchPromises)

            let hasEmptyPage = false
            for (const entry of batchResults) {
              if (!entry?.result) continue
              const { result: pageResult } = entry

              if (!pageResult?.list || !Array.isArray(pageResult.list)) continue

              if (typeof pageResult.total === 'number' && pageResult.total > 0) {
                total = Math.max(total ?? 0, pageResult.total)
              }

              if (pageResult.list.length === 0) {
                hasEmptyPage = true
                continue
              }

              const nextItems = normalizeSearchResults(pageResult.list)
              loadedCount += pageResult.list.length

              task.commit(() => {
                totalResults.value = total ?? loadedCount
                results.value = [...results.value, ...nextItems]
                hasCommittedCurrentSearchResults = true
              })

              if (pageResult.list.length < SEARCH_PAGE_SIZE) {
                hasEmptyPage = true
              }
            }

            if (hasEmptyPage) break

            nextPage += batchSize

            if (nextPage > MAX_SEARCH_PAGES) {
              logger.warn('searchStore', 'Search paging stopped at safety limit', {
                keyword: trimmedKeyword,
                server: activeServer,
                loadedCount,
                total,
                pageLimit: MAX_SEARCH_PAGES
              })
            }

            shouldContinue = total === undefined || loadedCount < (total ?? 0)
          }
        } catch (err: unknown) {
          if (isCanceledRequestError(err)) {
            logger.debug('searchStore', 'Search canceled', {
              keyword: trimmedKeyword,
              server: activeServer
            })
            return
          }

          const errorMessage = formatError(err)
          logger.error('searchStore', 'Search error', { errorMessage, err })

          task.commit(() => {
            error.value = errorMessage
            if (!hasCommittedCurrentSearchResults) {
              results.value = []
              totalResults.value = 0
            }
          })

          throw new Error(errorMessage, { cause: err })
        } finally {
          task.commit(() => {
            isLoading.value = false
          })
        }
      }

      async function playResult(index: number): Promise<void> {
        if (index < 0 || index >= results.value.length) {
          logger.warn('searchStore', 'Invalid index', { index })
          return
        }

        const playlistStore = getPlaylistStore()
        const playerStore = getPlayerStore()

        playlistStore.setPlaylist([...results.value])

        if (!playlistStore.playAt(index)) {
          return
        }

        const songList = results.value.map(searchResultItemToSong)
        playerStore.setSongList(songList)
        await playerStore.playSongWithDetails(index)
      }

      function addToPlaylist(index: number) {
        if (index < 0 || index >= results.value.length) return

        const playlistStore = getPlaylistStore()
        playlistStore.addSong(results.value[index])
      }

      function addAllToPlaylist() {
        const playlistStore = getPlaylistStore()
        playlistStore.addSongs(results.value)
      }

      function clearResults() {
        activeSearch.cancel()
        isLoading.value = false
        results.value = []
        error.value = null
        keyword.value = ''
        totalResults.value = 0
        logger.info('searchStore', 'Results cleared')
      }

      return {
        keyword,
        results,
        server,
        isLoading,
        error,
        totalResults,
        hasResults,
        setServer,
        search,
        playResult,
        addToPlaylist,
        addAllToPlaylist,
        clearResults
      }
    },
    {
      persist: {
        storage: storageAdapter,
        pick: ['server']
      }
    }
  )
}

export const useSearchStore = createSearchStore()
