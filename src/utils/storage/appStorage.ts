import {
  createDefaultPersistedPlayerState,
  sanitizePersistedPlayerState,
  type PersistedPlayerState
} from '@/utils/player/persistedPlayerState'

export const PLAYER_STORAGE_KEY = 'player'
export const PLAYER_DOCKED_PREFERENCE_KEY = 'playerDockedUserToggled'
export const LEGACY_COMPACT_MODE_PREFERENCE_KEY = 'compactModeUserToggled'

export type { PersistedPlayerState }
export { sanitizePersistedPlayerState }

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
    persistentStorage.setItem(
      PLAYER_STORAGE_KEY,
      JSON.stringify(createDefaultPersistedPlayerState())
    )
    console.error('Failed to parse player state, reset to defaults:', error)
  }
}

export function markPlayerDockedUserToggled(): void {
  persistentStorage.setItem(PLAYER_DOCKED_PREFERENCE_KEY, 'true')
}

export function hasPlayerDockedUserToggled(): boolean {
  return (
    persistentStorage.getItem(PLAYER_DOCKED_PREFERENCE_KEY) !== null ||
    persistentStorage.getItem(LEGACY_COMPACT_MODE_PREFERENCE_KEY) !== null
  )
}
