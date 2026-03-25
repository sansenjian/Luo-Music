export const PLAYER_STORAGE_KEY = 'player'
export const COMPACT_MODE_PREFERENCE_KEY = 'compactModeUserToggled'

export type PersistedPlayerState = {
  volume: number
  playMode: number
  lyricType: string[]
  isCompact: boolean
}

import { PLAY_MODE } from '../player/constants/playMode'

const DEFAULT_PLAYER_STATE: PersistedPlayerState = {
  volume: 0.7,
  playMode: PLAY_MODE.SEQUENTIAL,
  lyricType: ['original', 'trans'],
  isCompact: false
}

const VALID_LYRIC_TYPES = new Set(['original', 'trans', 'roma'])

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear' | 'key'> & {
  readonly length: number
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

export const persistentStorage: StorageLike = {
  getItem(key: string): string | null {
    return getLocalStorage()?.getItem(key) ?? null
  },

  setItem(key: string, value: string): void {
    getLocalStorage()?.setItem(key, value)
  },

  removeItem(key: string): void {
    getLocalStorage()?.removeItem(key)
  },

  clear(): void {
    getLocalStorage()?.clear()
  },

  key(index: number): string | null {
    return getLocalStorage()?.key(index) ?? null
  },

  get length(): number {
    return getLocalStorage()?.length ?? 0
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

function sanitizeIsCompact(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_PLAYER_STATE.isCompact
}

export function sanitizePersistedPlayerState(value: unknown): PersistedPlayerState {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_PLAYER_STATE }
  }

  const record = value as Partial<PersistedPlayerState>

  return {
    volume: sanitizeVolume(record.volume as unknown),
    playMode: sanitizePlayMode(record.playMode as unknown),
    lyricType: sanitizeLyricType(record.lyricType as unknown),
    isCompact: sanitizeIsCompact(record.isCompact as unknown)
  }
}

export function normalizePersistedPlayerState(): void {
  const playerState = persistentStorage.getItem(PLAYER_STORAGE_KEY)
  if (!playerState) {
    return
  }

  try {
    const parsed = JSON.parse(playerState) as unknown
    const sanitized = sanitizePersistedPlayerState(parsed)
    persistentStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(sanitized))
  } catch (error) {
    persistentStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(DEFAULT_PLAYER_STATE))
    console.error('Failed to parse player state, reset to defaults:', error)
  }
}

export function markCompactModeUserToggled(): void {
  persistentStorage.setItem(COMPACT_MODE_PREFERENCE_KEY, 'true')
}

export function hasCompactModeUserToggled(): boolean {
  return persistentStorage.getItem(COMPACT_MODE_PREFERENCE_KEY) !== null
}
