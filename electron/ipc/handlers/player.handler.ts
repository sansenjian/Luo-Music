import { INVOKE_CHANNELS, RECEIVE_CHANNELS, SEND_CHANNELS } from '../../shared/protocol/channels.ts'
import { ipcService } from '../IpcService'
import type { ServiceManager } from '../../ServiceManager'
import type { WindowManager } from '../../WindowManager'
import { isLocalLibrarySongId } from '@/types/localLibrary'
import { SongSchema } from '@/types/schemas'
import type { Song } from '../../../src/types/schemas'
import { LyricParser } from '../../../src/utils/player/core/lyric'
import { PLAY_MODE } from '../../../src/utils/player/constants/playMode'
import type {
  DesktopLyricSnapshot,
  PlayMode,
  PlayerPlaySongByIdPayload,
  PlayerPlaySongPayload,
  PlayerStateSnapshot
} from '../types'
import { normalizeLyricResponse } from './api.normalizers'

// ========== 配置常量 ==========

/** 状态广播节流阈值（毫秒）- 避免高频 IPC 通信 */
const STATE_BROADCAST_THROTTLE_MS = 16 // 约 60fps

const DEFAULT_PLAYER_STATE: PlayerStateSnapshot = {
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
  lyrics: [],
  desktopLyricSequence: 0
}

// ========== 状态广播管理器 ==========

/**
 * 管理播放器状态广播，使用节流策略减少 IPC 通信开销
 */
class StateBroadcastManager {
  private pendingBroadcasts = new Map<string, () => void>()
  private scheduledFrame: NodeJS.Timeout | null = null
  private lastBroadcastTime = 0

  /**
   * 调度状态广播 - 使用节流策略合并同一帧的多个广播
   */
  schedule(broadcastId: string, broadcastFn: () => void): void {
    // 如果已有待处理的相同广播，跳过
    if (this.pendingBroadcasts.has(broadcastId)) {
      return
    }

    this.pendingBroadcasts.set(broadcastId, broadcastFn)

    // 使用 requestAnimationFrame 类似的节流策略
    const now = Date.now()
    const timeSinceLastBroadcast = now - this.lastBroadcastTime

    if (this.scheduledFrame === null && timeSinceLastBroadcast < STATE_BROADCAST_THROTTLE_MS) {
      // 节流窗口内，等待下一帧
      this.scheduledFrame = setTimeout(() => {
        this.flushBroadcasts()
      }, STATE_BROADCAST_THROTTLE_MS - timeSinceLastBroadcast)
    } else if (this.scheduledFrame === null) {
      // 立即执行
      this.flushBroadcasts()
    }
    // 如果已有调度，等待执行
  }

  /**
   * 立即执行所有待处理的广播（用于测试）
   */
  flush(): void {
    if (this.scheduledFrame) {
      clearTimeout(this.scheduledFrame)
      this.scheduledFrame = null
    }
    this.flushBroadcasts()
  }

  /**
   * 执行所有待处理的广播
   */
  private flushBroadcasts(): void {
    const broadcasts = Array.from(this.pendingBroadcasts.values())
    this.pendingBroadcasts.clear()
    this.scheduledFrame = null
    this.lastBroadcastTime = Date.now()

    // 批量执行广播
    for (const broadcast of broadcasts) {
      broadcast()
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.scheduledFrame) {
      clearTimeout(this.scheduledFrame)
      this.scheduledFrame = null
    }
    this.pendingBroadcasts.clear()
  }
}

// ========== 单例实例 ==========

let stateBroadcastManager: StateBroadcastManager | null = null

function parseSeekTime(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Invalid seek time')
  }

  return value
}

function parseVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('Invalid volume')
  }

  return value
}

function parseSongPayload(value: unknown): Song {
  const result = SongSchema.safeParse(value)
  if (!result.success) {
    throw new Error('Invalid song payload')
  }

  return result.data
}

function getStateBroadcastManager(): StateBroadcastManager {
  if (!stateBroadcastManager) {
    stateBroadcastManager = new StateBroadcastManager()
  }
  return stateBroadcastManager
}

/**
 * 立即刷新所有待处理的状态广播（用于测试）
 */
export function flushStateBroadcasts(): void {
  if (stateBroadcastManager) {
    stateBroadcastManager.flush()
  }
}

