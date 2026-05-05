import type { Song } from '@/types/schemas'
import { hasKnownLocalSongDuration, isLocalLibrarySong } from '@/types/localLibrary'
import { getPlatformCapabilities } from '@/platform/music'
import type { MusicService } from '@/services/musicService'
import { getSongPlatformKey, isSameSongIdentity, resolveMediaId } from '@/utils/songIdentity'
import { errorCenter } from '@/utils/error/center'
import { Errors } from '@/utils/error/types'
import { isCanceledRequestError } from '@/utils/http/cancelError'
import { PLAY_MODE } from '@/utils/player/constants/playMode'
import { LyricParser } from '@/utils/player/core/lyric'

import type { PlayerState } from './playerState'
import { songPrefetcher } from './songPrefetcher'

export interface PlaybackActionsDeps {
  getState: () => PlayerState
  onStateChange: (changes: Partial<PlayerState>) => void
  playSongByIndex: (index: number, song?: Song) => Promise<void>
  setLyricsArray: (lyrics: import('@/utils/player/core/lyric').LyricLine[]) => void
  onPlaybackCommitted?: (song: Song) => void
  musicService: Pick<MusicService, 'getSongUrl' | 'getSongDetail' | 'getLyric'>
  createErrorHandler: () => import('@/utils/player/modules/playbackErrorHandler').PlaybackErrorHandler
  getErrorHandler: () =>
    | import('@/utils/player/modules/playbackErrorHandler').PlaybackErrorHandler
    | null
  platform: {
    isElectron: () => boolean
  }
}

export class PlaybackActions {
  private playbackRequestId = 0
  private lyricRequestId = 0
  private pendingNavigationIndex: number | null = null

  constructor(private readonly deps: PlaybackActionsDeps) {}

  private isSameSong(left: Song | null | undefined, right: Song | null | undefined): boolean {
    return isSameSongIdentity(left, right)
  }

  private createSongRequestKey(song: Song): string {
    return `${getSongPlatformKey(song)}:${song.id}`
  }

  private startLyricRequest(song: Song): { requestId: number; songKey: string } {
    this.lyricRequestId += 1

    return {
      requestId: this.lyricRequestId,
      songKey: this.createSongRequestKey(song)
    }
  }

  private startPlaybackRequest(): number {
    this.playbackRequestId += 1
    return this.playbackRequestId
  }

  private isCurrentPlaybackRequest(requestId: number): boolean {
    return requestId === this.playbackRequestId
  }

  private isCurrentLyricRequest(requestId: number, songKey: string): boolean {
    if (requestId !== this.lyricRequestId) {
      return false
    }

    const currentSong = this.deps.getState().currentSong
    if (!currentSong) {
      return false
    }

    return this.createSongRequestKey(currentSong) === songKey
  }

  private shouldFetchFreshSongUrl(song: Song, _platformKey: string): boolean {
    return !song.url
  }

  private shouldHydrateSongForPlayback(_song: Song, platformKey: string): boolean {
    return getPlatformCapabilities(platformKey).needsHydration
  }

  private shouldFetchLyrics(song: Song, platformKey: string): boolean {
    if (isLocalLibrarySong(song)) {
      return false
    }

    return getPlatformCapabilities(platformKey).supportsLyricFetch
  }

  private clearPlaybackFailureState(song: Song): void {
    song.retryCount = 0
    song.unavailable = false
    song.errorMessage = null
  }

  private resolveInitialDurationSeconds(song: Song): number {
    if (!Number.isFinite(song.duration) || song.duration <= 0) {
      return 0
    }

    if (isLocalLibrarySong(song) && !hasKnownLocalSongDuration(song)) {
      return 0
    }

    return song.duration / 1000
  }

  private mergeSongDetail(song: Song, detail: Song): void {
    song.name = detail.name
    song.artists = detail.artists
    song.album = detail.album
    song.duration = detail.duration
    song.mvid = detail.mvid
    song.originalId = detail.originalId

    if (detail.extra) {
      song.extra = detail.extra
    }

    if (detail.mediaId !== undefined) {
      song.mediaId = detail.mediaId
    }
  }

  private async refreshSongUrl(song: Song, platformKey: string): Promise<string | null> {
    console.log('[Player] Refreshing URL for song:', song.id)
    const mediaId = resolveMediaId(song)
    const url = await this.deps.musicService.getSongUrl(platformKey, song.id, { mediaId })
    console.log('[Player] Refreshed URL:', url ? 'Success' : 'Failed')

    return url
  }

  getRandomIndex(excludeCurrent = true): number {
    const state = this.deps.getState()
    if (state.songList.length === 0) return -1
    if (state.songList.length === 1) return 0

    const currentIndex = this.resolveNavigationBaseIndex(state)
    let newIndex = Math.floor(Math.random() * state.songList.length)
    if (excludeCurrent) {
      let attempts = 0
      const maxAttempts = state.songList.length * 2
      while (newIndex === currentIndex && attempts < maxAttempts) {
        newIndex = Math.floor(Math.random() * state.songList.length)
        attempts++
      }
    }
    return newIndex
  }

