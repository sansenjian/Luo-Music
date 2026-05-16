import type { Song } from '@shared/types/schemas'
import { getSongPlatformKey, isSameSongIdentity, resolveMediaId } from '@/utils/songIdentity'
import type { MusicService } from '@/services/musicService'
import { isLocalLibrarySong } from '@shared/types/localLibrary'

interface PrefetchedSongData {
  song: Song
  url: string | null
  detail: Song | null
  timestamp: number
}

interface PrefetchEntry {
  data: Promise<PrefetchedSongData>
  urlData: Promise<string | null>
  detailData: Promise<Song | null>
  resolvedData: PrefetchedSongData | null
  resolvedUrl: string | null | undefined
  resolvedDetail: Song | null | undefined
  timestamp: number
}

const PREFETCH_CACHE_TTL = 15 * 60 * 1000 // 15 minutes
const MAX_PREFETCH_ENTRIES = 8

type MusicServiceLike = Pick<
  MusicService,
  'getPlatformCapabilities' | 'getSongUrl' | 'getSongDetail' | 'getLyric'
>

class SongPrefetcher {
  private cache = new Map<string, PrefetchEntry>()
  private musicService: MusicServiceLike | null = null
  private prefetchQueue: Song[] = []
  private isPrefetching = false

  setMusicService(service: MusicServiceLike): void {
    this.musicService = service
  }

  private getCacheKey(song: Song): string {
    return `${getSongPlatformKey(song)}:${song.id}`
  }

  private isValidEntry(entry: PrefetchEntry): boolean {
    return Date.now() - entry.timestamp < PREFETCH_CACHE_TTL
  }

