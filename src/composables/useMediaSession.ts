import { onUnmounted, watch } from 'vue'

import { services } from '@/services'
import type { PlayerService } from '@/services/playerService'
import type { PlatformService } from '@/services/platformService'
import { usePlayerStore } from '@/store/playerStore'
import type { Song } from '@/types/schemas'
import { CoverCacheManager } from '@/utils/cache/coverCache'

type MediaSessionActionHandlerLike =
  | ((details?: { seekTime?: number; seekOffset?: number }) => void)
  | null

type MediaSessionLike = {
  metadata: MediaMetadata | MediaMetadataInit | null
  playbackState: MediaSessionPlaybackState
  setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandlerLike): void
  setPositionState?: (state: MediaPositionState) => void
}

type PlayerStoreLike = Pick<
  ReturnType<typeof usePlayerStore>,
  'currentSong' | 'playing' | 'progress' | 'duration' | 'seek' | 'playNext' | 'playPrev'
>

export type MediaSessionDeps = {
  enabled?: () => boolean
  playerStore?: PlayerStoreLike
  playerService?: Pick<PlayerService, 'play' | 'pause'>
  platformService?: Pick<PlatformService, 'getLocalLibraryCover' | 'isElectron'>
  getMediaSession?: () => MediaSessionLike | null
  createMetadata?: (init: MediaMetadataInit) => MediaMetadata | MediaMetadataInit
  resolveArtworkUrl?: (song: Song) => Promise<string>
}

const MEDIA_SESSION_ARTWORK_SIZE = '300x300'
const DEFAULT_SEEK_OFFSET_SECONDS = 5
const POSITION_SYNC_INTERVAL_MS = 1000
const IMMEDIATE_POSITION_SYNC_DELTA_SECONDS = 1
const POSITION_STATE_KEY_PRECISION = 3
const MEDIA_SESSION_ACTIONS: MediaSessionAction[] = [
  'play',
  'pause',
  'nexttrack',
  'previoustrack',
  'seekto',
  'seekforward',
  'seekbackward'
]

function getLocalCoverHash(song: Song | null): string | null {
  if (!song?.extra || typeof song.extra !== 'object') {
    return null
  }

  const value = (song.extra as Record<string, unknown>).localCoverHash
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeArtworkUrl(url: string | undefined): string {
  if (!url) {
    return ''
  }

  if (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('file://')
  ) {
    return url
  }

  return ''
}

function getArtworkMimeType(url: string): string {
  if (url.startsWith('data:image/')) {
    const match = /^data:(image\/[^;,]+)/.exec(url)
    return match?.[1] ?? 'image/jpeg'
  }

  return url.endsWith('.png') ? 'image/png' : 'image/jpeg'
}

function getDefaultMediaSession(): MediaSessionLike | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return null
  }

  return navigator.mediaSession as MediaSessionLike
}

