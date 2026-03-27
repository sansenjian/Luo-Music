import type { Song } from '@/types/schemas'
import type { LyricLine } from '@/utils/player/core/lyric'
import type { DesktopLyricUpdateCause, LyricTimeUpdate } from '../../../electron/ipc/types'

import { getPlayerStoreRuntime, type CurrentLyricLine, type PlayerStoreOwner } from './runtime'

type LyricSyncState = {
  lyricsArray: LyricLine[]
  currentLyricIndex: number
  progress: number
  playing: boolean
  currentSong: Song | null
  lyricSong: Song | null
}

type LyricSyncPlatform = {
  isElectron: () => boolean
  send: (channel: string, data: unknown) => void
}

export type LyricSyncStore = PlayerStoreOwner & LyricSyncState

const desktopLyricSequences = new WeakMap<LyricSyncStore, number>()

/**
 * Selects the song to use for desktop lyric updates, preferring the store's `lyricSong` and falling back to `currentSong`.
 *
 * @returns The selected `Song`, or `null` if neither `lyricSong` nor `currentSong` is set.
 */
export function getDesktopLyricSong(
  store: Pick<LyricSyncState, 'lyricSong' | 'currentSong'>
): Song | null {
  return store.lyricSong ?? store.currentSong
}

/**
 * Increment the desktop lyric sequence counter for the given store and return the new value.
 *
 * @param store - The lyric sync store whose desktop sequence will be advanced
 * @returns The updated (incremented) sequence number for `store`
 */
function nextDesktopLyricSequence(store: LyricSyncStore): number {
  const next = (desktopLyricSequences.get(store) ?? 0) + 1
  desktopLyricSequences.set(store, next)
  return next
}

/**
 * Retrieve the current desktop lyric update sequence number for the given store.
 *
 * @returns The stored sequence number for `store`, or `0` if none is set.
 */
export function getDesktopLyricSequence(store: LyricSyncStore): number {
  return desktopLyricSequences.get(store) ?? 0
}

/**
 * Builds a LyricTimeUpdate payload reflecting the store's current lyric and playback state.
 *
 * @param time - Playback position (seconds) to include in the payload
 * @param cause - Reason for the update (e.g., `"interval"`, `"seek"`) which will be stored on the payload
 * @returns The constructed LyricTimeUpdate containing `time`, `index`, `text`, `trans`, `roma`, `playing`, `songId`, `platform`, a monotonic `sequence` number, and the provided `cause`
 */
export function createLyricTimeUpdatePayload(
  store: LyricSyncStore,
  time = store.progress,
  cause: DesktopLyricUpdateCause = 'interval'
): LyricTimeUpdate {
  const line = getCurrentLyricLine(store)
  const lyricSong = getDesktopLyricSong(store)

  return {
    time,
    index: store.currentLyricIndex,
    text: line?.text || '',
    trans: line?.trans || '',
    roma: line?.roma || '',
    playing: store.playing,
    songId: lyricSong?.id ?? null,
    platform: lyricSong?.platform ?? null,
    sequence: nextDesktopLyricSequence(store),
    cause
  }
}

/**
 * Retrieve the currently selected lyric line from the given state or null when none exists.
 *
 * @param state - Object containing `lyricsArray` and `currentLyricIndex`
 * @returns The current lyric line with `text`, `trans`, and `roma` (where `trans` and `roma` default to empty strings), or `null` if the index is out of range
 */
export function getCurrentLyricLine(
  state: Pick<LyricSyncState, 'lyricsArray' | 'currentLyricIndex'>
): CurrentLyricLine {
  const line = state.lyricsArray[state.currentLyricIndex]
  return line ? { text: line.text, trans: line.trans || '', roma: line.roma || '' } : null
}

/**
 * Update the store's current lyric index to match the lyric engine for a given playback time.
 *
 * @param time - Playback time used to compute the new lyric index (defaults to `store.progress`)
 * @returns `true` if `store.currentLyricIndex` was changed, `false` otherwise
 */
export function syncLyricIndex(store: LyricSyncStore, time = store.progress): boolean {
  const lyricEngine = getPlayerStoreRuntime(store)?.getLyricEngine()
  if (!lyricEngine) {
    return false
  }

  const nextIndex = lyricEngine.update(time)
  if (store.currentLyricIndex === nextIndex) {
    return false
  }

  store.currentLyricIndex = nextIndex
  return true
}

/**
 * Send the current lyric timing and context to the desktop process when running in Electron.
 *
 * @param store - Store providing lyric state used to build the payload
 * @param platform - Desktop platform interface used to detect Electron and send the IPC message
 * @param time - Playback time to include in the update; defaults to `store.progress`
 * @param cause - Reason for the update (e.g., `"interval"`, `"seek"`); defaults to `"interval"`
 */
export function notifyLyricTimeUpdate(
  store: LyricSyncStore,
  platform: LyricSyncPlatform,
  time = store.progress,
  cause: DesktopLyricUpdateCause = 'interval'
): void {
  if (!platform.isElectron()) {
    return
  }

  platform.send('lyric-time-update', createLyricTimeUpdatePayload(store, time, cause))
}