  private resolveNavigationBaseIndex(state: PlayerState): number {
    if (
      this.pendingNavigationIndex !== null &&
      this.pendingNavigationIndex >= 0 &&
      this.pendingNavigationIndex < state.songList.length
    ) {
      return this.pendingNavigationIndex
    }

    return state.currentIndex
  }

  private setPendingNavigationIndex(index: number | null): void {
    this.pendingNavigationIndex = index
  }

  resetPendingNavigation(): void {
    this.pendingNavigationIndex = null
  }

  playPrev(): void {
    const state = this.deps.getState()
    if (state.songList.length === 0) return

    const currentIndex = this.resolveNavigationBaseIndex(state)
    let newIndex: number
    if (state.playMode === PLAY_MODE.SHUFFLE) {
      newIndex = this.getRandomIndex()
    } else {
      newIndex = currentIndex - 1
      if (newIndex < 0) {
        newIndex = state.songList.length - 1
      }
    }

    this.setPendingNavigationIndex(newIndex)
    this.playSongWithDetails(newIndex).catch((err: unknown) => {
      console.error('播放上一首失败:', err)
    })
  }

  playNext(): void {
    const state = this.deps.getState()
    if (state.songList.length === 0) return

    const currentIndex = this.resolveNavigationBaseIndex(state)
    let newIndex: number
    if (state.playMode === PLAY_MODE.SHUFFLE) {
      newIndex = this.getRandomIndex()
    } else {
      newIndex = currentIndex + 1
      if (newIndex >= state.songList.length) {
        if (state.playMode === PLAY_MODE.SEQUENTIAL) {
          return
        }
        newIndex = 0
      }
    }

    this.setPendingNavigationIndex(newIndex)
    this.playSongWithDetails(newIndex).catch((err: unknown) => {
      console.error('播放下一首失败:', err)
    })
  }

  async playSongByIndex(
    index: number,
    playbackSong?: Song,
    playbackRequestId?: number
  ): Promise<void> {
    const state = this.deps.getState()
    if (index < 0 || index >= state.songList.length) return

    const sourceSong = state.songList[index]
    const nextSong = playbackSong ?? sourceSong
    const isSwitchingSong = !this.isSameSong(state.currentSong, nextSong)

    if (!nextSong.url) {
      console.error('No URL for song')
      throw new Error('No URL for song')
    }

    // Pass the hydrated playbackSong so the store can set currentSong
    // BEFORE changing audio.src.  This lets MediaSession watchers
    // populate metadata synchronously and avoid a gap where Windows
    // SMTC sees an empty session.
    await this.deps.playSongByIndex(index, nextSong)

    if (playbackRequestId !== undefined && !this.isCurrentPlaybackRequest(playbackRequestId)) {
      return
    }

    this.deps.onStateChange({
      currentIndex: index,
      currentSong: nextSong,
      currentLyricIndex: isSwitchingSong ? -1 : state.currentLyricIndex,
      progress: isSwitchingSong ? 0 : state.progress,
      duration: isSwitchingSong ? this.resolveInitialDurationSeconds(nextSong) : state.duration
    })

    if (isSwitchingSong) {
      this.deps.setLyricsArray([])
    }
  }

