import { SongSchema, type Song } from '@shared/types/schemas'
import { PLAY_MODE } from '@shared/player/playMode'
import { sanitizeWebLyricAppearance } from '@/utils/player/webLyricAppearance'
import type { PlayerStoreAudioManager } from './playerStoreDeps'
import type { PlayerState } from './playerState'

export type StorePlayMode = PlayerState['playMode']

export function toPlayMode(mode: number): StorePlayMode {
  if (!Number.isFinite(mode) || !Number.isInteger(mode)) {
    return PLAY_MODE.SEQUENTIAL as StorePlayMode
  }

  const normalizedMode = ((mode % 4) + 4) % 4
  return normalizedMode as StorePlayMode
}

export function normalizeLyricTypes(value: unknown): Array<'original' | 'trans' | 'roma'> {
  const allowedOptionalTypes: Array<'trans' | 'roma'> = ['trans', 'roma']
  const nextOptionalTypes = Array.isArray(value)
    ? allowedOptionalTypes.filter(type => value.includes(type))
    : ['trans']

  return ['original', ...nextOptionalTypes] as Array<'original' | 'trans' | 'roma'>
}

function normalizePlaylistSong(song: Song): Song {
  const normalizedSong = { ...song }

  delete normalizedSong.url
  delete normalizedSong.retryCount
  delete normalizedSong.unavailable
  delete normalizedSong.errorMessage

  return normalizedSong
}

function normalizePersistedPlaylist(value: unknown): Song[] {
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
    console.warn(`[playerStore] ${skipped} persisted song(s) failed validation and were discarded`)
  }

  return songs
}

function resolveCurrentIndexFromPlaylist(songs: Song[], currentIndex: unknown): number {
  if (!Array.isArray(songs) || songs.length === 0) {
    return -1
  }

  if (
    typeof currentIndex === 'number' &&
    Number.isInteger(currentIndex) &&
    currentIndex >= 0 &&
    currentIndex < songs.length
  ) {
    return currentIndex
  }

  return 0
}

export function restorePersistedPlayerState(store: PlayerState): void {
  store.songList = normalizePersistedPlaylist(store.songList)
  store.currentIndex = resolveCurrentIndexFromPlaylist(store.songList, store.currentIndex)
  store.currentSong =
    store.currentIndex >= 0 && store.currentIndex < store.songList.length
      ? store.songList[store.currentIndex]
      : null
  store.lyricSong = null
  store.lyric = null
  store.lyricsArray = []
  store.currentLyricIndex = -1
  store.loading = false
  store.playing = false
  store.progress = 0
  store.duration = 0
  store.initialized = false
  store.ipcInitialized = false
  store.trackSwitching = false
}

export function normalizeHydratedPlayerState(
  store: PlayerState,
  audioManager: PlayerStoreAudioManager
): void {
  restorePersistedPlayerState(store)

  if (typeof store.volume !== 'number' || !Number.isFinite(store.volume)) {
    store.volume = 0.7
  } else if (store.volume < 0 || store.volume > 1) {
    store.volume = 0.7
  }

  if (store.initialized) {
    audioManager.setVolume(store.volume)
  }

  if (
    typeof store.playMode !== 'number' ||
    !Number.isFinite(store.playMode) ||
    !Number.isInteger(store.playMode)
  ) {
    store.playMode = PLAY_MODE.SEQUENTIAL
  } else if (store.playMode < 0 || store.playMode > 3) {
    store.playMode = PLAY_MODE.SEQUENTIAL
  }

  store.lyricType = normalizeLyricTypes(store.lyricType)
  store.webLyricAppearance = sanitizeWebLyricAppearance(store.webLyricAppearance)
}
