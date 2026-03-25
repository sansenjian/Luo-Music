import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { Song } from '../platform/music/interface'
import { services } from '../services'
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

export const useSearchStore = defineStore(
  'searchStore',
  () => {
    const keyword = ref('')
    const results = ref<SearchResultItem[]>([])
    const server = ref('netease')
    const isLoading = ref(false)
    const error = ref<string | null>(null)
    const totalResults = ref(0)
    const hasResults = computed(() => results.value.length > 0)
    const activeSearch = createLatestRequestController()

    function setServer(serverId: string) {
      server.value = serverId
      services.logger().info('searchStore', 'Server changed', { serverId })
    }

    function formatError(err: unknown): string {
      const appError = services.error().handleApiError(err)
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

      services.logger().info('searchStore', 'Starting search', {
        keyword: trimmedKeyword,
        server: server.value
      })

      try {
        const response = await task.guard(
          services.music().search(server.value, trimmedKeyword, 30, 1)
        )

        services.logger().debug('searchStore', 'Search result', response)

        if (!response?.list || !Array.isArray(response.list)) {
          throw new Error('Invalid search result payload')
        }

        if (response.list.length === 0) {
          task.commit(() => {
            results.value = []
            totalResults.value = 0
            error.value = 'No songs found for the current keyword'
          })
          return
        }

        task.commit(() => {
          totalResults.value = response.total || 0
          results.value = normalizeSearchResults(response.list)

          services.logger().info('searchStore', 'Search successful', {
            count: results.value.length,
            total: totalResults.value
          })
        })
      } catch (err: unknown) {
        if (isCanceledRequestError(err)) {
          services.logger().debug('searchStore', 'Search canceled', {
            keyword: trimmedKeyword,
            server: server.value
          })
          return
        }

        const errorMessage = formatError(err)
        services.logger().error('searchStore', 'Search error', { errorMessage, err })

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
        services.logger().warn('searchStore', 'Invalid index', { index })
        return
      }

      const playlistStore = usePlaylistStore()
      const playerStore = usePlayerStore()

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

      const playlistStore = usePlaylistStore()
      playlistStore.addSong(results.value[index])
    }

    function addAllToPlaylist() {
      const playlistStore = usePlaylistStore()
      playlistStore.addSongs(results.value)
    }

    function clearResults() {
      activeSearch.cancel()
      isLoading.value = false
      results.value = []
      error.value = null
      keyword.value = ''
      totalResults.value = 0
      services.logger().info('searchStore', 'Results cleared')
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