export function useMediaSession(deps: MediaSessionDeps = {}): void {
  const enabled = deps.enabled ?? (() => true)
  const playerStore = deps.playerStore ?? usePlayerStore()
  const playerService = deps.playerService ?? services.player()
  const platformService = deps.platformService ?? services.platform()
  const mediaSession = (deps.getMediaSession ?? getDefaultMediaSession)()
  const createMetadata =
    deps.createMetadata ?? ((init: MediaMetadataInit) => new MediaMetadata(init))

  const resolveArtworkUrl =
    deps.resolveArtworkUrl ??
    (async (song: Song) => {
      const localCoverHash = getLocalCoverHash(song)
      if (localCoverHash) {
        const localArtwork = await CoverCacheManager.fetchThumbnailAsDataUrl(localCoverHash, hash =>
          platformService.getLocalLibraryCover(hash)
        )

        if (localArtwork) {
          return localArtwork
        }
      }

      return normalizeArtworkUrl(song.album.picUrl)
    })

  if (!mediaSession || !platformService.isElectron()) {
    return
  }

  let positionTimer: ReturnType<typeof setInterval> | null = null
  let metadataRequestId = 0
  let isSessionActive = false
  let lastPositionStateKey: string | null = null

  function clearPositionTimer(): void {
    if (positionTimer !== null) {
      clearInterval(positionTimer)
      positionTimer = null
    }
  }

  function clearActionHandlers(): void {
    for (const action of MEDIA_SESSION_ACTIONS) {
      setActionHandlerSafely(action, null)
    }
  }

  function invalidateMetadataRequest(): void {
    metadataRequestId += 1
  }

  function createPositionStateKey(song: Song, duration: number, position: number): string {
    return `${song.id}:${duration.toFixed(POSITION_STATE_KEY_PRECISION)}:${position.toFixed(POSITION_STATE_KEY_PRECISION)}`
  }

  function syncPosition(): void {
    if (!isSessionActive) {
      return
    }

    const song = playerStore.currentSong
    const duration = playerStore.duration
    if (!song || !Number.isFinite(duration) || duration <= 0) {
      return
    }

    try {
      const position = Math.max(0, Math.min(playerStore.progress, duration))
      const positionStateKey = createPositionStateKey(song, duration, position)
      if (positionStateKey === lastPositionStateKey) {
        return
      }

      mediaSession.setPositionState?.({
        duration,
        playbackRate: 1,
        position
      })
      lastPositionStateKey = positionStateKey
    } catch {
      // Some Chromium / Windows combinations silently reject unsupported position updates.
    }
  }

  function updatePlaybackState(): void {
    mediaSession.playbackState = playerStore.currentSong
      ? playerStore.playing
        ? 'playing'
        : 'paused'
      : 'none'
  }

  function syncPlaybackPositionLifecycle(): void {
    if (!isSessionActive) {
      return
    }

    updatePlaybackState()
    syncPosition()
    clearPositionTimer()

    if (playerStore.currentSong && playerStore.playing) {
      positionTimer = setInterval(syncPosition, POSITION_SYNC_INTERVAL_MS)
    }
  }

  async function syncMetadata(): Promise<void> {
    const currentRequestId = metadataRequestId + 1
    metadataRequestId = currentRequestId

    const song = playerStore.currentSong

    if (!song) {
      if (isSessionActive && currentRequestId === metadataRequestId) {
        mediaSession.metadata = null
      }
      updatePlaybackState()
      syncPosition()
      clearPositionTimer()
      return
    }

    const artworkUrl = await resolveArtworkUrl(song)

    // Re-read the current song after the async gap — it may have changed.
    const songNow = playerStore.currentSong

    // The song changed while we were fetching the cover — this artwork
    // is stale.  A new syncMetadata call is already in-flight (or will
    // be triggered by the watcher), so just bail out.
    if (!isSessionActive || currentRequestId !== metadataRequestId || songNow?.id !== song.id) {
      return
    }

    mediaSession.metadata = createMetadata({
      title: song.name || '未知标题',
      artist: song.artists.map(artist => artist.name).join(' / ') || '未知艺术家',
      album: song.album.name || '',
      artwork: artworkUrl
        ? [
            {
              src: artworkUrl,
              sizes: MEDIA_SESSION_ARTWORK_SIZE,
              type: getArtworkMimeType(artworkUrl)
            }
          ]
        : []
    })

    updatePlaybackState()
    syncPosition()
  }

  const invokePlayerAction = (action: () => void | Promise<void>): void => {
    void Promise.resolve(action()).catch(error => {
      console.warn('[MediaSession] Failed to handle media action', error)
    })
  }

  function setActionHandlerSafely(
    action: MediaSessionAction,
    handler: MediaSessionActionHandlerLike
  ): void {
    try {
      mediaSession.setActionHandler(action, handler)
    } catch (error) {
      console.warn('[MediaSession] Failed to set media action handler', action, error)
    }
  }

  function registerActionHandlers(): void {
    setActionHandlerSafely('play', () => invokePlayerAction(() => playerService.play()))
    setActionHandlerSafely('pause', () => invokePlayerAction(() => playerService.pause()))
    setActionHandlerSafely('nexttrack', () => invokePlayerAction(() => playerStore.playNext()))
    setActionHandlerSafely('previoustrack', () => invokePlayerAction(() => playerStore.playPrev()))
    setActionHandlerSafely('seekto', details => {
      if (typeof details?.seekTime === 'number' && Number.isFinite(details.seekTime)) {
        playerStore.seek(details.seekTime)
      }
    })
    setActionHandlerSafely('seekforward', details => {
      const nextOffset =
        typeof details?.seekOffset === 'number' && Number.isFinite(details.seekOffset)
          ? details.seekOffset
          : DEFAULT_SEEK_OFFSET_SECONDS
      playerStore.seek(Math.min(playerStore.duration, playerStore.progress + nextOffset))
    })
    setActionHandlerSafely('seekbackward', details => {
      const nextOffset =
        typeof details?.seekOffset === 'number' && Number.isFinite(details.seekOffset)
          ? details.seekOffset
          : DEFAULT_SEEK_OFFSET_SECONDS
      playerStore.seek(Math.max(0, playerStore.progress - nextOffset))
    })
  }

  function cleanupSession(): void {
    invalidateMetadataRequest()
    isSessionActive = false
    clearPositionTimer()
    lastPositionStateKey = null
    mediaSession.metadata = null
    mediaSession.playbackState = 'none'
    clearActionHandlers()
  }

  function activateSession(): void {
    cleanupSession()
    registerActionHandlers()
    isSessionActive = true
    void syncMetadata()
    syncPlaybackPositionLifecycle()
  }

  function resyncAfterAudioPlay(): void {
    if (!isSessionActive) {
      return
    }

    // Invalidate any in-flight metadata request from the song-change watcher
    // before scheduling a new one, so the old cover can't overwrite the new.
    invalidateMetadataRequest()

    // When audio starts playing after a song transition (audio.src change),
    // Chromium may have reset MediaSession state.  Re-sync everything to keep
    // SMTC stable — this only fires on play-state false→true transitions.
    void syncMetadata()
    syncPlaybackPositionLifecycle()
  }

  const stopEnabledWatcher = watch(
    () => enabled(),
    nextEnabled => {
      if (nextEnabled) {
        activateSession()
        return
      }

      cleanupSession()
    },
    { immediate: true }
  )

  const stopMetadataWatcher = watch(
    () => playerStore.currentSong,
    () => {
      if (!isSessionActive) {
        return
      }

      void syncMetadata()
      syncPlaybackPositionLifecycle()
    }
  )

  const stopPlaybackLifecycleWatcher = watch(
    () => [playerStore.playing, playerStore.duration] as const,
    ([nextPlaying], [prevPlaying]) => {
      if (!isSessionActive) {
        return
      }

      syncPlaybackPositionLifecycle()

      // When playback starts (especially after a song transition where
      // audio.src changed), Chromium may have reset the MediaSession state.
      // Re-sync metadata and playbackState to keep SMTC stable.
      if (nextPlaying && !prevPlaying) {
        resyncAfterAudioPlay()
      }
    }
  )

  const stopProgressWatcher = watch(
    () => playerStore.progress,
    (nextProgress, previousProgress) => {
      if (!isSessionActive) {
        return
      }

      const hasFinitePreviousProgress =
        typeof previousProgress === 'number' && Number.isFinite(previousProgress)
      const shouldSyncImmediately =
        !playerStore.playing ||
        !hasFinitePreviousProgress ||
        Math.abs(nextProgress - previousProgress) >= IMMEDIATE_POSITION_SYNC_DELTA_SECONDS

      if (!shouldSyncImmediately) {
        return
      }

      syncPosition()
    }
  )

  onUnmounted(() => {
    stopEnabledWatcher()
    stopMetadataWatcher()
    stopPlaybackLifecycleWatcher()
    stopProgressWatcher()
    cleanupSession()
  })
}