/**
 * Produce a complete PlayerStateSnapshot by merging an optional partial snapshot onto the default state.
 *
 * @param snapshot - Optional partial state to merge; specific normalizations applied: `playlist` becomes `[]` if not an array, `currentSong` and `lyricSong` default to `null` if absent, `lyrics` becomes `[]` if not an array, and `desktopLyricSequence` defaults to `0` if not a number.
 * @returns The normalized PlayerStateSnapshot with all required fields populated.
 */
function normalizePlayerState(snapshot: PlayerStateSnapshot | undefined): PlayerStateSnapshot {
  return {
    ...DEFAULT_PLAYER_STATE,
    ...(snapshot ?? {}),
    playlist: Array.isArray(snapshot?.playlist) ? snapshot.playlist : [],
    currentSong: snapshot?.currentSong ?? null,
    lyricSong: snapshot?.lyricSong ?? null,
    lyrics: Array.isArray(snapshot?.lyrics) ? snapshot.lyrics : [],
    desktopLyricSequence:
      typeof snapshot?.desktopLyricSequence === 'number' ? snapshot.desktopLyricSequence : 0
  }
}

/**
 * Builds a DesktopLyricSnapshot representing the current lyric state for the desktop lyric UI.
 *
 * @param playerState - The player state snapshot to derive the desktop lyric snapshot from.
 * @returns A snapshot containing `currentSong`, `progress`, `isPlaying`, and lyric-related fields; if the lyric cache is not usable the `lyrics` array will be empty, `currentLyricIndex` will be `-1`, and `sequence` will be `0`.
 */
function createDesktopLyricSnapshot(playerState: PlayerStateSnapshot): DesktopLyricSnapshot {
  const lyricSong = playerState.lyricSong ?? playerState.currentSong
  const hasCurrentSongLyrics = playerState.lyrics.length > 0 && lyricSong !== null

  return {
    currentSong: lyricSong,
    currentLyricIndex: hasCurrentSongLyrics ? playerState.currentLyricIndex : -1,
    progress: playerState.progress,
    isPlaying: playerState.isPlaying,
    lyrics: hasCurrentSongLyrics ? [...playerState.lyrics] : [],
    songId: lyricSong?.id ?? null,
    platform: lyricSong?.platform ?? null,
    sequence: hasCurrentSongLyrics ? playerState.desktopLyricSequence : 0
  }
}

