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
 * Retrieve the current desktop lyric update sequence number for the given store.
 *
 * @returns The stored sequence number for `store`, or `0` if none is set.
 */
export function getDesktopLyricSequence(store: LyricSyncStore): number {
  return getPlayerStoreRuntime(store)?.getDesktopLyricSequence() ?? 0
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
  const sequence = getPlayerStoreRuntime(store)?.nextDesktopLyricSequence() ?? 0

  return {
    time,
    index: store.currentLyricIndex,
    text: line?.text || '',
    trans: line?.trans || '',
    roma: line?.roma || '',
    playing: store.playing,
    songId: lyricSong?.id ?? null,
    platform: lyricSong?.platform ?? null,
    sequence,
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
 * Resolve the lyric index that matches the lyric engine for a given playback time.
 *
 * @param time - Playback time used to compute the new lyric index (defaults to `store.progress`)
 * @returns The next lyric index, or `null` if no lyric engine runtime is available
 */
export function resolveLyricIndex(store: LyricSyncStore, time = store.progress): number | null {
  const lyricEngine = getPlayerStoreRuntime(store)?.getLyricEngine()
  if (!lyricEngine) {
    return null
  }

  return lyricEngine.update(time)
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
