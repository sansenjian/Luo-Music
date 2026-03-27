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

export function getDesktopLyricSong(
  store: Pick<LyricSyncState, 'lyricSong' | 'currentSong'>
): Song | null {
  return store.lyricSong ?? store.currentSong
}

function nextDesktopLyricSequence(store: LyricSyncStore): number {
  const next = (desktopLyricSequences.get(store) ?? 0) + 1
  desktopLyricSequences.set(store, next)
  return next
}

export function getDesktopLyricSequence(store: LyricSyncStore): number {
  return desktopLyricSequences.get(store) ?? 0
}

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

export function getCurrentLyricLine(
  state: Pick<LyricSyncState, 'lyricsArray' | 'currentLyricIndex'>
): CurrentLyricLine {
  const line = state.lyricsArray[state.currentLyricIndex]
  return line ? { text: line.text, trans: line.trans || '', roma: line.roma || '' } : null
}

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
