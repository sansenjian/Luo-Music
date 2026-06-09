import { PLAY_MODE } from '@shared/player/playMode'
import { hasKnownLocalSongDuration, isLocalLibrarySong } from '@shared/types/localLibrary'
import { SongSchema, type Song } from '@shared/types/schemas'
import type { WebLyricAppearance } from '@shared/types/player'
import {
  DEFAULT_WEB_LYRIC_APPEARANCE,
  sanitizeWebLyricAppearance
} from '@/utils/player/webLyricAppearance'

export const PLAYER_PERSISTED_STATE_VERSION = 1

export type PersistedPlayerState = {
  version: number
  volume: number
  playMode: number
  lyricType: string[]
  webLyricAppearance: WebLyricAppearance
  isPlayerDocked: boolean
  songList: Song[]
  currentIndex: number
  progress: number
  duration: number
  isCompact?: boolean
}

const DEFAULT_PLAYER_STATE: PersistedPlayerState = {
  version: PLAYER_PERSISTED_STATE_VERSION,
  volume: 0.7,
  playMode: PLAY_MODE.SEQUENTIAL,
  lyricType: ['original', 'trans'],
  webLyricAppearance: { ...DEFAULT_WEB_LYRIC_APPEARANCE },
  isPlayerDocked: true,
  songList: [],
  currentIndex: -1,
  progress: 0,
  duration: 0
}

const VALID_LYRIC_TYPES = new Set(['original', 'trans', 'roma'])

export function createDefaultPersistedPlayerState(): PersistedPlayerState {
  return {
    ...DEFAULT_PLAYER_STATE,
    lyricType: [...DEFAULT_PLAYER_STATE.lyricType],
    webLyricAppearance: { ...DEFAULT_PLAYER_STATE.webLyricAppearance },
    songList: []
  }
}

function sanitizeVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : DEFAULT_PLAYER_STATE.volume
}

function sanitizePlayMode(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return DEFAULT_PLAYER_STATE.playMode
  }

  return value >= 0 && value <= 3 ? value : DEFAULT_PLAYER_STATE.playMode
}

function sanitizeLyricType(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_PLAYER_STATE.lyricType]
  }

  const sanitized = value.filter(item => typeof item === 'string' && VALID_LYRIC_TYPES.has(item))

  return sanitized.length > 0 ? [...new Set(sanitized)] : [...DEFAULT_PLAYER_STATE.lyricType]
}

function sanitizeIsPlayerDocked(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_PLAYER_STATE.isPlayerDocked
}

export function sanitizePlaybackTime(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

export function normalizePlaylistSong(song: Song): Song {
  const normalizedSong = { ...song }

  delete normalizedSong.url
  delete normalizedSong.retryCount
  delete normalizedSong.unavailable
  delete normalizedSong.errorMessage

  return normalizedSong
}

export function normalizePersistedPlaylist(
  value: unknown,
  options: { onSkipped?: (skipped: number) => void } = {}
): Song[] {
  if (!Array.isArray(value)) {
    return []
  }

  const songs: Song[] = []
  let skipped = 0
  for (const item of value) {
    const parsed = SongSchema.safeParse(item)
    if (parsed.success) {
      songs.push(normalizePlaylistSong(parsed.data))
    } else {
      skipped++
    }
  }

  if (skipped > 0) {
    options.onSkipped?.(skipped)
  }

  return songs
}

export function resolveCurrentIndexFromPlaylist(songs: Song[], currentIndex: unknown): number {
  if (songs.length === 0) {
    return -1
  }

  return typeof currentIndex === 'number' &&
    Number.isInteger(currentIndex) &&
    currentIndex >= 0 &&
    currentIndex < songs.length
    ? currentIndex
    : 0
}

export function resolveSongDurationSeconds(song: Song | null): number {
  if (!song || !Number.isFinite(song.duration) || song.duration <= 0) {
    return 0
  }

  if (isLocalLibrarySong(song) && !hasKnownLocalSongDuration(song)) {
    return 0
  }

  return song.duration / 1000
}

export function resolveRestoredDuration(
  currentSong: Song | null,
  persistedDuration: unknown
): number {
  const duration = sanitizePlaybackTime(persistedDuration)
  return duration > 0 ? duration : resolveSongDurationSeconds(currentSong)
}

export function resolveRestoredProgress(
  currentSong: Song | null,
  persistedProgress: unknown,
  duration: number
): number {
  if (!currentSong) {
    return 0
  }

  const progress = sanitizePlaybackTime(persistedProgress)
  return duration > 0 ? Math.min(progress, duration) : progress
}

export function sanitizePersistedPlayerState(value: unknown): PersistedPlayerState {
  if (typeof value !== 'object' || value === null) {
    return createDefaultPersistedPlayerState()
  }

  const record = value as Partial<PersistedPlayerState>
  const songList = normalizePersistedPlaylist(record.songList)
  const currentIndex = resolveCurrentIndexFromPlaylist(songList, record.currentIndex)
  const currentSong = currentIndex >= 0 ? songList[currentIndex] : null
  const duration = resolveRestoredDuration(currentSong ?? null, record.duration)
  const progress = resolveRestoredProgress(currentSong ?? null, record.progress, duration)

  return {
    version: PLAYER_PERSISTED_STATE_VERSION,
    volume: sanitizeVolume(record.volume as unknown),
    playMode: sanitizePlayMode(record.playMode as unknown),
    lyricType: sanitizeLyricType(record.lyricType as unknown),
    webLyricAppearance: sanitizeWebLyricAppearance(record.webLyricAppearance),
    isPlayerDocked: sanitizeIsPlayerDocked(
      record.isPlayerDocked ?? (record as { isCompact?: unknown }).isCompact
    ),
    songList,
    currentIndex,
    progress,
    duration
  }
}
