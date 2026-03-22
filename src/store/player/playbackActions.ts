import type { Song } from '@/platform/music/interface'
import { getMusicAccessor } from '@/services/musicAccessor'
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
  createErrorHandler: () => import('@/utils/player/modules/playbackErrorHandler').PlaybackErrorHandler
  getErrorHandler: () =>
    | import('@/utils/player/modules/playbackErrorHandler').PlaybackErrorHandler
    | null
  platform: {
    isElectron: () => boolean
  }
}

export class PlaybackActions {
  private lyricRequestId = 0

  constructor(private readonly deps: PlaybackActionsDeps) {}

  private createSongRequestKey(song: Song): string {
    return `${song.platform || (song as { server?: string }).server || 'netease'}:${song.id}`
  }

  private startLyricRequest(song: Song): { requestId: number; songKey: string } {
    this.lyricRequestId += 1

    return {
      requestId: this.lyricRequestId,
      songKey: this.createSongRequestKey(song)
    }
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

  async playSongByIndex(index: number): Promise<void> {
    const state = this.deps.getState()
    if (index < 0 || index >= state.songList.length) return

    const song = state.songList[index]
    if (!song.url) {
      console.error('No URL for song')
      throw new Error('No URL for song')
    }

    this.deps.onStateChange({
      currentIndex: index,
      currentSong: song
    })

    await this.deps.playSongByIndex(index)
  }

  async playSongWithDetails(index: number, autoSkip = true): Promise<void> {
    const state = this.deps.getState()
    const song = state.songList[index]

    if (!song) {
      console.error('[Player] No song found at index:', index)
      return
    }

    this.deps.onStateChange({ loading: true })

    const platformKey = song.platform || (song as { server?: string }).server || 'netease'
    const musicService = getMusicAccessor()

    console.log(`[Player] Playing song: ${song.name} (ID: ${song.id}, Platform: ${platformKey})`)

    try {
      if (!song.url) {
        try {
          console.log('[Player] Fetching URL for song:', song.id)
          const mediaId = (song as Song & { mediaId?: string }).mediaId
          const url = await musicService.getSongUrl(platformKey, song.id, { mediaId })
          console.log('[Player] Got URL:', url ? 'Success' : 'Failed')

          if (url) {
            song.url = url
          } else {
            console.warn('Song URL unavailable:', song.id)
            const err = Errors.noCopyright(song.id)
            errorCenter.emit(err)
            throw err
          }
        } catch (urlError: unknown) {
          console.error('Failed to get song URL:', urlError)
          if (urlError instanceof Error && urlError.name === 'AppError') throw urlError

          const err = Errors.noCopyright(song.id)
          errorCenter.emit(err)
          throw err
        }
      }

      await this.playSongByIndex(index)

      const lyricRequest = this.startLyricRequest(song)

      try {
        const lyricData = await musicService.getLyric(platformKey, song.id)
        const lyrics = LyricParser.parse(
          lyricData.lrc || '',
          lyricData.tlyric || '',
          lyricData.romalrc || ''
        )

        if (!this.isCurrentLyricRequest(lyricRequest.requestId, lyricRequest.songKey)) {
          return
        }

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
      this.deps.onStateChange({ loading: false })
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