function isSameSong(left: Song | null, right: Song | null): boolean {
  if (!left && !right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return left.id === right.id && left.platform === right.platform
}

/**
 * Determines whether the current song corresponds to a requested song identifier.
 *
 * @param currentSong - The currently loaded song, or `null` if none is loaded
 * @param payload - Optional song identifier to compare against (`id` and optional `platform`)
 * @returns `true` if `payload` is not provided, or if `currentSong` is non-null and has the same `id` and the same `platform` (treating a missing `platform` as `'netease'`); `false` otherwise
 */
function matchesLyricRequest(
  currentSong: Song | null,
  payload?: PlayerPlaySongByIdPayload
): boolean {
  if (!payload) {
    return true
  }

  if (!currentSong) {
    return false
  }

  return (
    currentSong.id === payload.id &&
    (currentSong.platform ?? 'netease') === (payload.platform ?? 'netease')
  )
}

/**
 * Determines whether the player's cached lyrics can be used to satisfy a lyric request.
 *
 * If the lyric cache is empty or there is no cached lyric song, the cache is considered unusable.
 *
 * @param playerState - Current player state containing cached lyrics and the cached lyric song
 * @param payload - Optional song identifier to check cache validity against
 * @returns `true` if the player has a non-empty lyric cache for a song and that cached song matches the provided payload (when given) or the current song (when no payload is provided), `false` otherwise.
 */
function hasUsableLyricCache(
  playerState: PlayerStateSnapshot,
  payload?: PlayerPlaySongByIdPayload
): boolean {
  if (playerState.lyrics.length === 0 || !playerState.lyricSong) {
    return false
  }

  if (payload) {
    return matchesLyricRequest(playerState.lyricSong, payload)
  }

  return isSameSong(playerState.lyricSong, playerState.currentSong)
}

/**
 * Fetches lyrics for the given song identifier from the specified platform and parses them.
 *
 * @param payload - Object containing the song `id` and optional `platform` (defaults to `'netease'`)
 * @returns The parsed lyric structure including timing, original lines, translations, and romanizations as produced by `LyricParser.parse`
 */
async function fetchLyricsForSong(
  serviceManager: Pick<ServiceManager, 'handleRequest'>,
  payload: PlayerPlaySongByIdPayload
) {
  if (isLocalLibrarySongId(payload.id)) {
    return []
  }

  if (payload.platform === 'local') {
    return []
  }

  const targetPlatform = payload.platform === 'qq' ? 'qq' : 'netease'
  const response =
    targetPlatform === 'qq'
      ? await serviceManager.handleRequest('qq', 'getLyric', { songmid: payload.id })
      : await serviceManager.handleRequest('netease', 'lyric', { id: payload.id })

  const normalized = normalizeLyricResponse(targetPlatform, response)
  return LyricParser.parse(normalized.lyric, normalized.translated, normalized.romalrc)
}

/**
 * Register IPC handlers that forward player controls, expose player state and lyrics, and handle state synchronization and cleanup.
 *
 * Sets up invoke handlers that forward playback, volume, seek, play-mode, playlist and song requests to the provided WindowManager, provides read-only accessors for current player state, playlist, current song and a desktop lyric snapshot, and returns cached or fetched lyrics as needed. Registers send handlers to accept player state synchronization, playback checks, and tray play-mode changes; uses a throttled StateBroadcastManager to broadcast high-frequency state, track, and lyric updates. Ensures the StateBroadcastManager is disposed when the WindowManager is cleaned up or the process exits.
 *
 * @param windowManager - WindowManager used to forward control messages, synchronize UI state, and register cleanup hooks.
 * @param serviceManager - Partial ServiceManager (requires `handleRequest`) used to fetch lyrics from platform services when cache is unavailable.
 */
export function registerPlayerHandlers(
  windowManager: WindowManager,
  serviceManager: Pick<ServiceManager, 'handleRequest'>
): void {
  let playerState = { ...DEFAULT_PLAYER_STATE }

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_PLAY, async () => {
    windowManager.send(RECEIVE_CHANNELS.MUSIC_PLAYING_CONTROL, 'play')
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_PAUSE, async () => {
    windowManager.send(RECEIVE_CHANNELS.MUSIC_PLAYING_CONTROL, 'pause')
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_TOGGLE, async () => {
    windowManager.send(RECEIVE_CHANNELS.MUSIC_PLAYING_CONTROL, 'toggle')
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_SKIP_TO_PREVIOUS, async () => {
    windowManager.send(RECEIVE_CHANNELS.MUSIC_SONG_CONTROL, 'prev')
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_SKIP_TO_NEXT, async () => {
    windowManager.send(RECEIVE_CHANNELS.MUSIC_SONG_CONTROL, 'next')
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_SEEK_TO, async (time: unknown) => {
    windowManager.send(RECEIVE_CHANNELS.MUSIC_PLAYING_CONTROL, {
      type: 'seek',
      time: parseSeekTime(time)
    })
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_SET_VOLUME, async (volume: unknown) => {
    windowManager.send(RECEIVE_CHANNELS.MUSIC_PLAYING_CONTROL, {
      type: 'volume',
      volume: parseVolume(volume)
    })
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_TOGGLE_MUTE, async () => {
    windowManager.send(RECEIVE_CHANNELS.MUSIC_PLAYING_CONTROL, 'toggle-mute')
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_SET_PLAY_MODE, async (mode: PlayMode) => {
    windowManager.send(RECEIVE_CHANNELS.MUSIC_PLAYMODE_CONTROL, mode)
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_TOGGLE_PLAY_MODE, async () => {
    windowManager.send(RECEIVE_CHANNELS.MUSIC_PLAYMODE_CONTROL, 'toggle')
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_GET_STATE, async () => {
    return {
      ...playerState
    }
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_GET_CURRENT_SONG, async () => {
    return playerState.currentSong
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_GET_PLAYLIST, async () => {
    return [...playerState.playlist]
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_GET_DESKTOP_LYRIC_SNAPSHOT, async () => {
    return createDesktopLyricSnapshot(playerState)
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_ADD_TO_NEXT, async (song: unknown) => {
    windowManager.send(RECEIVE_CHANNELS.MUSIC_SONG_CONTROL, {
      type: 'add-to-next',
      song: parseSongPayload(song)
    })
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_REMOVE_FROM_PLAYLIST, async (index: number) => {
    windowManager.send(RECEIVE_CHANNELS.MUSIC_SONG_CONTROL, { type: 'remove-from-playlist', index })
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLAYER_CLEAR_PLAYLIST, async () => {
    windowManager.send(RECEIVE_CHANNELS.MUSIC_SONG_CONTROL, { type: 'clear-playlist' })
  })

  ipcService.registerInvoke(
    INVOKE_CHANNELS.PLAYER_GET_LYRIC,
    async (payload?: PlayerPlaySongByIdPayload) => {
      if (hasUsableLyricCache(playerState, payload)) {
        return [...playerState.lyrics]
      }

      if (!payload) {
        return []
      }

      return fetchLyricsForSong(serviceManager, payload)
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.PLAYER_PLAY_SONG,
    async (payload: PlayerPlaySongPayload) => {
      windowManager.send(RECEIVE_CHANNELS.MUSIC_SONG_CONTROL, {
        type: 'play-song',
        ...payload
      })
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.PLAYER_PLAY_SONG_BY_ID,
    async (payload: PlayerPlaySongByIdPayload) => {
      windowManager.send(RECEIVE_CHANNELS.MUSIC_SONG_CONTROL, {
        type: 'play-song-by-id',
        ...payload
      })
    }
  )

  ipcService.registerSend(SEND_CHANNELS.PLAYER_SYNC_STATE, (snapshot: PlayerStateSnapshot) => {
    const previousState = playerState
    playerState = normalizePlayerState(snapshot)

    const stateManager = getStateBroadcastManager()

    // 播放状态变化（进度更新高频，使用节流）
    if (
      previousState.isPlaying !== playerState.isPlaying ||
      previousState.progress !== playerState.progress
    ) {
      stateManager.schedule('state-change', () => {
        ipcService.broadcast(RECEIVE_CHANNELS.PLAYER_STATE_CHANGE, {
          isPlaying: playerState.isPlaying,
          currentTime: playerState.progress
        })
      })
    }

    // 音轨变化（低频事件，立即广播）
    if (
      previousState.currentIndex !== playerState.currentIndex ||
      !isSameSong(previousState.currentSong, playerState.currentSong)
    ) {
      stateManager.schedule('track-changed', () => {
        ipcService.broadcast(RECEIVE_CHANNELS.PLAYER_TRACK_CHANGED, {
          song: playerState.currentSong,
          index: playerState.currentIndex
        })
      })
    }

    // 歌词更新（高频，使用节流）
    if (previousState.currentLyricIndex !== playerState.currentLyricIndex) {
      stateManager.schedule('lyric-update', () => {
        ipcService.broadcast(RECEIVE_CHANNELS.PLAYER_LYRIC_UPDATE, {
          index: playerState.currentLyricIndex,
          line: playerState.lyrics[playerState.currentLyricIndex] ?? null
        })
      })
    }

    if (
      previousState.isPlaying !== playerState.isPlaying ||
      previousState.progress !== playerState.progress ||
      previousState.currentLyricIndex !== playerState.currentLyricIndex ||
      previousState.desktopLyricSequence !== playerState.desktopLyricSequence ||
      !isSameSong(previousState.currentSong, playerState.currentSong) ||
      !isSameSong(previousState.lyricSong, playerState.lyricSong) ||
      previousState.lyrics.length !== playerState.lyrics.length
    ) {
      stateManager.schedule('desktop-lyric-state', () => {
        ipcService.broadcast(
          RECEIVE_CHANNELS.PLAYER_DESKTOP_LYRIC_STATE,
          createDesktopLyricSnapshot(playerState)
        )
      })
    }
  })

  ipcService.registerSend(SEND_CHANNELS.MUSIC_PLAYING_CHECK, (playing: boolean) => {
    windowManager.syncPlaybackState(playing)
  })

  ipcService.registerSend(SEND_CHANNELS.MUSIC_PLAYMODE_TRAY_CHANGE, (mode: number) => {
    windowManager.syncTrayPlayMode(mode)
  })

  // 注册清理钩子，防止内存泄漏
  const cleanupHandler = () => {
    if (stateBroadcastManager) {
      stateBroadcastManager.dispose()
      stateBroadcastManager = null
    }
  }

  // 在进程退出或 WindowManager 清理时调用
  if ('onCleanup' in windowManager && typeof windowManager.onCleanup === 'function') {
    windowManager.onCleanup(cleanupHandler)
  } else {
    // 降级方案：在进程退出时清理
    process.on('exit', cleanupHandler)
    process.on('SIGTERM', cleanupHandler)
  }
}
