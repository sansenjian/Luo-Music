import { defineStore } from 'pinia'
import { markRaw } from 'vue'

import { handleError } from '@/utils/error'
import { DESKTOP_LYRIC_IPC_INTERVAL, LYRIC_UI_UPDATE_INTERVAL } from '@/constants/lyric'
import type { Song } from '@/platform/music/interface'
import { storageAdapter } from '@/services/storageService'
import { isSameSongIdentity } from '@/utils/songIdentity'
import { hasKnownLocalSongDuration, isLocalLibrarySong } from '@shared/types/localLibrary'
import {
  createLyricTimeUpdatePayload,
  getCurrentLyricLine,
  notifyLyricTimeUpdate,
  resolveLyricIndex
} from '@/store/player/lyricSync'
import {
  ensurePlayerStoreRuntime,
  getPlayerStoreRuntime,
  resetPlayerStoreRuntime,
  type PlayerStoreOwner
} from '@/store/player/runtime'
import { createInitialState, PLAY_MODE_TEXTS, type PlayerState } from '@/store/player/playerState'
import { songPrefetcher } from '@/store/player/songPrefetcher'
import { PLAY_MODE } from '@shared/player/playMode'
import { LyricEngine, type LyricLine } from '@shared/player/lyric'
import { formatTime } from '@/utils/player/helpers/timeFormatter'
import { resolveLocalLibraryPlaybackUrl, resolvePlaybackMediaUrl } from '@/utils/player/mediaProxy'
import { PlaybackErrorHandler } from '@/utils/player/modules/playbackErrorHandler'
import {
  DEFAULT_WEB_LYRIC_APPEARANCE,
  patchWebLyricAppearance
} from '@/utils/player/webLyricAppearance'
import { useRecentPlayStore } from '@/store/recentPlayStore'
import type { SongPlatform } from '@shared/types/schemas'
import type { WebLyricAppearance } from '@shared/types/player'
import {
  createPlayerPersistStorage,
  normalizeHydratedPlayerState,
  normalizeLyricTypes,
  toPlayMode,
  type StorePlayMode
} from '@/store/player/playerPersistence'
import {
  notifyPlayerStateSnapshot as sendPlayerStateSnapshot,
  type PlayerStateSnapshotOptions
} from '@/store/player/playerSnapshot'
import {
  resolvePlayerStoreDeps,
  type PlayerStoreDeps,
  type PlayerStoreInstance
} from '@/store/player/playerStoreDeps'
import type { AudioOutputStatus } from '@shared/audioOutput/protocol'
import {
  createNativeAudioOutputPlaybackError,
  isNativeAudioOutputRequiredError,
  isNativeAudioOutputRetryablePlaybackError,
  NativeAudioOutputRequiredError,
  type NativeAudioOutputPlaybackError,
  type NativeAudioOutputPlaybackRequest
} from '@/store/player/nativeAudioOutputPlayback'
import { createNativeAudioOutputOwnership } from '@/store/player/nativeAudioOutputOwnership'
import { setSongNativeAudioOutputRequestHeaders } from '@/utils/player/songUrlResult'

export type { PlayerStoreActions, PlayerStoreDeps } from '@/store/player/playerStoreDeps'
export { restorePersistedPlayerState } from '@/store/player/playerPersistence'

const PLAYER_STATE_SYNC_INTERVAL_MS = 500
const RESTORED_PROGRESS_END_THRESHOLD_SECONDS = 5
const NATIVE_AUDIO_OUTPUT_PROGRESS_INTERVAL_MS = 250
const NATIVE_AUDIO_OUTPUT_SETTINGS_CHANGED_REASON =
  'Native audio output playback stopped because output settings changed.'

function isSameSong(left: Song, right: Song): boolean {
  return isSameSongIdentity(left, right)
}

function resolveStartupResumeProgress(progress: number, duration: number): number {
  if (!Number.isFinite(progress) || progress <= 0) {
    return 0
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return progress
  }

  if (progress >= Math.max(0, duration - RESTORED_PROGRESS_END_THRESHOLD_SECONDS)) {
    return 0
  }

  return Math.min(progress, duration)
}

function isCurrentAudioSourceSong(song: Song | null, currentAudioSrc: string): boolean {
  if (!song?.url || !currentAudioSrc) {
    return false
  }

  return song.url === currentAudioSrc
}

async function playSongFromIpc(
  store: PlayerStoreInstance,
  song: Song,
  playlist?: Song[]
): Promise<void> {
  if (Array.isArray(playlist) && playlist.length > 0) {
    const songIndex = playlist.findIndex(candidate => isSameSong(candidate, song))
    const nextPlaylist = songIndex === -1 ? [...playlist, song] : playlist

    store.setSongList(nextPlaylist)
    await store.playSongWithDetails(songIndex === -1 ? nextPlaylist.length - 1 : songIndex)
    return
  }

  const existingIndex = store.songList.findIndex(candidate => isSameSong(candidate, song))
  if (existingIndex !== -1) {
    await store.playSongWithDetails(existingIndex)
    return
  }

  store.addSong(song)
  await store.playSongWithDetails(store.songList.length - 1)
}

