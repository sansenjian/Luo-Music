import type { PlayerStateSnapshot, PlayerStateSyncPayload } from '@shared/contracts/ipc'
import { PLAY_MODE } from '@shared/player/playMode'

export const DEFAULT_PLAYER_STATE: PlayerStateSnapshot = {
  isPlaying: false,
  isLoading: false,
  progress: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  playMode: PLAY_MODE.SEQUENTIAL,
  playlist: [],
  currentIndex: -1,
  currentSong: null,
  lyricSong: null,
  currentLyricIndex: -1,
  showLyric: true,
  showPlaylist: false,
  isPlayerDocked: false,
  lyricType: ['original', 'trans'],
  lyrics: [],
  desktopLyricSequence: 0
}

let currentPlayerState: PlayerStateSnapshot = { ...DEFAULT_PLAYER_STATE }

export function getCurrentPlayerStateSnapshot(): PlayerStateSnapshot {
  return {
    ...currentPlayerState,
    playlist: [...currentPlayerState.playlist],
    lyrics: [...currentPlayerState.lyrics],
    lyricType: [...currentPlayerState.lyricType]
  }
}

export function updateCurrentPlayerStateSnapshot(
  snapshot: PlayerStateSyncPayload | undefined,
  previousState: PlayerStateSnapshot = currentPlayerState
): PlayerStateSnapshot {
  currentPlayerState = normalizePlayerState(snapshot, previousState)
  return getCurrentPlayerStateSnapshot()
}

export function resetCurrentPlayerStateSnapshot(): PlayerStateSnapshot {
  currentPlayerState = { ...DEFAULT_PLAYER_STATE }
  return getCurrentPlayerStateSnapshot()
}

/**
 * Produce a complete PlayerStateSnapshot by merging an optional sync payload onto the previous state.
 *
 * @param snapshot - Optional sync payload to merge; omitted `playlist` and `lyrics` preserve
 * the previous arrays so lightweight playback ticks do not clear cached state.
 * @param previousState - Previous full player state used for fields omitted from lightweight sync.
 * @returns The normalized PlayerStateSnapshot with all required fields populated.
 */
export function normalizePlayerState(
  snapshot: PlayerStateSyncPayload | undefined,
  previousState: PlayerStateSnapshot = DEFAULT_PLAYER_STATE
): PlayerStateSnapshot {
  return {
    ...DEFAULT_PLAYER_STATE,
    ...previousState,
    ...snapshot,
    playlist: Array.isArray(snapshot?.playlist) ? snapshot.playlist : previousState.playlist,
    currentSong: snapshot?.currentSong ?? null,
    lyricSong: snapshot?.lyricSong ?? null,
    lyrics: Array.isArray(snapshot?.lyrics) ? snapshot.lyrics : previousState.lyrics,
    lyricType: Array.isArray(snapshot?.lyricType) ? snapshot.lyricType : ['original', 'trans'],
    desktopLyricSequence:
      typeof snapshot?.desktopLyricSequence === 'number' ? snapshot.desktopLyricSequence : 0
  }
}
