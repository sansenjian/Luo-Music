import type { Song } from '@/types/schemas'
import { isLocalLibrarySong } from '@/types/localLibrary'
import type { MusicService } from '@/services/musicService'
import { cloneSongData, getSongPlatformKey, isSameSongIdentity } from '@/utils/songIdentity'
import { errorCenter, Errors } from '@/utils/error'
import { isCanceledRequestError } from '@/utils/http/cancelError'
import { PLAY_MODE } from '@/utils/player/constants/playMode'
import { LyricParser } from '@/utils/player/core/lyric'

import type { PlayerState } from './playerState'

export interface PlaybackActionsDeps {
  getState: () => PlayerState
  onStateChange: (changes: Partial<PlayerState>) => void
  playSongByIndex: (index: number) => Promise<void>
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

  private shouldHydrateSongForPlayback(song: Song, platformKey: string): boolean {
    return platformKey === 'netease' && !song.url
  }

  private shouldFetchLyrics(song: Song, platformKey: string): boolean {
    if (isLocalLibrarySong(song)) {
      return false
    }

    return platformKey === 'netease' || platformKey === 'qq'
  }

  private clearPlaybackFailureState(song: Song): void {
    song.retryCount = 0
    song.unavailable = false
    song.errorMessage = null
  }

  private cloneSong(song: Song): Song {
    return cloneSongData(song)
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

  private syncPlaybackRuntimeFields(sourceSong: Song, playbackSong: Song): void {
    this.mergeSongDetail(sourceSong, playbackSong)

    if (playbackSong.url) {
      sourceSong.url = playbackSong.url
    }

    if (playbackSong.mediaId !== undefined) {
      sourceSong.mediaId = playbackSong.mediaId
    }

    this.clearPlaybackFailureState(sourceSong)
    this.clearPlaybackFailureState(playbackSong)
  }

  private async refreshSongUrl(song: Song, platformKey: string): Promise<boolean> {
    console.log('[Player] Refreshing URL for song:', song.id)
    const mediaId = (song as Song & { mediaId?: string }).mediaId
    const url = await this.deps.musicService.getSongUrl(platformKey, song.id, { mediaId })
    console.log('[Player] Refreshed URL:', url ? 'Success' : 'Failed')

    if (!url) {
      return false
    }

    song.url = url
    this.clearPlaybackFailureState(song)
    return true
  }

  private async hydrateSongForPlayback(
    song: Song,
    platformKey: string,
    requestId: number
  ): Promise<Song | null> {
    const playbackSong = this.cloneSong(song)

    if (!this.shouldHydrateSongForPlayback(song, platformKey)) {
      return playbackSong
    }

    try {
      const detail = await this.deps.musicService.getSongDetail(platformKey, song.id)

      if (!this.isCurrentPlaybackRequest(requestId)) {
        return null
      }

      if (detail) {
        this.mergeSongDetail(playbackSong, detail)
      }
    } catch (detailError) {
      console.warn('Failed to hydrate song detail before playback:', detailError)
    }

    return playbackSong
  }

  getRandomIndex(excludeCurrent = true): number {
    const state = this.deps.getState()
    if (state.songList.length === 0) return -1
    if (state.songList.length === 1) return 0

    let newIndex = Math.floor(Math.random() * state.songList.length)
    if (excludeCurrent && newIndex === state.currentIndex) {
      newIndex = (newIndex + 1) % state.songList.length
    }
    return newIndex
  }

  playPrev(): void {
    const state = this.deps.getState()
    if (state.songList.length === 0) return

    let newIndex: number
    if (state.playMode === PLAY_MODE.SHUFFLE) {
      newIndex = this.getRandomIndex()
    } else {
      newIndex = state.currentIndex - 1
      if (newIndex < 0) {
        newIndex = state.songList.length - 1
      }
    }

    this.playSongWithDetails(newIndex).catch((err: unknown) => {
      console.error('播放上一首失败:', err)
    })
  }

  playNext(): void {
    const state = this.deps.getState()
    if (state.songList.length === 0) return

    let newIndex: number
    if (state.playMode === PLAY_MODE.SHUFFLE) {
      newIndex = this.getRandomIndex()
    } else {
      newIndex = state.currentIndex + 1
      if (newIndex >= state.songList.length) {
        if (state.playMode === PLAY_MODE.SEQUENTIAL) {
          return
        }
        newIndex = 0
      }
    }

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

    if (!sourceSong.url) {
      console.error('No URL for song')
      throw new Error('No URL for song')
    }

    await this.deps.playSongByIndex(index)

    if (playbackRequestId !== undefined && !this.isCurrentPlaybackRequest(playbackRequestId)) {
      return
    }

    this.deps.onStateChange({
      currentIndex: index,
      currentSong: nextSong,
      currentLyricIndex: isSwitchingSong ? -1 : state.currentLyricIndex
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

    const playbackRequestId = this.startPlaybackRequest()
    this.deps.onStateChange({ loading: true })

    const platformKey = song.platform || (song as { server?: string }).server || 'netease'
    const musicService = this.deps.musicService

    console.log(`[Player] Playing song: ${song.name} (ID: ${song.id}, Platform: ${platformKey})`)

    try {
      const playbackSong = await this.hydrateSongForPlayback(song, platformKey, playbackRequestId)
      if (!playbackSong) {
        return
      }

      const shouldFetchUrl = this.shouldFetchFreshSongUrl(playbackSong, platformKey)
      if (shouldFetchUrl) {
        try {
          const refreshed = await this.refreshSongUrl(playbackSong, platformKey)

          if (!this.isCurrentPlaybackRequest(playbackRequestId)) {
            return
          }

          if (!refreshed) {
            console.warn('Song URL unavailable:', playbackSong.id)
            const err = Errors.noCopyright(playbackSong.id)
            errorCenter.emit(err)
            throw err
          }
        } catch (urlError: unknown) {
          console.error('Failed to get song URL:', urlError)
          if (urlError instanceof Error && urlError.name === 'AppError') throw urlError

          const err = Errors.noCopyright(playbackSong.id)
          errorCenter.emit(err)
          throw err
        }
      } else {
        this.clearPlaybackFailureState(playbackSong)
      }

      if (!this.isCurrentPlaybackRequest(playbackRequestId)) {
        return
      }

      this.syncPlaybackRuntimeFields(song, playbackSong)

      try {
        await this.playSongByIndex(index, playbackSong, playbackRequestId)

        if (!this.isCurrentPlaybackRequest(playbackRequestId)) {
          return
        }

        this.deps.onPlaybackCommitted?.(playbackSong)
      } catch (playbackError) {
        const canRetryWithFreshUrl =
          platformKey === 'netease' && !shouldFetchUrl && Boolean(playbackSong.url)

        if (!canRetryWithFreshUrl) {
          throw playbackError
        }

        try {
          const refreshed = await this.refreshSongUrl(playbackSong, platformKey)
          if (!this.isCurrentPlaybackRequest(playbackRequestId)) {
            return
          }

          if (!refreshed) {
            throw playbackError
          }

          this.syncPlaybackRuntimeFields(song, playbackSong)
          await this.playSongByIndex(index, playbackSong, playbackRequestId)
          if (!this.isCurrentPlaybackRequest(playbackRequestId)) {
            return
          }

          this.deps.onPlaybackCommitted?.(playbackSong)
        } catch {
          throw playbackError
        }
      }

      const lyricRequest = this.startLyricRequest(playbackSong)

      try {
        if (!this.shouldFetchLyrics(playbackSong, platformKey)) {
          this.deps.setLyricsArray([])
        } else {
          const lyricData = await musicService.getLyric(platformKey, playbackSong.id)
          const lyrics = LyricParser.parse(
            lyricData.lrc || '',
            lyricData.tlyric || '',
            lyricData.romalrc || ''
          )

          if (!this.isCurrentLyricRequest(lyricRequest.requestId, lyricRequest.songKey)) {
            return
          }

          this.deps.setLyricsArray(lyrics)
        }
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
        await this.playNextSkipUnavailable()
        return
      } catch {
        errorCenter.emit(Errors.fatal('无法播放任何歌曲，请检查网络或切换歌单'))
      }
    } finally {
      if (this.isCurrentPlaybackRequest(playbackRequestId)) {
        this.deps.onStateChange({ loading: false })
      }
    }
  }

  async playNextSkipUnavailable(): Promise<void> {
    let errorHandler = this.deps.getErrorHandler()
    if (!errorHandler) {
      errorHandler = this.deps.createErrorHandler()
    }

    await errorHandler.playNextSkipUnavailable(async (index: number) => {
      await this.playSongWithDetails(index, false)
    })
  }
}

export function createPlaybackActions(deps: PlaybackActionsDeps): PlaybackActions {
  return new PlaybackActions(deps)
}
