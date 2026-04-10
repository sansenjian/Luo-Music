import { PLAY_MODE } from '../constants/playMode'
import type { Song } from '@/types/schemas'
import type { MusicService } from '@/services/musicService'

interface ErrorHandlerOptions {
  musicService: Pick<MusicService, 'getSongUrl'>
  getState?: () => {
    songList: Song[]
    currentIndex: number
    playMode: number
  }
  onStateChange?: (changes: { playing?: boolean }) => void
}

export interface AudioErrorResult {
  shouldRetry: boolean
  shouldSkip?: boolean
  url?: string
}

export interface ErrorHandler {
  reset(): void
  handleAudioError(error: unknown, song: Song | null): Promise<AudioErrorResult>
  markAsUnavailable(song: Song, message?: string): void
  playNextSkipUnavailable(playNext: (index: number) => Promise<void>): Promise<void>
}

export class PlaybackErrorHandler implements ErrorHandler {
  private readonly musicService: Pick<MusicService, 'getSongUrl'>
  private getState: () => {
    songList: Song[]
    currentIndex: number
    playMode: number
  }
  private onStateChange: (changes: { playing?: boolean }) => void
  private skipAttempts: number = 0
  private maxSkipAttempts: number = 5
  private lastSkipTime: number = 0
  private skipCooldownMs: number = 3000
  private unavailableSongs: (string | number)[] = []

  constructor(options: ErrorHandlerOptions) {
    this.musicService = options.musicService
    this.getState =
      options.getState ||
      (() => ({ songList: [], currentIndex: -1, playMode: PLAY_MODE.SEQUENTIAL }))
    this.onStateChange = options.onStateChange || (() => {})
  }

  async handleAudioError(error: unknown, currentSong: Song | null): Promise<AudioErrorResult> {
    this.onStateChange({ playing: false })

    // Log error for debugging
    if (error instanceof Error) {
      console.error('Audio error:', error.message)
    } else {
      console.error('Audio error:', error)
    }

    if (currentSong && !currentSong.retryCount) {
      currentSong.retryCount = 1
      try {
        const urlRes = await this.retryGetMusicUrl(currentSong)
        if (urlRes?.url) {
          currentSong.url = urlRes.url
          return { shouldRetry: true, url: urlRes.url }
        }
      } catch (e) {
        console.error('Retry failed:', e)
      }
    }

    if (currentSong) {
      this.markAsUnavailable(currentSong)
    }

    return { shouldRetry: false, shouldSkip: true }
  }

  async retryGetMusicUrl(song: Song): Promise<{ url: string } | null> {
    const platform = song.platform || 'netease'
    const mediaId =
      typeof song.mediaId === 'string'
        ? song.mediaId
        : typeof song.extra?.mediaId === 'string'
          ? song.extra.mediaId
          : undefined

    try {
      const url = await this.musicService.getSongUrl(platform, song.id, { mediaId })
      if (url) {
        return { url }
      }
    } catch (e) {
      console.error('Adapter retry failed:', e)
    }
    return null
  }

  markAsUnavailable(song: Song, message?: string) {
    song.unavailable = true
    song.errorMessage = message || '该歌曲无法播放（可能需要 VIP 或受版权限制）'
    if (!this.unavailableSongs.includes(song.id)) {
      this.unavailableSongs.push(song.id)
    }
  }

  shouldStopSkipping() {
    const now = Date.now()

    if (now - this.lastSkipTime < this.skipCooldownMs) {
      this.skipAttempts++
    } else {
      this.skipAttempts = 1
    }

    this.lastSkipTime = now

    if (this.skipAttempts >= this.maxSkipAttempts) {
      return true
    }

    const { songList } = this.getState()
    if (songList.length > 0 && this.unavailableSongs.length / songList.length > 0.8) {
      return true
    }

    return false
  }

  async playNextSkipUnavailable(playNext: (index: number) => Promise<void>) {
    if (this.shouldStopSkipping()) {
      console.warn('Skip frequency limit reached or too many unavailable songs')
      throw new Error('播放列表中可用歌曲较少，请尝试其他歌单')
    }

    const { currentIndex, songList } = this.getState()
    const startIndex = currentIndex
    let attempts = 0
    const maxAttempts = Math.min(songList.length, 10)

    while (attempts < maxAttempts) {
      const newIndex = this.getNextAvailableIndex(startIndex, attempts)

      if (newIndex === startIndex && attempts > 0) {
        console.warn('All songs in playlist are unavailable')
        break
      }

      if (!songList[newIndex].unavailable) {
        try {
          await playNext(newIndex)
          this.skipAttempts = 0
          return
        } catch {
          this.markAsUnavailable(songList[newIndex])
          attempts++
          continue
        }
      }

      attempts++
    }

    throw new Error('无法播放任何歌曲')
  }

  getNextAvailableIndex(startIndex: number, attempts: number) {
    const { songList, playMode } = this.getState()

    if (playMode === PLAY_MODE.SHUFFLE) {
      return Math.floor(Math.random() * songList.length)
    } else {
      return (startIndex + 1 + attempts) % songList.length
    }
  }

  reset() {
    this.skipAttempts = 0
    this.lastSkipTime = 0
    this.unavailableSongs = []
    const { songList } = this.getState()
    songList.forEach(song => {
      song.unavailable = false
      song.errorMessage = null
    })
  }

  getUnavailableSongs() {
    return this.unavailableSongs
  }
}