  private cleanupCache(): void {
    const keysToDelete: string[] = []
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValidEntry(entry)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key))

    while (this.cache.size > MAX_PREFETCH_ENTRIES) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }
  }

  getPrefetchedData(song: Song): PrefetchedSongData | null {
    const key = this.getCacheKey(song)
    const entry = this.cache.get(key)

    if (!entry || !this.isValidEntry(entry)) {
      this.cache.delete(key)
      return null
    }

    return entry.resolvedData
  }

  getPrefetchedUrl(song: Song): string | null {
    const key = this.getCacheKey(song)
    const entry = this.cache.get(key)

    if (!entry || !this.isValidEntry(entry)) {
      return null
    }

    return entry.resolvedUrl ?? entry.resolvedData?.url ?? null
  }

  /**
   * If a prefetch is already in-flight for this song, wait for it and
   * return the URL.  Returns null if nothing is in flight or the
   * prefetch fails.  This avoids launching a duplicate network request
   * when the user plays a song that is already being prefetched.
   */
  async awaitPrefetchedUrl(song: Song): Promise<string | null> {
    const key = this.getCacheKey(song)
    const entry = this.cache.get(key)

    if (!entry || !this.isValidEntry(entry)) {
      return null
    }

    // Already resolved — return synchronously.
    if (entry.resolvedUrl !== undefined) {
      return entry.resolvedUrl
    }

    if (entry.resolvedData?.url) {
      return entry.resolvedData.url
    }

    // In flight — wait for URL only. Detail hydration may still be pending
    // and must not block the audible start of playback.
    try {
      return await entry.urlData
    } catch {
      return null
    }
  }

  async awaitPrefetchedDetail(song: Song): Promise<Song | null> {
    const key = this.getCacheKey(song)
    const entry = this.cache.get(key)

    if (!entry || !this.isValidEntry(entry)) {
      return null
    }

    if (entry.resolvedDetail !== undefined) {
      return entry.resolvedDetail
    }

    if (entry.resolvedData?.detail) {
      return entry.resolvedData.detail
    }

    try {
      return await entry.detailData
    } catch {
      return null
    }
  }

  async prefetchSong(song: Song): Promise<PrefetchedSongData | null> {
    if (!this.musicService || isLocalLibrarySong(song)) {
      return null
    }

    const key = this.getCacheKey(song)
    const existing = this.cache.get(key)

    if (existing && this.isValidEntry(existing)) {
      try {
        return await existing.data
      } catch {
        this.cache.delete(key)
      }
    }

    this.cleanupCache()

    const platformKey = getSongPlatformKey(song)
    const mediaId = resolveMediaId(song)

    const urlPromise = this.musicService
      .getSongUrl(platformKey, song.id, { mediaId })
      .then(url => {
        const entry = this.cache.get(key)
        if (entry) {
          entry.resolvedUrl = url ?? null
          entry.timestamp = Date.now()
        }

        if (url && !song.url) {
          song.url = url
        }

        return url
      })
      .catch(error => {
        const entry = this.cache.get(key)
        if (entry) {
          entry.resolvedUrl = null
        }
        console.warn('[Prefetcher] Failed to prefetch song url:', song.id, error)
        return null
      })

    const detailPromise = this.musicService
      .getSongDetail(platformKey, song.id)
      .then(detail => {
        const entry = this.cache.get(key)
        if (entry) {
          entry.resolvedDetail = detail ?? null
          entry.timestamp = Date.now()
        }

        if (detail) {
          if (!song.mediaId && detail.mediaId !== undefined) {
            song.mediaId = detail.mediaId
          }
          if (detail.extra) {
            song.extra = { ...song.extra, ...detail.extra }
          }
        }

        return detail
      })
      .catch(error => {
        const entry = this.cache.get(key)
        if (entry) {
          entry.resolvedDetail = null
        }
        console.warn('[Prefetcher] Failed to prefetch song detail:', song.id, error)
        return null
      })

    const prefetchPromise = Promise.all([urlPromise, detailPromise]).then(([url, detail]) => ({
      song,
      url,
      detail,
      timestamp: Date.now()
    }))

    this.cache.set(key, {
      data: prefetchPromise,
      urlData: urlPromise,
      detailData: detailPromise,
      resolvedData: null,
      resolvedUrl: undefined,
      resolvedDetail: undefined,
      timestamp: Date.now()
    })

    try {
      const result = await prefetchPromise
      const entry = this.cache.get(key)
      if (entry) {
        entry.resolvedData = result
        entry.timestamp = result.timestamp
      }

      return result
    } catch (error) {
      this.cache.delete(key)
      console.warn('[Prefetcher] Failed to prefetch song:', song.id, error)
      return null
    }
  }

  schedulePrefetch(songs: Song[], currentIndex: number): void {
    if (!this.musicService || songs.length === 0) {
      return
    }

    this.prefetchQueue = []

    const nextIndex = currentIndex + 1
    if (nextIndex < songs.length) {
      this.prefetchQueue.push(songs[nextIndex])
    }

    const prevIndex = currentIndex - 1
    if (prevIndex >= 0) {
      this.prefetchQueue.push(songs[prevIndex])
    }

    for (let i = 0; i < Math.min(2, songs.length); i++) {
      const randomIndex = Math.floor(Math.random() * songs.length)
      const randomSong = songs[randomIndex]
      if (!this.prefetchQueue.some(s => isSameSongIdentity(s, randomSong))) {
        this.prefetchQueue.push(randomSong)
      }
    }

    this.processQueue()
  }

  private processQueue(): void {
    if (this.isPrefetching || this.prefetchQueue.length === 0) {
      return
    }

    this.isPrefetching = true

    const processNext = async (): Promise<void> => {
      while (this.prefetchQueue.length > 0) {
        const batch = this.prefetchQueue.splice(0, 4)
        await Promise.all(batch.map(song => this.prefetchSong(song).catch(() => {})))
      }
      this.isPrefetching = false
    }

    processNext().catch(() => {
      this.isPrefetching = false
    })
  }

  prefetchPlaylist(songs: Song[]): void {
    if (!this.musicService || songs.length === 0) {
      return
    }

    const songsToPrefetch = songs.slice(0, Math.min(3, songs.length))
    for (const song of songsToPrefetch) {
      if (!isLocalLibrarySong(song) && !this.cache.has(this.getCacheKey(song))) {
        this.prefetchSong(song).catch(() => {})
      }
    }
  }

  clearCache(): void {
    this.cache.clear()
    this.prefetchQueue = []
  }

  invalidateSong(song: Song): void {
    const key = this.getCacheKey(song)
    this.cache.delete(key)
  }
}

export const songPrefetcher = new SongPrefetcher()
