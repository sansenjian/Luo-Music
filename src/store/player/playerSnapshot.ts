import { toRaw } from 'vue'

import { SEND_CHANNELS } from '@shared/protocol/channels'
import type { PlayerStateSnapshot, PlayerStateSyncPayload } from '@shared/contracts/ipc'
import type { LyricDisplayType } from '@shared/types/player'
import type {
  PlayerStoreAudioManager,
  PlayerStoreInstance,
  PlayerStorePlatformService
} from './playerStoreDeps'
import { getDesktopLyricSequence } from './lyricSync'

export type PlayerStateSnapshotOptions = {
  includeHeavy?: boolean
}

/**
 * Convert a value into an IPC-safe representation suitable for sending between processes.
 *
 * Recursively transforms the input into primitives, plain objects, and arrays while handling cycles.
 * Special cases:
 * - `bigint` is converted to its decimal string.
 * - `function` and `symbol` values are dropped (`undefined`); when appearing in arrays they become `null`.
 * - `Date` and `RegExp` are converted to new equivalent instances.
 * - `Error` is converted to an object with `name`, `message`, and `stack`.
 */
export function toIpcSerializable(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value == null) {
    return value
  }

  const valueType = typeof value
  if (valueType === 'bigint') {
    return value.toString()
  }

  if (valueType === 'function' || valueType === 'symbol') {
    return undefined
  }

  if (valueType !== 'object') {
    return value
  }

  const rawValue = toRaw(value as object)
  if (seen.has(rawValue)) {
    return seen.get(rawValue)
  }

  if (rawValue instanceof Date) {
    return new Date(rawValue.getTime())
  }

  if (rawValue instanceof RegExp) {
    return new RegExp(rawValue.source, rawValue.flags)
  }

  if (rawValue instanceof Error) {
    return {
      name: rawValue.name,
      message: rawValue.message,
      stack: rawValue.stack
    }
  }

  if (Array.isArray(rawValue)) {
    const serialized: unknown[] = []
    seen.set(rawValue, serialized)
    for (const item of rawValue) {
      const next = toIpcSerializable(item, seen)
      serialized.push(next === undefined ? null : next)
    }
    return serialized
  }

  const output: Record<string, unknown> = {}
  seen.set(rawValue, output)

  for (const [key, item] of Object.entries(rawValue as Record<string, unknown>)) {
    const next = toIpcSerializable(item, seen)
    if (next !== undefined) {
      output[key] = next
    }
  }

  return output
}

export function createPlayerStateSnapshot(
  store: PlayerStoreInstance,
  audioManager: PlayerStoreAudioManager,
  options: PlayerStateSnapshotOptions = {}
): PlayerStateSyncPayload {
  const includeHeavy = options.includeHeavy ?? true
  const snapshot: PlayerStateSyncPayload = {
    isPlaying: store.playing,
    isLoading: store.loading,
    progress: store.progress,
    duration: store.duration,
    volume: store.volume,
    isMuted:
      store.initialized && typeof audioManager.getMuted === 'function'
        ? audioManager.getMuted()
        : store.volume === 0,
    playMode: store.playMode,
    currentIndex: store.currentIndex,
    currentSong: toIpcSerializable(store.currentSong) as PlayerStateSnapshot['currentSong'],
    lyricSong: toIpcSerializable(store.lyricSong) as PlayerStateSnapshot['lyricSong'],
    currentLyricIndex: store.currentLyricIndex,
    showLyric: store.showLyric,
    showPlaylist: store.showPlaylist,
    isPlayerDocked: store.isPlayerDocked,
    lyricType: [...store.lyricType] as LyricDisplayType[],
    desktopLyricSequence: getDesktopLyricSequence(store)
  }

  if (includeHeavy) {
    snapshot.playlist = toIpcSerializable(store.songList) as PlayerStateSnapshot['playlist']
    snapshot.lyrics = toIpcSerializable(store.lyricsArray) as PlayerStateSnapshot['lyrics']
  }

  return snapshot
}

export function notifyPlayerStateSnapshot(
  store: PlayerStoreInstance,
  platform: PlayerStorePlatformService,
  audioManager: PlayerStoreAudioManager,
  options: PlayerStateSnapshotOptions = {}
): void {
  if (!platform.isElectron()) {
    return
  }

  platform.send(
    SEND_CHANNELS.PLAYER_SYNC_STATE,
    createPlayerStateSnapshot(store, audioManager, options)
  )
}
