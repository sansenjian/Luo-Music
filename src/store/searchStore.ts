import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { Song } from '../platform/music/interface'
import { services } from '../services'
import type { ErrorService } from '../services/errorService'
import type { LoggerService } from '../services/loggerService'
import type { MusicService } from '../services/musicService'
import { storageAdapter } from '../services/storageService'
import { isCanceledRequestError } from '../utils/http/cancelError'
import { createLatestRequestController } from '../utils/http/requestScope'
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
  [key: string]: unknown
}

const SEARCH_PAGE_SIZE = 50

export function searchResultItemToSong(item: SearchResultItem): Song {
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
      duration: Math.floor(song.duration / 1000)
    }

    if (song.extra) {
      Object.assign(item, song.extra)
    }

    return item
  })
}

export type SearchStoreDeps = {
  logger?: Pick<LoggerService, 'info' | 'debug' | 'warn' | 'error'>
  errorService?: Pick<ErrorService, 'handleApiError'>
  musicService?: Pick<MusicService, 'search'>
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
    errorService: services.error(),
    musicService: services.music(),
    getPlayerStore: usePlayerStore,
    getPlaylistStore: usePlaylistStore,
    createRequestController: createLatestRequestController
  }
}

export function createSearchStore(deps: SearchStoreDeps = {}, options: SearchStoreOptions = {}) {
  const storeId = options.storeId ?? 'searchStore'
  return defineStore(
    storeId,
    () => {
      const {
        logger,
        errorService,
        musicService,
        getPlayerStore,
        getPlaylistStore,
        createRequestController
      } = {
        ...getDefaultSearchStoreDeps(),
        ...deps
      }
      const keyword = ref('')
      const results = ref<SearchResultItem[]>([])
      const server = ref('netease')
      const isLoading = ref(false)
      const error = ref<string | null>(null)
      const totalResults = ref(0)
      const hasResults = computed(() => results.value.length > 0)
      const activeSearch = createRequestController()

      function setServer(serverId: string) {
        server.value = serverId
        logger.info('searchStore', 'Server changed', { serverId })
      }

      function formatError(err: unknown): string {
        const appError = errorService.handleApiError(err)
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

        logger.info('searchStore', 'Starting search', {
          keyword: trimmedKeyword,
          server: server.value
        })

        try {
          const firstPage = await task.guard(
            musicService.search(server.value, trimmedKeyword, SEARCH_PAGE_SIZE, 1)
          )

          logger.debug('searchStore', 'Search result page', {
            page: 1,
            response: firstPage
          })

          if (!firstPage?.list || !Array.isArray(firstPage.list)) {
            throw new Error('Invalid search result payload')
          }

          const initialTotal = Math.max(firstPage.total || 0, firstPage.list.length)

          if (firstPage.list.length === 0) {
            task.commit(() => {
              results.value = []
              totalResults.value = 0
              error.value = 'No songs found for the current keyword'
            })
            return
          }

          task.commit(() => {
            totalResults.value = initialTotal
            results.value = normalizeSearchResults(firstPage.list)

            logger.info('searchStore', 'Search first page loaded', {
              count: results.value.length,
              total: totalResults.value
            })
          })

          let loadedCount = firstPage.list.length
          let nextPage = 2
          let total = initialTotal

          while (loadedCount < total) {
            const pageResult = await task.guard(
              musicService.search(server.value, trimmedKeyword, SEARCH_PAGE_SIZE, nextPage)
            )

            logger.debug('searchStore', 'Search result page', {
              page: nextPage,
              response: pageResult
            })

            if (!pageResult?.list || !Array.isArray(pageResult.list)) {
              throw new Error('Invalid search result payload')
            }

            total = Math.max(total, pageResult.total || 0)

            if (pageResult.list.length === 0) {
              break
            }

            const nextItems = normalizeSearchResults(pageResult.list)
            loadedCount += pageResult.list.length
            total = Math.max(total, loadedCount)

            task.commit(() => {
              totalResults.value = total
              results.value = [...results.value, ...nextItems]

              logger.info('searchStore', 'Search page appended', {
                page: nextPage,
                count: results.value.length,
                total: totalResults.value
              })
            })

            nextPage += 1
          }
        } catch (err: unknown) {
          if (isCanceledRequestError(err)) {
            logger.debug('searchStore', 'Search canceled', {
              keyword: trimmedKeyword,
              server: server.value
            })
            return
          }

          const errorMessage = formatError(err)
          logger.error('searchStore', 'Search error', { errorMessage, err })

          task.commit(() => {
            error.value = errorMessage
            results.value = []
            totalResults.value = 0
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