export function createPlayerStore(deps: PlayerStoreDeps = {}, storeId = 'player') {
  const resolvedDeps = resolvePlayerStoreDeps(deps)
  const getMusicService = resolvedDeps.getMusicService
  const getStorageService = resolvedDeps.getStorageService
  const getPlatformService = resolvedDeps.getPlatformAccessor
  const audioManager = resolvedDeps.audioManager
  const nativeAudioOutputPlayback = resolvedDeps.nativeAudioOutputPlayback
  const persistStorage = createPlayerPersistStorage(storageAdapter)
  const nativeAudioOutputOwnership = createNativeAudioOutputOwnership()
  let nativeAudioOutputSeekGeneration = 0
  let nativeAudioOutputProgressTimer: ReturnType<typeof setInterval> | null = null
  let nativeAudioOutputProgressAnchorSeconds = 0
  let nativeAudioOutputProgressAnchorMs: number | null = null
  let playbackStartGeneration = 0
  let unsubscribeNativeAudioOutputEnded: (() => void) | null = null
  let unsubscribeNativeAudioOutputError: (() => void) | null = null
  let unsubscribeNativeAudioOutputStatus: (() => void) | null = null

  function reportPlayerStoreError(
    error: unknown,
    fn: string,
    customMessage: string,
    recoverable = true
  ): void {
    handleError(error, {
      customMessage,
      recoverable,
      context: {
        module: 'PlayerStore',
        fn
      }
    })
  }

  function notifyPlayerStateSnapshot(
    store: PlayerStoreInstance,
    options: PlayerStateSnapshotOptions = {}
  ): void {
    sendPlayerStateSnapshot(store, getPlatformService(), audioManager, options)
  }

  function resolveNativeAudioOutputProgress(): number {
    const elapsedSeconds =
      nativeAudioOutputProgressAnchorMs !== null
        ? (Date.now() - nativeAudioOutputProgressAnchorMs) / 1000
        : 0
    return nativeAudioOutputProgressAnchorSeconds + Math.max(0, elapsedSeconds)
  }

  function applyNativeAudioOutputProgress(
    store: PlayerStoreInstance,
    cause: 'interval' | 'seek' | 'play-state' = 'interval'
  ): void {
    if (!nativeAudioOutputOwnership.active) {
      return
    }

    const duration = Number.isFinite(store.duration) && store.duration > 0 ? store.duration : 0
    const nextProgress = duration
      ? Math.min(resolveNativeAudioOutputProgress(), duration)
      : resolveNativeAudioOutputProgress()

    store.progress = nextProgress
    const lyricChanged = store.applyResolvedLyricIndex(nextProgress)
    notifyLyricTimeUpdate(
      store,
      getPlatformService(),
      nextProgress,
      lyricChanged ? 'lyric-change' : cause
    )
  }

  function isNativeAudioOutputPlaybackClaimed(): boolean {
    return nativeAudioOutputOwnership.isClaimed()
  }

  function stopNativeAudioOutputProgressClock(): void {
    if (!nativeAudioOutputProgressTimer) {
      return
    }

    clearInterval(nativeAudioOutputProgressTimer)
    nativeAudioOutputProgressTimer = null
  }

  function startNativeAudioOutputProgressClock(
    store: PlayerStoreInstance,
    startSeconds = store.progress
  ): void {
    nativeAudioOutputProgressAnchorSeconds =
      Number.isFinite(startSeconds) && startSeconds > 0 ? startSeconds : 0
    nativeAudioOutputProgressAnchorMs = Date.now()
    stopNativeAudioOutputProgressClock()

    if (!store.playing) {
      return
    }

    nativeAudioOutputProgressTimer = setInterval(() => {
      applyNativeAudioOutputProgress(store)
    }, NATIVE_AUDIO_OUTPUT_PROGRESS_INTERVAL_MS)

    if (
      typeof nativeAudioOutputProgressTimer === 'object' &&
      nativeAudioOutputProgressTimer !== null &&
      'unref' in nativeAudioOutputProgressTimer &&
      typeof nativeAudioOutputProgressTimer.unref === 'function'
    ) {
      nativeAudioOutputProgressTimer.unref()
    }
  }

  function resetNativeAudioOutputRuntimeState(): void {
    nativeAudioOutputOwnership.resetRuntimeState()
  }

  async function releaseChromiumPlaybackSource(): Promise<void> {
    if (typeof audioManager.releaseSource === 'function') {
      await audioManager.releaseSource()
      return
    }

    audioManager.pause()
    await Promise.resolve()
  }

  function suspendNativeAudioOutputProgressClock(
    startSeconds = nativeAudioOutputProgressAnchorSeconds
  ): void {
    nativeAudioOutputProgressAnchorSeconds =
      Number.isFinite(startSeconds) && startSeconds > 0 ? startSeconds : 0
    nativeAudioOutputProgressAnchorMs = null
    nativeAudioOutputOwnership.suspendProgressClock()
    stopNativeAudioOutputProgressClock()
  }

  function syncNativeAudioOutputProgressFromStatus(
    store: PlayerStoreInstance,
    status: AudioOutputStatus
  ): void {
    if (!nativeAudioOutputOwnership.isClaimed()) {
      return
    }

    const state = status.nativePlaybackState
    const positionSeconds = status.nativePlaybackPositionSeconds
    const hasPosition =
      typeof positionSeconds === 'number' &&
      Number.isFinite(positionSeconds) &&
      positionSeconds >= 0
    if (hasPosition) {
      const now = Date.now()
      nativeAudioOutputProgressAnchorSeconds = positionSeconds
      nativeAudioOutputProgressAnchorMs = state === 'playing' && store.playing ? now : null
      store.progress = positionSeconds
      const lyricChanged = store.applyResolvedLyricIndex(positionSeconds)
      const shouldSyncLyricTime =
        lyricChanged ||
        now - nativeAudioOutputOwnership.lastLyricSyncMs >= NATIVE_AUDIO_OUTPUT_PROGRESS_INTERVAL_MS
      if (shouldSyncLyricTime) {
        nativeAudioOutputOwnership.lastLyricSyncMs = now
        notifyLyricTimeUpdate(
          store,
          getPlatformService(),
          positionSeconds,
          lyricChanged ? 'lyric-change' : 'interval'
        )
      }
    }

    if (state === 'playing') {
      nativeAudioOutputOwnership.active = true
      if (nativeAudioOutputOwnership.pendingPlaybackIntent === false) {
        nativeAudioOutputOwnership.markPausedDuringPendingStart()
        suspendNativeAudioOutputProgressClock(
          hasPosition ? positionSeconds : nativeAudioOutputProgressAnchorSeconds
        )
        store.playing = false
        store.notifyPlayingState(false)
        notifyPlayerStateSnapshot(store)
        void nativeAudioOutputPlayback.pause().catch(error => {
          reportPlayerStoreError(
            error,
            'syncNativeAudioOutputProgressFromStatus.pausePendingStart',
            'Failed to pause native audio output after helper started while pending playback was paused'
          )
        })
        nativeAudioOutputOwnership.lastState = state ?? nativeAudioOutputOwnership.lastState
        return
      }

      nativeAudioOutputOwnership.markHelperPlaying()
      if (store.playing && !nativeAudioOutputProgressTimer) {
        startNativeAudioOutputProgressClock(
          store,
          hasPosition ? positionSeconds : nativeAudioOutputProgressAnchorSeconds
        )
      }
    } else if (state === 'paused') {
      suspendNativeAudioOutputProgressClock(
        hasPosition ? positionSeconds : nativeAudioOutputProgressAnchorSeconds
      )
    } else if (state === 'starting') {
      if (!nativeAudioOutputOwnership.wasPlayingFromHelper) {
        suspendNativeAudioOutputProgressClock(
          hasPosition ? positionSeconds : nativeAudioOutputProgressAnchorSeconds
        )
      }
    } else if (state === 'error' || state === 'stopped' || state === 'ended') {
      if (
        state === 'stopped' &&
        !hasPosition &&
        nativeAudioOutputOwnership.active &&
        status.reason === NATIVE_AUDIO_OUTPUT_SETTINGS_CHANGED_REASON
      ) {
        applyNativeAudioOutputProgress(store)
      }
      nativeAudioOutputOwnership.pendingStart = false
      stopNativeAudioOutputProgressClock()
      if (state === 'error') {
        if (nativeAudioOutputOwnership.lastState !== 'error') {
          handleNativeAudioOutputRuntimeError(store, createNativeAudioOutputPlaybackError(status))
        }
      } else if (state === 'stopped' && nativeAudioOutputOwnership.active) {
        nativeAudioOutputOwnership.release()
        resetNativeAudioOutputRuntimeState()
        if (status.reason === NATIVE_AUDIO_OUTPUT_SETTINGS_CHANGED_REASON) {
          return
        }

        store.playing = false
        store.notifyPlayingState(false)
        notifyPlayerStateSnapshot(store)
      }
    }

    nativeAudioOutputOwnership.lastState = state ?? nativeAudioOutputOwnership.lastState
  }

  function pauseNativeAudioOutputProgressClock(store: PlayerStoreInstance): void {
    if (!nativeAudioOutputOwnership.active) {
      return
    }

    applyNativeAudioOutputProgress(store, 'play-state')
    nativeAudioOutputProgressAnchorSeconds = store.progress
    nativeAudioOutputProgressAnchorMs = null
    stopNativeAudioOutputProgressClock()
  }

  function resumeNativeAudioOutputProgressClock(store: PlayerStoreInstance): void {
    if (!nativeAudioOutputOwnership.active) {
      return
    }

    startNativeAudioOutputProgressClock(store, store.progress)
    notifyLyricTimeUpdate(store, getPlatformService(), store.progress, 'play-state')
  }

  async function fallbackToChromiumPlayback(
    store: PlayerStoreInstance,
    song: Song,
    startSeconds = store.progress,
    options: { playing?: boolean } = {}
  ): Promise<void> {
    const shouldPlay = options.playing ?? true

    nativeAudioOutputOwnership.release()
    resetNativeAudioOutputRuntimeState()
    stopNativeAudioOutputProgressClock()
    await nativeAudioOutputPlayback.stop()

    const playbackUrl = resolvePlaybackMediaUrl(String(song.url), getPlatformService().isElectron())
    await audioManager.play(playbackUrl)

    if (Number.isFinite(startSeconds) && startSeconds > 0) {
      audioManager.seek(startSeconds)
    }

    if (!shouldPlay) {
      audioManager.pause()
    }

    store.playing = shouldPlay
    store.notifyPlayingState(shouldPlay)
    notifyPlayerStateSnapshot(store)
  }

  function createNativePlaybackRequiredError(reason: string, cause?: unknown): Error {
    return new NativeAudioOutputRequiredError(
      appendNativePlaybackFailureReason(reason, cause),
      cause
    )
  }

  function appendNativePlaybackFailureReason(message: string, cause?: unknown): string {
    if (!(cause instanceof Error) || !cause.message.trim() || cause.message === message) {
      return message
    }

    return `${message}原因：${cause.message}`
  }

  function shouldKeepPlaybackOnNativeFailure(
    request: NativeAudioOutputPlaybackRequest,
    reason: string,
    cause?: unknown
  ): Error | null {
    if (!nativeAudioOutputPlayback.requiresNativePlayback(request)) {
      return null
    }

    return createNativePlaybackRequiredError(reason, cause)
  }

  function clearNativeAudioOutputPlaybackUrl(store: PlayerStoreInstance, song: Song): void {
    songPrefetcher.invalidateSong(song)
    song.url = ''
    setSongNativeAudioOutputRequestHeaders(song, undefined)

    if (
      store.currentIndex >= 0 &&
      store.currentIndex < store.songList.length &&
      isSameSong(store.songList[store.currentIndex], song)
    ) {
      store.songList[store.currentIndex].url = ''
      setSongNativeAudioOutputRequestHeaders(store.songList[store.currentIndex], undefined)
    }
  }

  function handleNativeAudioOutputRuntimeError(
    store: PlayerStoreInstance,
    error?: NativeAudioOutputPlaybackError
  ): void {
    if (!nativeAudioOutputOwnership.active || !store.currentSong?.url) {
      return
    }

    stopNativeAudioOutputProgressClock()
    const failedNativeSong = store.currentSong
    if (isNativeAudioOutputRetryablePlaybackError(error) && store.currentIndex >= 0) {
      nativeAudioOutputOwnership.release()
      resetNativeAudioOutputRuntimeState()
      const retryIndex = store.currentIndex
      const retryProgress = store.progress
      clearNativeAudioOutputPlaybackUrl(store, failedNativeSong)
      void store
        .playSongWithDetails(retryIndex)
        .then(() => {
          if (
            retryProgress > 0 &&
            store.currentIndex === retryIndex &&
            store.currentSong &&
            isSameSong(store.currentSong, failedNativeSong)
          ) {
            store.seek(retryProgress)
          }
        })
        .catch(retryError => {
          handlePlaybackActionFailure(
            store,
            retryError,
            'nativeAudioOutputError.retryFreshUrl',
            'Failed to refresh playback URL after native audio output authorization expired'
          )
        })
      return
    }

    const request = {
      song: failedNativeSong,
      startSeconds: store.progress,
      volume: store.volume
    }
    if (nativeAudioOutputPlayback.requiresNativePlayback(request)) {
      nativeAudioOutputOwnership.release()
      resetNativeAudioOutputRuntimeState()
      void nativeAudioOutputPlayback.stop().catch(stopError => {
        reportPlayerStoreError(
          stopError,
          'nativeAudioOutputError.required.stop',
          'Failed to stop native audio output after required playback failed'
        )
      })
      handlePlaybackActionFailure(
        store,
        createNativePlaybackRequiredError('原生独占输出播放失败，已阻止回退到 Chromium。', error),
        'nativeAudioOutputError.required',
        '原生独占输出播放失败'
      )
      return
    }

    void fallbackToChromiumPlayback(store, failedNativeSong).catch(error => {
      handlePlaybackActionFailure(
        store,
        error,
        'nativeAudioOutputError.fallback',
        'Failed to fall back to Chromium playback after native audio output failed'
      )
    })
  }

  function ensureNativeAudioOutputListeners(store: PlayerStoreInstance): void {
    if (unsubscribeNativeAudioOutputEnded) {
      return
    }

    unsubscribeNativeAudioOutputEnded = nativeAudioOutputPlayback.onEnded(() => {
      if (!nativeAudioOutputOwnership.active) {
        return
      }

      nativeAudioOutputOwnership.release()
      stopNativeAudioOutputProgressClock()
      if (
        store.playMode === PLAY_MODE.SINGLE_LOOP &&
        store.currentIndex >= 0 &&
        store.currentSong
      ) {
        void store.playSongByIndex(store.currentIndex, store.currentSong).catch(error => {
          handlePlaybackActionFailure(
            store,
            error,
            'nativeAudioOutputEnded.singleLoop',
            'Failed to replay the current native audio output song after it ended'
          )
          store.playNext()
        })
        return
      }

      store.playNext()
    })

    unsubscribeNativeAudioOutputError = nativeAudioOutputPlayback.onError(error => {
      handleNativeAudioOutputRuntimeError(store, error)
    })

    unsubscribeNativeAudioOutputStatus =
      nativeAudioOutputPlayback.onStatus?.(status => {
        syncNativeAudioOutputProgressFromStatus(store, status)
      }) ?? null
  }

  async function stopNativeAudioOutputPlayback(force = false): Promise<void> {
    if (!force && !isNativeAudioOutputPlaybackClaimed()) {
      return
    }

    nativeAudioOutputSeekGeneration += 1
    nativeAudioOutputOwnership.release()
    resetNativeAudioOutputRuntimeState()
    stopNativeAudioOutputProgressClock()
    await nativeAudioOutputPlayback.stop()
  }

  async function tryNativeAudioOutputPlayback(
    store: PlayerStoreInstance,
    song: Song,
    startSeconds: number,
    isPlaybackCurrent: () => boolean = () => true
  ): Promise<boolean> {
    const request = {
      song,
      startSeconds,
      volume: store.volume
    }

    if (!getPlatformService().isElectron()) {
      return false
    }

    const requiredPlaybackError = shouldKeepPlaybackOnNativeFailure(
      request,
      '当前音源不能由原生独占输出播放，已阻止回退到 Chromium。'
    )

    if (!nativeAudioOutputPlayback.canPlay(request)) {
      if (requiredPlaybackError) {
        await releaseChromiumPlaybackSource()
        await stopNativeAudioOutputPlayback()
        throw requiredPlaybackError
      }

      return false
    }

    nativeAudioOutputOwnership.beginPendingStart(true)
    await releaseChromiumPlaybackSource()

    let didStart: boolean
    try {
      didStart = await nativeAudioOutputPlayback.play(request)
    } catch (error) {
      if (!isPlaybackCurrent()) {
        return false
      }

      await stopNativeAudioOutputPlayback(true).catch(stopError => {
        reportPlayerStoreError(
          stopError,
          'tryNativeAudioOutputPlayback.stopAfterFailure',
          'Failed to stop native audio output after startup failure'
        )
      })

      if (isNativeAudioOutputRetryablePlaybackError(error)) {
        throw error
      }

      if (requiredPlaybackError) {
        throw createNativePlaybackRequiredError(
          '原生独占输出启动失败，已阻止回退到 Chromium。',
          error
        )
      }

      console.warn(
        '[playerStore] Native audio output failed to start; falling back to Chromium',
        error
      )
      nativeAudioOutputOwnership.release()
      resetNativeAudioOutputRuntimeState()
      return false
    }

    if (!isPlaybackCurrent()) {
      return false
    }

    if (!didStart) {
      await stopNativeAudioOutputPlayback(true).catch(stopError => {
        reportPlayerStoreError(
          stopError,
          'tryNativeAudioOutputPlayback.stopAfterNotStarted',
          'Failed to stop native audio output after startup returned not-started'
        )
      })
      if (requiredPlaybackError) {
        throw createNativePlaybackRequiredError('原生独占输出未能开始播放，已阻止回退到 Chromium。')
      }
      return false
    }

    nativeAudioOutputOwnership.markStarting()
    const { shouldPlayAfterStart, shouldPauseAfterStart, shouldResumeAfterPendingPause } =
      nativeAudioOutputOwnership.consumePendingIntent()
    store.progress = startSeconds > 0 ? startSeconds : 0
    store.applyResolvedLyricIndex(store.progress)
    suspendNativeAudioOutputProgressClock(store.progress)

    if (
      (!Number.isFinite(store.duration) || store.duration <= 0) &&
      Number.isFinite(song.duration) &&
      song.duration > 0
    ) {
      store.duration = song.duration / 1000
    }

    if (!shouldPlayAfterStart) {
      store.playing = false
      if (shouldPauseAfterStart) {
        await nativeAudioOutputPlayback.pause().catch(error => {
          reportPlayerStoreError(
            error,
            'tryNativeAudioOutputPlayback.pauseAfterPendingStart',
            'Failed to pause native audio output after pending playback was paused'
          )
        })
      }
      store.notifyPlayingState(false)
      notifyPlayerStateSnapshot(store)
      return true
    }

    if (shouldResumeAfterPendingPause) {
      await nativeAudioOutputPlayback.resume().catch(error => {
        reportPlayerStoreError(
          error,
          'tryNativeAudioOutputPlayback.resumeAfterPendingStartPause',
          'Failed to resume native audio output after pending playback was played again'
        )
      })
    }

    store.playing = true
    store.notifyPlayingState(true)
    return true
  }

  function seekNativeAudioOutputPlayback(store: PlayerStoreInstance, time: number): boolean {
    if (!nativeAudioOutputOwnership.active) {
      return false
    }

    const song = store.currentSong
    if (!song) {
      return false
    }

    const request = {
      song,
      startSeconds: time,
      volume: store.volume
    }
    const shouldKeepPlaying = store.playing
    const seekGeneration = ++nativeAudioOutputSeekGeneration
    const isCurrentNativeSeek = (): boolean =>
      nativeAudioOutputSeekGeneration === seekGeneration &&
      nativeAudioOutputOwnership.active &&
      Boolean(store.currentSong) &&
      isSameSong(store.currentSong!, song)
    const requiredPlaybackError = shouldKeepPlaybackOnNativeFailure(
      request,
      '原生独占输出不能在当前音源上跳转，已阻止回退到 Chromium。'
    )

    if (!getPlatformService().isElectron() || !nativeAudioOutputPlayback.canPlay(request)) {
      if (requiredPlaybackError) {
        nativeAudioOutputOwnership.release()
        resetNativeAudioOutputRuntimeState()
        stopNativeAudioOutputProgressClock()
        void releaseChromiumPlaybackSource()
        void nativeAudioOutputPlayback.stop().catch(error => {
          reportPlayerStoreError(
            error,
            'seek.native.required.stop',
            'Failed to stop native audio output after required seek became unavailable'
          )
        })
        handlePlaybackActionFailure(
          store,
          requiredPlaybackError,
          'seek.native.required',
          'Native audio output cannot seek on the selected output mode'
        )
        return true
      }

      if (song.url) {
        void fallbackToChromiumPlayback(store, song, time, {
          playing: shouldKeepPlaying
        }).catch(error => {
          handlePlaybackActionFailure(
            store,
            error,
            'seek.native.fallback',
            'Failed to fall back to Chromium playback during native audio output seek'
          )
        })
      }
      return true
    }

    nativeAudioOutputOwnership.beginSeekStart()
    suspendNativeAudioOutputProgressClock(time)
    void nativeAudioOutputPlayback
      .play(request)
      .then(async didStart => {
        if (!isCurrentNativeSeek()) {
          return
        }

        if (!didStart) {
          if (requiredPlaybackError) {
            await stopNativeAudioOutputPlayback(true).catch(stopError => {
              reportPlayerStoreError(
                stopError,
                'seek.native.required.stopAfterNotStarted',
                'Failed to stop native audio output after required seek did not restart'
              )
            })
            handlePlaybackActionFailure(
              store,
              requiredPlaybackError,
              'seek.native.required',
              'Native audio output did not restart after seek while exclusive playback is required'
            )
            return
          }

          if (!song.url) {
            await stopNativeAudioOutputPlayback(true).catch(stopError => {
              reportPlayerStoreError(
                stopError,
                'seek.native.stopAfterNotStarted',
                'Failed to stop native audio output after seek did not restart'
              )
            })
            return
          }

          await fallbackToChromiumPlayback(store, song, time, {
            playing: shouldKeepPlaying
          })
          return
        }

        if (!shouldKeepPlaying) {
          await nativeAudioOutputPlayback.pause()
          pauseNativeAudioOutputProgressClock(store)
        }
      })
      .catch(error => {
        console.warn('[playerStore] Native audio output seek failed', error)
        if (!isCurrentNativeSeek()) {
          return
        }

        if (isNativeAudioOutputRetryablePlaybackError(error) && store.currentIndex >= 0) {
          const retryIndex = store.currentIndex
          clearNativeAudioOutputPlaybackUrl(store, song)
          void stopNativeAudioOutputPlayback(true)
            .catch(stopError => {
              reportPlayerStoreError(
                stopError,
                'seek.native.retryFreshUrl.stopAfterFailure',
                'Failed to stop native audio output before refreshing a failed seek URL'
              )
            })
            .then(() => store.playSongWithDetails(retryIndex))
            .then(() => {
              if (
                store.currentIndex !== retryIndex ||
                !store.currentSong ||
                !isSameSong(store.currentSong, song)
              ) {
                return
              }

              store.playing = shouldKeepPlaying
              store.notifyPlayingState(shouldKeepPlaying)
              store.seek(time)
            })
            .catch(retryError => {
              handlePlaybackActionFailure(
                store,
                retryError,
                'seek.native.retryFreshUrl',
                'Failed to refresh playback URL after native audio output seek authorization expired'
              )
            })
          return
        }

        if (!song.url) {
          void stopNativeAudioOutputPlayback(true).catch(stopError => {
            reportPlayerStoreError(
              stopError,
              'seek.native.stopAfterFailure',
              'Failed to stop native audio output after seek failed'
            )
          })
          return
        }

        if (requiredPlaybackError) {
          void stopNativeAudioOutputPlayback(true)
            .catch(stopError => {
              reportPlayerStoreError(
                stopError,
                'seek.native.required.stopAfterFailure',
                'Failed to stop native audio output after required seek failed'
              )
            })
            .then(() => {
              handlePlaybackActionFailure(
                store,
                createNativePlaybackRequiredError(
                  '原生独占输出跳转失败，已阻止回退到 Chromium。',
                  error
                ),
                'seek.native.required',
                'Native audio output seek failed while exclusive playback is required'
              )
            })
          return
        }

        void fallbackToChromiumPlayback(store, song, time, {
          playing: shouldKeepPlaying
        }).catch(fallbackError => {
          handlePlaybackActionFailure(
            store,
            fallbackError,
            'seek.native.fallback',
            'Failed to fall back to Chromium playback after native audio output seek failed'
          )
        })
      })

    return true
  }

  function handlePlaybackActionFailure(
    store: PlayerStoreInstance,
    error: unknown,
    fn: string,
    customMessage: string
  ): void {
    reportPlayerStoreError(error, fn, customMessage)
    store.playing = false
    store.notifyPlayingState(false)
    notifyPlayerStateSnapshot(store)
  }

  async function playSongByIdFromIpc(
    store: PlayerStoreInstance,
    id: string | number,
    platform: SongPlatform = 'netease'
  ): Promise<void> {
    const existingIndex = store.songList.findIndex(
      song => song.id === id && (song.platform ?? 'netease') === platform
    )
    if (existingIndex !== -1) {
      await store.playSongWithDetails(existingIndex)
      return
    }

    if (platform === 'local') {
      throw new Error(`Unable to load local song detail for ${String(id)}`)
    }

    const song = await getMusicService().getSongDetail(platform, id)
    if (!song) {
      throw new Error(`Unable to load song detail for ${platform}:${String(id)}`)
    }

    if (!song.platform) {
      song.platform = platform
    }

    await playSongFromIpc(store, song)
  }

  function addToNextFromIpc(store: PlayerStoreInstance, song: Song): void {
    const originalCurrentIndex = store.currentIndex
    const existingIndex = store.songList.findIndex(candidate => isSameSong(candidate, song))
    if (existingIndex !== -1) {
      store.songList.splice(existingIndex, 1)
      if (existingIndex < store.currentIndex) {
        store.currentIndex -= 1
      }
    }

    const insertIndex = Math.max(0, Math.min(store.currentIndex + 1, store.songList.length))
    store.songList.splice(insertIndex, 0, song)
    if (existingIndex === originalCurrentIndex) {
      store.currentIndex = insertIndex
    }
    notifyPlayerStateSnapshot(store)
  }

  function removeFromPlaylistFromIpc(store: PlayerStoreInstance, index: number): void {
    if (index < 0 || index >= store.songList.length) {
      return
    }

    const removingCurrentSong = index === store.currentIndex
    store.songList.splice(index, 1)

    if (store.songList.length === 0) {
      store.clearPlaylist()
      return
    }

    if (index < store.currentIndex) {
      store.currentIndex -= 1
    } else if (removingCurrentSong) {
      store.currentIndex = Math.min(index, store.songList.length - 1)
      store.currentSong = store.songList[store.currentIndex]
      notifyPlayerStateSnapshot(store)
      void store.playSongWithDetails(store.currentIndex).catch(error => {
        store.currentSong =
          store.currentIndex >= 0 && store.currentIndex < store.songList.length
            ? store.songList[store.currentIndex]
            : null
        handlePlaybackActionFailure(
          store,
          error,
          'removeFromPlaylistFromIpc',
          'Failed to continue playback after removing the current song'
        )
      })
      return
    }

    store.currentSong =
      store.currentIndex >= 0 && store.currentIndex < store.songList.length
        ? store.songList[store.currentIndex]
        : null
    notifyPlayerStateSnapshot(store)
  }

  function getPlaybackActions(store: PlayerStoreInstance) {
    const runtime = ensurePlayerStoreRuntime(store)
    let snapshotQueued = false
    // Track whether a heavy snapshot (playlist/lyrics changed) is needed
    // vs a lightweight playback-only update that the 500ms timer already covers.
    const heavyKeys = new Set([
      'songList',
      'currentSong',
      'lyricSong',
      'lyricsArray',
      'lyricType',
      'currentIndex',
      'showLyric',
      'showPlaylist',
      'isPlayerDocked',
      'playMode'
    ])
    let needsHeavySnapshot = false

    return runtime.ensurePlaybackActions({
      getState: () => store.$state,
      onStateChange: changes => {
        Object.assign(store, changes)
        // Check if any heavy (structural) field changed
        for (const key of Object.keys(changes)) {
          if (heavyKeys.has(key)) {
            needsHeavySnapshot = true
            break
          }
        }
        if (!snapshotQueued) {
          snapshotQueued = true
          queueMicrotask(() => {
            snapshotQueued = false
            if (needsHeavySnapshot) {
              needsHeavySnapshot = false
              notifyPlayerStateSnapshot(store)
            }
            // Lightweight changes (progress, playing, loading, currentLyricIndex)
            // are covered by the 500ms $subscribe state sync — no need to
            // serialize the full playlist and lyrics on every micro-task.
          })
        }
      },
      playSongByIndex: (index, song?) => store.playSongByIndex(index, song),
      setLyricsArray: lyrics => store.setLyricsArray(lyrics),
      onPlaybackCommitted: song => {
        useRecentPlayStore().recordSong(song)
      },
      musicService: (() => {
        const ms = getMusicService()
        songPrefetcher.setMusicService(ms)
        return ms
      })(),
      createErrorHandler: () => runtime.ensureErrorHandler(() => store.createErrorHandler()),
      getErrorHandler: () => runtime.getErrorHandler(),
      platform: {
        isElectron: () => getPlatformService().isElectron()
      }
    })
  }

  return defineStore(storeId, {
    state: (): PlayerState => createInitialState(),

    getters: {
      hasSongs: state => state.songList.length > 0,

      currentSongInfo: (state): Song | null => {
        if (state.currentSong) {
          return state.currentSong
        }

        if (state.currentIndex >= 0 && state.currentIndex < state.songList.length) {
          return state.songList[state.currentIndex]
        }

        return null
      },

      formattedProgress: state => formatTime(state.progress),
      formattedDuration: state => formatTime(state.duration),
      playModeText: state => PLAY_MODE_TEXTS[state.playMode]
    },

    actions: {
      applyResolvedLyricIndex(this: PlayerStoreInstance, time = this.progress): boolean {
        const store = this as unknown as PlayerStoreInstance
        const nextIndex = resolveLyricIndex(store, time)

        if (nextIndex === null || this.currentLyricIndex === nextIndex) {
          return false
        }

        this.currentLyricIndex = nextIndex
        return true
      },

      seek(time: number): void {
        const store = this as unknown as PlayerStoreInstance

        if (!seekNativeAudioOutputPlayback(store, time)) {
          audioManager.seek(time)
        }
        this.progress = time
        this.applyResolvedLyricIndex(time)
        notifyLyricTimeUpdate(store, getPlatformService(), time, 'seek')
      },

      async playNextSkipUnavailable(): Promise<void> {
        await getPlaybackActions(this as unknown as PlayerStoreInstance).playNextSkipUnavailable()
      },

      initAudio(): void {
        if (this.initialized) {
          return
        }

        const store = this as unknown as PlayerStoreInstance
        const runtime = ensurePlayerStoreRuntime(store)

        this.initialized = true
        runtime.setLyricEngine(new LyricEngine())
        runtime.setCurrentLyricLineProvider(() => getCurrentLyricLine(store))
        ensureNativeAudioOutputListeners(store)

        audioManager.setVolume(this.volume)

        runtime.configureAudioEventHandler(
          this.$state,
          {
            onTimeUpdate: (time: number) => {
              if (isNativeAudioOutputPlaybackClaimed()) {
                return
              }

              this.progress = time
              if (this.updateLyricIndex(time)) {
                notifyLyricTimeUpdate(store, getPlatformService(), time, 'lyric-change')
              }
            },
            onLoadedMetadata: (duration: number) => {
              const currentAudioSrc = typeof audioManager.src === 'string' ? audioManager.src : ''
              const hasTrustedSongDuration =
                this.currentSong &&
                Number.isFinite(this.currentSong.duration) &&
                this.currentSong.duration > 0 &&
                (!isLocalLibrarySong(this.currentSong) ||
                  hasKnownLocalSongDuration(this.currentSong))
              const canUseSongDurationFallback =
                hasTrustedSongDuration &&
                isCurrentAudioSourceSong(this.currentSong, currentAudioSrc)
              const fallbackDuration =
                canUseSongDurationFallback && this.currentSong
                  ? this.currentSong.duration / 1000
                  : 0

              const resolvedDuration =
                Number.isFinite(duration) && duration > 0 ? duration : fallbackDuration

              this.duration = resolvedDuration

              if (
                resolvedDuration > 0 &&
                this.currentSong &&
                isLocalLibrarySong(this.currentSong)
              ) {
                const resolvedDurationMs = Math.round(resolvedDuration * 1000)
                this.currentSong.duration = resolvedDurationMs
                this.currentSong.extra = {
                  ...this.currentSong.extra,
                  localDurationKnown: true
                }

                if (this.currentIndex >= 0 && this.currentIndex < this.songList.length) {
                  this.songList[this.currentIndex].duration = resolvedDurationMs
                  this.songList[this.currentIndex].extra = {
                    ...this.songList[this.currentIndex].extra,
                    localDurationKnown: true
                  }
                }
              }
            },
            onEnded: () => {
              if (isNativeAudioOutputPlaybackClaimed()) {
                return
              }

              this.handleSongEnd()
            },
            onPlay: () => {
              if (isNativeAudioOutputPlaybackClaimed()) {
                return
              }

              this.playing = true
              this.notifyPlayingState(true)
            },
            onPause: () => {
              if (this.trackSwitching || isNativeAudioOutputPlaybackClaimed()) {
                return
              }
              this.playing = false
              this.notifyPlayingState(false)
            },
            onError: (error: unknown) => {
              if (this.trackSwitching || isNativeAudioOutputPlaybackClaimed()) {
                return
              }

              reportPlayerStoreError(error, 'initAudio.onError', 'Audio error')
              void this.handleAudioError(error)
            }
          },
          {
            uiUpdateInterval: LYRIC_UI_UPDATE_INTERVAL,
            ipcBroadcastInterval: DESKTOP_LYRIC_IPC_INTERVAL,
            getCurrentLyricLine: () => getCurrentLyricLine(store),
            syncLyricIndex: (time: number) => this.applyResolvedLyricIndex(time),
            createLyricUpdatePayload: ({ time, cause }) =>
              createLyricTimeUpdatePayload(store, time, cause)
          },
          {
            isElectron: () => getPlatformService().isElectron(),
            send: (channel, data) => getPlatformService().send(channel, data)
          }
        )

        this.setupIpcListeners()
      },

      setupIpcListeners(): void {
        if (this.ipcInitialized) {
          return
        }

        const store = this as unknown as PlayerStoreInstance
        const runtime = ensurePlayerStoreRuntime(store)

        runtime.setupIpcHandlers({
          getState: () => store.$state,
          onStateChange: changes => {
            Object.assign(store, changes)
            notifyPlayerStateSnapshot(store)
          },
          togglePlay: () => store.togglePlay(),
          toggleMute: () => store.toggleMute(),
          play: () => {
            if (!store.initialized) {
              if (store.songList.length > 0) {
                const targetIndex = store.currentIndex >= 0 ? store.currentIndex : 0
                return store.playSongWithDetails(targetIndex).catch(error => {
                  reportPlayerStoreError(
                    error,
                    'setupIpcListeners.play.uninitialized',
                    'Failed to play song during initialization'
                  )
                  throw error
                })
              }
              return
            }

            if (!store.playing) {
              if (nativeAudioOutputOwnership.pendingStart) {
                nativeAudioOutputOwnership.pendingPlaybackIntent = true
                store.playing = true
                store.notifyPlayingState(true)
                notifyPlayerStateSnapshot(store)
                return
              }

              if (nativeAudioOutputOwnership.active) {
                store.playing = true
                store.notifyPlayingState(true)
                if (
                  nativeAudioOutputOwnership.wasPlayingFromHelper &&
                  !nativeAudioOutputOwnership.progressClockSuspended
                ) {
                  resumeNativeAudioOutputProgressClock(store)
                }
                return nativeAudioOutputPlayback.resume().catch(error => {
                  reportPlayerStoreError(
                    error,
                    'setupIpcListeners.play.native',
                    'Failed to resume native audio output playback'
                  )
                  throw error
                })
              }

              return audioManager.play().catch(error => {
                if (!(error instanceof Error) || error.name !== 'AbortError') {
                  reportPlayerStoreError(
                    error,
                    'setupIpcListeners.play',
                    'Failed to resume playback'
                  )
                }
                throw error
              })
            }
          },
          pause: () => {
            if (!store.initialized) {
              return
            }

            if (nativeAudioOutputOwnership.pendingStart) {
              nativeAudioOutputOwnership.pendingPlaybackIntent = false
              store.playing = false
              store.notifyPlayingState(false)
              suspendNativeAudioOutputProgressClock(store.progress)
              notifyPlayerStateSnapshot(store)
              return
            }

            if (!store.playing) {
              return
            }

            if (nativeAudioOutputOwnership.active) {
              store.playing = false
              store.notifyPlayingState(false)
              pauseNativeAudioOutputProgressClock(store)
              void nativeAudioOutputPlayback.pause().catch(error => {
                reportPlayerStoreError(
                  error,
                  'setupIpcListeners.pause.native',
                  'Failed to pause native audio output playback'
                )
              })
              return
            }

            audioManager.pause()
          },
          playPrev: () => store.playPrev(),
          playNext: () => store.playNext(),
          playSong: (song, playlist) => {
            return playSongFromIpc(store, song, playlist).catch(error => {
              reportPlayerStoreError(
                error,
                'setupIpcListeners.playSong',
                'Failed to play song from IPC'
              )
              throw error
            })
          },
          playSongById: (id, platform) => playSongByIdFromIpc(store, id, platform),
          addToNext: song => addToNextFromIpc(store, song),
          removeFromPlaylist: index => removeFromPlaylistFromIpc(store, index),
          clearPlaylist: () => store.clearPlaylist(),
          setPlayMode: mode => store.setPlayMode(mode),
          seek: time => store.seek(time),
          setVolume: vol => store.setVolume(vol),
          togglePlayerDocked: () => store.togglePlayerDocked(),
          platform: {
            isElectron: () => getPlatformService().isElectron(),
            on: (channel, callback) => getPlatformService().on(channel, callback)
          }
        })

        runtime.ensureStateSync(
          scheduleNotify => store.$subscribe(() => scheduleNotify()),
          () => notifyPlayerStateSnapshot(store, { includeHeavy: false }),
          PLAYER_STATE_SYNC_INTERVAL_MS
        )

        notifyPlayerStateSnapshot(store)
        this.ipcInitialized = true
      },

      teardownIpcListeners(): void {
        getPlayerStoreRuntime(this as unknown as PlayerStoreOwner)?.teardownIpcHandlers()
        this.ipcInitialized = false
      },

      notifyPlayingState(playing?: boolean): void {
        getPlatformService().sendPlayingState(playing ?? this.playing)
      },

      notifyPlayModeChange(): void {
        getPlatformService().sendPlayModeChange(this.playMode)
      },

      async handleAudioError(error: unknown): Promise<void> {
        if (this.trackSwitching || isNativeAudioOutputPlaybackClaimed()) {
          return
        }

        const runtime = ensurePlayerStoreRuntime(this as unknown as PlayerStoreInstance)
        const errorHandler = runtime.ensureErrorHandler(() => this.createErrorHandler())
        const failedSong = this.currentSong
        const result = await errorHandler.handleAudioError(error, failedSong)

        if (result.shouldRetry && result.url) {
          if (!failedSong || !this.currentSong || !isSameSong(failedSong, this.currentSong)) {
            return
          }

          try {
            await audioManager.play(result.url)
            if (!this.currentSong || !isSameSong(failedSong, this.currentSong)) {
              return
            }
            failedSong.url = result.url
            this.currentSong.url = result.url
            this.playing = true
          } catch (retryError) {
            this.playing = false
            reportPlayerStoreError(
              retryError,
              'handleAudioError.retry',
              'Failed to play audio after retry'
            )
            const retryResult = await errorHandler.handleAudioError(retryError, this.currentSong)
            if (retryResult.shouldSkip) {
              try {
                await this.playNextSkipUnavailable()
              } catch (skipError) {
                reportPlayerStoreError(
                  skipError,
                  'handleAudioError.retry.skip',
                  'No playable songs remain after retry failure'
                )
              }
            }
          }
        } else if (result.shouldSkip) {
          try {
            await this.playNextSkipUnavailable()
          } catch (skipError) {
            reportPlayerStoreError(
              skipError,
              'handleAudioError.skip',
              'No playable songs remain after audio error'
            )
          }
        }
      },

      createErrorHandler(): PlaybackErrorHandler {
        return markRaw(
          new PlaybackErrorHandler({
            musicService: getMusicService(),
            getState: () => ({
              songList: this.songList,
              currentIndex: this.currentIndex,
              playMode: this.playMode
            }),
            onStateChange: changes => {
              if (changes.playing !== undefined) {
                this.playing = changes.playing
              }
            }
          })
        )
      },

      updateLyricIndex(time?: number): boolean {
        return this.applyResolvedLyricIndex(time ?? this.progress)
      },

      setSongList(songs: Song[]): void {
        this.songList = songs

        if (this.currentSong) {
          const newIndex = songs.findIndex(song => isSameSong(song, this.currentSong!))
          this.currentIndex = newIndex
          this.currentSong = newIndex >= 0 ? songs[newIndex] : null
        } else {
          this.currentIndex = -1
        }

        this.resetErrorHandler()
        getPlayerStoreRuntime(this as unknown as PlayerStoreOwner)?.resetPlaybackNavigation()
        notifyPlayerStateSnapshot(this as unknown as PlayerStoreInstance)
      },

      replaceQueue(songs: Song[]): void {
        this.setSongList(songs)
      },

      async replaceQueueAndPlay(songs: Song[], index: number): Promise<void> {
        if (songs.length === 0 || index < 0 || index >= songs.length) {
          return
        }

        this.setSongList(songs)
        await this.playSongWithDetails(index)
      },

      addSong(song: Song): void {
        this.songList.push(song)
        notifyPlayerStateSnapshot(this as unknown as PlayerStoreInstance)
      },

      async playSongByIndex(index: number, song?: Song, startSeconds?: number): Promise<void> {
        if (index < 0 || index >= this.songList.length) {
          return
        }

        const playbackGeneration = ++playbackStartGeneration
        const isCurrentPlaybackStart = (): boolean => playbackGeneration === playbackStartGeneration
        const wasInitialized = this.initialized
        this.initAudio()
        const hasExplicitStartSeconds =
          typeof startSeconds === 'number' && Number.isFinite(startSeconds) && startSeconds >= 0
        const explicitStartSeconds = hasExplicitStartSeconds ? Math.max(0, startSeconds) : 0

        const targetSong = song ?? this.songList[index]
        const localPlaybackUrl = resolveLocalLibraryPlaybackUrl(targetSong)
        if (!targetSong.url && localPlaybackUrl) {
          targetSong.url = localPlaybackUrl
        }

        const shouldResumeRestoredProgress =
          !hasExplicitStartSeconds &&
          !wasInitialized &&
          Boolean(this.currentSong) &&
          isSameSong(this.currentSong!, targetSong)
        const restoredResumeProgress = shouldResumeRestoredProgress
          ? resolveStartupResumeProgress(this.progress, this.duration)
          : 0
        const playbackStartSeconds = hasExplicitStartSeconds
          ? explicitStartSeconds
          : restoredResumeProgress

        if (!targetSong.url) {
          const error = new Error('No URL for song')
          reportPlayerStoreError(error, 'playSongByIndex', 'No URL for song')
          throw error
        }

        // Set currentSong BEFORE audio.src changes so that MediaSession
        // watchers can populate metadata synchronously.  Both currentSong
        // and playing are updated in the same reactive tick so the
        // MediaSession sees the new song, not the stale one.
        if (this.currentSong !== targetSong) {
          this.currentSong = targetSong
          this.currentIndex = index
        }

        // Suppress the pause event that fires when audio.src changes so
        // that the MediaSession playbackState never drops to 'paused'
        // during the transition.  Without this, Windows SMTC sees an
        // inactive session and switches to another app's media control.
        this.trackSwitching = true

        try {
          const nativeDidStart = await tryNativeAudioOutputPlayback(
            this,
            targetSong,
            playbackStartSeconds,
            isCurrentPlaybackStart
          )
          if (!isCurrentPlaybackStart()) {
            return
          }

          if (nativeDidStart) {
            return
          }

          await stopNativeAudioOutputPlayback(true)
          const playbackUrl = resolvePlaybackMediaUrl(
            String(targetSong.url),
            getPlatformService().isElectron()
          )
          await audioManager.play(playbackUrl)
          if (!isCurrentPlaybackStart()) {
            return
          }

          if (playbackStartSeconds > 0 || shouldResumeRestoredProgress) {
            if (playbackStartSeconds > 0) {
              try {
                this.seek(playbackStartSeconds)
              } catch (seekError) {
                console.warn(
                  '[playerStore] Failed to restore playback progress; starting from beginning',
                  seekError
                )
                this.progress = 0
                this.playing = true
                return
              }
            } else {
              this.progress = 0
              this.applyResolvedLyricIndex(0)
            }
          }
          this.playing = true
        } catch (error) {
          if (!isCurrentPlaybackStart()) {
            return
          }

          if (isNativeAudioOutputRequiredError(error)) {
            throw error
          }

          reportPlayerStoreError(error, 'playSongByIndex', 'Playback failed')
          this.playing = false
          throw error
        } finally {
          if (isCurrentPlaybackStart()) {
            this.trackSwitching = false
          }
        }
      },

      async playSongWithDetails(index: number, autoSkip = true): Promise<void> {
        await getPlaybackActions(this as unknown as PlayerStoreInstance).playSongWithDetails(
          index,
          autoSkip
        )
      },

      async restartPlaybackForAudioOutputChange(): Promise<void> {
        const restartIndex = this.currentIndex
        const restartSong = this.currentSong
        const restartProgress =
          Number.isFinite(this.progress) && this.progress > 0 ? this.progress : 0
        const hasPendingPlayIntent =
          nativeAudioOutputOwnership.pendingStart &&
          nativeAudioOutputOwnership.pendingPlaybackIntent !== false

        if (restartIndex < 0 || restartIndex >= this.songList.length || !restartSong) {
          await stopNativeAudioOutputPlayback(true)
          return
        }

        if (!this.playing && !hasPendingPlayIntent) {
          await stopNativeAudioOutputPlayback(true)
          this.playing = false
          this.notifyPlayingState(false)
          notifyPlayerStateSnapshot(this as unknown as PlayerStoreInstance)
          return
        }

        await this.playSongByIndex(restartIndex, restartSong, restartProgress)
      },

      togglePlay(): void {
        const store = this as unknown as PlayerStoreInstance

        if (!this.initialized) {
          if (this.songList.length > 0) {
            const targetIndex = this.currentIndex >= 0 ? this.currentIndex : 0
            void this.playSongWithDetails(targetIndex).catch(error => {
              handlePlaybackActionFailure(
                store,
                error,
                'togglePlay.start',
                'Failed to start playback from togglePlay'
              )
            })
          }
          return
        }

        if (nativeAudioOutputOwnership.pendingStart) {
          const nextPlaying = !(nativeAudioOutputOwnership.pendingPlaybackIntent ?? true)
          nativeAudioOutputOwnership.pendingPlaybackIntent = nextPlaying
          this.playing = nextPlaying
          this.notifyPlayingState(nextPlaying)
          if (!nextPlaying) {
            suspendNativeAudioOutputProgressClock(store.progress)
          }
          notifyPlayerStateSnapshot(store)
          return
        }

        if (nativeAudioOutputOwnership.active) {
          if (this.playing) {
            this.playing = false
            this.notifyPlayingState(false)
            pauseNativeAudioOutputProgressClock(store)
            void nativeAudioOutputPlayback.pause().catch(error => {
              handlePlaybackActionFailure(
                store,
                error,
                'togglePlay.native.pause',
                'Failed to pause native audio output playback'
              )
            })
            return
          }

          this.playing = true
          this.notifyPlayingState(true)
          if (
            nativeAudioOutputOwnership.wasPlayingFromHelper &&
            !nativeAudioOutputOwnership.progressClockSuspended
          ) {
            resumeNativeAudioOutputProgressClock(store)
          }
          void nativeAudioOutputPlayback.resume().catch(error => {
            handlePlaybackActionFailure(
              store,
              error,
              'togglePlay.native.resume',
              'Failed to resume native audio output playback'
            )
          })
          return
        }

        void Promise.resolve(audioManager.toggle()).catch(error => {
          handlePlaybackActionFailure(
            store,
            error,
            'togglePlay.toggle',
            'Failed to toggle playback'
          )
        })
      },

      getRandomIndex(excludeCurrent = true): number {
        return getPlaybackActions(this as unknown as PlayerStoreInstance).getRandomIndex(
          excludeCurrent
        )
      },

      playPrev(): void {
        if (this.songList.length === 0) {
          return
        }

        getPlaybackActions(this as unknown as PlayerStoreInstance).playPrev()
      },

      playNext(): void {
        if (this.songList.length === 0) {
          return
        }

        getPlaybackActions(this as unknown as PlayerStoreInstance).playNext()
      },

      handleSongEnd(): void {
        const store = this as unknown as PlayerStoreInstance

        if (this.playMode === PLAY_MODE.SINGLE_LOOP) {
          audioManager.seek(0)
          void audioManager.play().catch(error => {
            handlePlaybackActionFailure(
              store,
              error,
              'handleSongEnd.singleLoop',
              'Failed to replay the current song after it ended'
            )
            this.playNext()
          })
        } else {
          this.playNext()
        }
      },

      resetErrorHandler(): void {
        getPlayerStoreRuntime(this as unknown as PlayerStoreOwner)?.resetErrorHandler()
      },

      setVolume(vol: number): void {
        this.volume = Math.max(0, Math.min(1, vol))
        audioManager.setVolume(this.volume)
        if (nativeAudioOutputOwnership.active) {
          void nativeAudioOutputPlayback.setVolume(this.volume).catch(error => {
            reportPlayerStoreError(
              error,
              'setVolume.native',
              'Failed to sync native audio output volume'
            )
          })
        }
      },

      setMuted(muted: boolean): void {
        const store = this as unknown as PlayerStoreInstance
        this.muted = muted
        audioManager.setMuted(muted)
        notifyPlayerStateSnapshot(store)
      },

      toggleMute(): void {
        this.setMuted(!this.muted)
      },

      togglePlayMode(): void {
        this.playMode = toPlayMode(this.playMode + 1)
        this.notifyPlayModeChange()
      },

      setPlayMode(mode: StorePlayMode): void {
        this.playMode = toPlayMode(mode)
        this.notifyPlayModeChange()
      },

      setLyric(lyric: unknown): void {
        this.lyric = lyric
      },

      toggleLyricType(type: 'trans' | 'roma'): void {
        const currentTypes = normalizeLyricTypes(this.lyricType)
        const nextOptionalTypes = currentTypes.includes(type)
          ? currentTypes.filter(item => item !== 'original' && item !== type)
          : [...currentTypes.filter(item => item !== 'original'), type]

        this.lyricType = ['original', ...new Set(nextOptionalTypes)]
      },

      setWebLyricAppearance(patch: Partial<WebLyricAppearance>): void {
        this.webLyricAppearance = patchWebLyricAppearance(this.webLyricAppearance, patch)
      },

      resetWebLyricAppearance(): void {
        this.webLyricAppearance = { ...DEFAULT_WEB_LYRIC_APPEARANCE }
      },

      togglePlayerDocked(): void {
        this.isPlayerDocked = !this.isPlayerDocked
        getStorageService().setItem('playerDockedUserToggled', 'true')
      },

      setLyricsArray(lyrics: LyricLine[]): void {
        const store = this as unknown as PlayerStoreInstance

        this.lyricsArray = markRaw(lyrics) as LyricLine[]
        this.lyricSong = lyrics.length > 0 ? this.currentSong : null
        this.currentLyricIndex = -1

        getPlayerStoreRuntime(store)?.getLyricEngine()?.setLyrics(lyrics)
        this.updateLyricIndex(this.progress)
        notifyPlayerStateSnapshot(store)
        notifyLyricTimeUpdate(store, getPlatformService(), this.progress, 'lyrics-load')
      },

      removeSongFromPlaylist(index: number): void {
        removeFromPlaylistFromIpc(this as unknown as PlayerStoreInstance, index)
      },

      clearPlaylist(): void {
        const store = this as unknown as PlayerStoreInstance

        this.songList = []
        this.currentIndex = -1
        this.currentSong = null
        this.lyricSong = null
        this.lyric = null
        this.lyricsArray = []
        this.currentLyricIndex = -1
        this.loading = false
        this.ipcInitialized = false

        audioManager.pause()
        this.playing = false
        this.progress = 0
        this.duration = 0
        this.initialized = false
        unsubscribeNativeAudioOutputEnded?.()
        unsubscribeNativeAudioOutputEnded = null
        unsubscribeNativeAudioOutputError?.()
        unsubscribeNativeAudioOutputError = null
        unsubscribeNativeAudioOutputStatus?.()
        unsubscribeNativeAudioOutputStatus = null
        void stopNativeAudioOutputPlayback().catch(error => {
          reportPlayerStoreError(
            error,
            'clearPlaylist.native',
            'Failed to stop native audio output playback'
          )
        })

        notifyPlayerStateSnapshot(store)
        notifyLyricTimeUpdate(store, getPlatformService(), 0, 'reset')
        resetPlayerStoreRuntime(store)
      }
    },

    persist: {
      storage: persistStorage,
      pick: [
        'volume',
        'muted',
        'playMode',
        'lyricType',
        'webLyricAppearance',
        'isPlayerDocked',
        'songList',
        'currentIndex',
        'progress',
        'duration'
      ],
      beforeHydrate: (_context: unknown) => {
        const rawPlayerState = persistStorage.getItem(storeId)

        if (!rawPlayerState) {
          console.log('Restoring player state...')
          return
        }

        try {
          const parsed = JSON.parse(rawPlayerState) as Record<string, unknown>
          if (
            !Object.prototype.hasOwnProperty.call(parsed, 'isPlayerDocked') &&
            Object.prototype.hasOwnProperty.call(parsed, 'isCompact')
          ) {
            parsed.isPlayerDocked = parsed.isCompact
            delete parsed.isCompact
            persistStorage.setItem(storeId, JSON.stringify(parsed))
          }
        } catch {
          // Ignore invalid persisted JSON here; existing hydration recovery handles it later.
        }

        console.log('Restoring player state...')
      },
      afterHydrate: (context: unknown) => {
        const store = (context as { store: PlayerState }).store
        normalizeHydratedPlayerState(store, audioManager)
      }
    }
  })
}

export const usePlayerStore = createPlayerStore()