  async playSongWithDetails(index: number, autoSkip = true): Promise<void> {
    const state = this.deps.getState()
    const song = state.songList[index]

    if (!song) {
      console.error('[Player] No song found at index:', index)
      return
    }

    this.setPendingNavigationIndex(index)
    const playbackRequestId = this.startPlaybackRequest()
    this.deps.onStateChange({
      loading: true,
      ...(!this.isSameSong(state.currentSong, song)
        ? {
            progress: 0,
            duration: 0
          }
        : {})
    })

    const platformKey = getSongPlatformKey(song)
    const musicService = this.deps.musicService

    console.log(`[Player] Playing song: ${song.name} (ID: ${song.id}, Platform: ${platformKey})`)

    try {
      // Try to get prefetched data first — if URL is cached, skip fetch entirely
      const prefetchedData = songPrefetcher.getPrefetchedData(song)
      const cachedUrl = song.url || prefetchedData?.url || null
      const shouldFetchUrl = !cachedUrl
      const shouldHydrate = this.shouldHydrateSongForPlayback(song, platformKey)

      // Parallel fetch: URL, detail, and lyrics
      const mediaId = resolveMediaId(song)

      // If a prefetch is already in-flight, await it instead of launching
      // a duplicate request.  Otherwise start a fresh URL fetch.
      const fetchUrlPromise = shouldFetchUrl
        ? songPrefetcher.awaitPrefetchedUrl(song).then(async url => {
            if (url) return url
            return musicService.getSongUrl(platformKey, song.id, { mediaId })
          })
        : Promise.resolve(cachedUrl)

      const fetchDetailPromise =
        shouldHydrate && !prefetchedData?.detail
          ? songPrefetcher.awaitPrefetchedDetail(song).then(detail => {
              if (detail) return detail
              return musicService.getSongDetail(platformKey, song.id)
            })
          : Promise.resolve(prefetchedData?.detail ?? null)

      const fetchLyricPromise = this.shouldFetchLyrics(song, platformKey)
        ? musicService.getLyric(platformKey, song.id)
        : Promise.resolve({ lrc: '', tlyric: '', romalrc: '' })

      // Wait for URL first (blocking for playback)
      let resolvedUrl: string | null = cachedUrl
      if (shouldFetchUrl) {
        resolvedUrl = await fetchUrlPromise
        if (!this.isCurrentPlaybackRequest(playbackRequestId)) {
          return
        }

        if (!resolvedUrl) {
          console.warn('Song URL unavailable:', song.id)
          const err = Errors.noCopyright(song.id)
          errorCenter.emit(err)
          throw err
        }
      }

      if (resolvedUrl) {
        song.url = resolvedUrl
      }

      // Merge prefetched detail if available
      if (prefetchedData?.detail) {
        this.mergeSongDetail(song, prefetchedData.detail)
      }

      this.clearPlaybackFailureState(song)

      // Start playback immediately after URL is resolved — use source song directly
      try {
        await this.playSongByIndex(index, song, playbackRequestId)

        if (!this.isCurrentPlaybackRequest(playbackRequestId)) {
          return
        }

        this.deps.onPlaybackCommitted?.(song)

        // Schedule prefetch for next songs after playback starts
        songPrefetcher.schedulePrefetch(state.songList, index)
      } catch (playbackError) {
        const canRetryWithFreshUrl =
          getPlatformCapabilities(platformKey).supportsUrlRefreshOnFailure && Boolean(song.url)

        if (!canRetryWithFreshUrl) {
          throw playbackError
        }

        try {
          const refreshedUrl = await this.refreshSongUrl(song, platformKey)
          if (!this.isCurrentPlaybackRequest(playbackRequestId)) {
            return
          }

          if (!refreshedUrl) {
            throw playbackError
          }

          song.url = refreshedUrl
          this.clearPlaybackFailureState(song)
          await this.playSongByIndex(index, song, playbackRequestId)
          if (!this.isCurrentPlaybackRequest(playbackRequestId)) {
            return
          }

          this.deps.onPlaybackCommitted?.(song)
        } catch {
          throw playbackError
        }
      }

      // Hydrate detail after playback starts (fetched in parallel with URL)
      if (shouldHydrate && !prefetchedData?.detail) {
        try {
          const detail = await fetchDetailPromise
          if (!this.isCurrentPlaybackRequest(playbackRequestId)) {
            return
          }
          if (detail) {
            this.mergeSongDetail(song, detail)
          }
        } catch (detailError) {
          console.warn('Failed to hydrate song detail:', detailError)
        }
      }

      // Process lyrics (non-blocking after playback starts)
      const lyricRequest = this.startLyricRequest(song)

      try {
        const lyricData = await fetchLyricPromise
        if (!this.isCurrentLyricRequest(lyricRequest.requestId, lyricRequest.songKey)) {
          return
        }

        const lyrics = LyricParser.parse(
          lyricData.lrc || '',
          lyricData.tlyric || '',
          lyricData.romalrc || ''
        )
        this.deps.setLyricsArray(lyrics)
      } catch (lyricError) {
        if (!this.isCurrentLyricRequest(lyricRequest.requestId, lyricRequest.songKey)) {
          return
        }

        if (isCanceledRequestError(lyricError)) {
          return
        }

        console.error('Failed to get lyrics:', lyricError)
        this.deps.setLyricsArray([])
      }
    } catch (error: unknown) {
      if (!this.isCurrentPlaybackRequest(playbackRequestId)) {
        return
      }

      console.error('Playback failed:', error)

      let errorHandler = this.deps.getErrorHandler()
      if (!errorHandler) {
        errorHandler = this.deps.createErrorHandler()
      }

      const message =
        error instanceof Error &&
        error.name === 'AppError' &&
        'getUserMessage' in error &&
        typeof error.getUserMessage === 'function'
          ? String(error.getUserMessage())
          : '该歌曲无法播放（可能需要 VIP 或受版权限制）'
      errorHandler.markAsUnavailable(song, message)

      if (!autoSkip) {
        throw error
      }

      try {
        this.setPendingNavigationIndex(null)
        await this.playNextSkipUnavailable(index)
        return
      } catch {
        errorCenter.emit(Errors.fatal('无法播放任何歌曲，请检查网络或切换歌单'))
      }
    } finally {
      if (this.isCurrentPlaybackRequest(playbackRequestId)) {
        this.deps.onStateChange({ loading: false })
        if (this.pendingNavigationIndex === index) {
          this.setPendingNavigationIndex(null)
        }
      }
    }
  }

  async playNextSkipUnavailable(startIndex?: number): Promise<void> {
    let errorHandler = this.deps.getErrorHandler()
    if (!errorHandler) {
      errorHandler = this.deps.createErrorHandler()
    }

    await errorHandler.playNextSkipUnavailable(async (index: number) => {
      await this.playSongWithDetails(index, false)
    }, startIndex)
  }
}

export function createPlaybackActions(deps: PlaybackActionsDeps): PlaybackActions {
  return new PlaybackActions(deps)
}
