import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'

import { AUDIO_OUTPUT_CACHE_DIR_NAME } from '../cachePolicy'
import {
  AUDIO_OUTPUT_PROTOCOL_VERSION,
  createDefaultAudioOutputStatus,
  parseAudioOutputEventLine,
  sanitizeAudioOutputPlayFilePayload,
  sanitizeAudioOutputPlaybackVolumePayload,
  sanitizeAudioOutputSettings,
  sanitizeAudioOutputTestTonePayload,
  serializeAudioOutputCommand,
  type AudioOutputCommand,
  type AudioOutputDevice,
  type AudioOutputEvent,
  type AudioOutputHelperStatus,
  type AudioOutputMode,
  type AudioOutputNativePlaybackDownloadStrategy,
  type AudioOutputPlayFilePayload,
  type AudioOutputPlaybackVolumePayload,
  type AudioOutputSettings,
  type AudioOutputStatus,
  type AudioOutputTestTonePayload
} from '@shared/audioOutput/protocol'
import { resolveAudioOutputHelperPath } from './audioOutputNativePaths'
import {
  REMOTE_AUDIO_CACHE_MAX_BYTES,
  RemoteMediaHttpStatusError,
  createByteLimitTransform,
  createRemoteMediaFetchInit,
  createRemoteMediaRangeFetchInit,
  isRejectedRemoteMediaContentType,
  parseContentRange,
  parseHeaderByteSize,
  removeRemotePlaybackCacheFile,
  resolveRemoteAudioCacheExtension,
  resolveRemoteAudioSourceUrl,
  resolveRemoteMediaRangeSupport,
  sanitizeRemoteRangeChunkBytes
} from './audioOutputRemoteCache'

type AudioOutputLogger = Pick<Console, 'info' | 'warn' | 'error'> & Partial<Pick<Console, 'debug'>>

type SpawnHelper = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams

export type RemoteMediaFetch = (url: string, init?: RequestInit) => Promise<Response>
export type ElectronNetLike = {
  fetch?: RemoteMediaFetch
}
type RemoteMediaCacheResult = {
  cachedPath: string
  bytesReceived: number
  totalBytes?: number
  rangeSupported: boolean
  strategy: AudioOutputNativePlaybackDownloadStrategy
  complete: boolean
  growingExpectedBytes?: number
}
type NativePlaybackError = NonNullable<AudioOutputStatus['nativePlaybackError']>
type VoicemeeterRouteReadyWaiter = {
  resolve: () => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const HELPER_GRACEFUL_SHUTDOWN_TIMEOUT_MS = 500
const HELPER_PLAYBACK_STOP_SETTLE_TIMEOUT_MS = 1000
const VOICEMEETER_ROUTE_READY_TIMEOUT_MS = 30_000
const OPTIONAL_HELPER_AUDIO_CACHE_EXTENSIONS = new Set(['.opus'])
const COMPLETE_CACHE_BEFORE_PLAYBACK_EXTENSIONS = new Set(['.ape'])

export type AudioOutputServiceDeps = {
  appPath?: string
  cacheDir?: string
  electronNet?: ElectronNetLike
  exists?: (filePath: string) => boolean
  fetchRemoteMedia?: RemoteMediaFetch
  isPackaged?: boolean
  logger?: AudioOutputLogger
  onStatusChange?: (status: AudioOutputStatus) => void
  platform?: NodeJS.Platform
  remoteRangeChunkBytes?: number
  resourcesPath?: string
  spawnHelper?: SpawnHelper
}

export class AudioOutputService {
  private readonly appPath: string
  private readonly cacheDir: string
  private readonly exists: (filePath: string) => boolean
  private readonly fetchRemoteMedia: RemoteMediaFetch
  private readonly isPackaged: boolean
  private readonly logger: AudioOutputLogger
  private readonly onStatusChange: (status: AudioOutputStatus) => void
  private readonly platform: NodeJS.Platform
  private readonly remoteRangeChunkBytes: number
  private readonly resourcesPath: string
  private readonly spawnHelper: SpawnHelper

  private enabled = false
  private settings = sanitizeAudioOutputSettings(undefined)
  private helper: ChildProcessWithoutNullStreams | null = null
  private helperPath: string | null = null
  private stdoutBuffer = ''
  private devices: AudioOutputDevice[] = []
  private supportedExtensions: string[] = []
  private helperSupportedModes: AudioOutputMode[] | null = null
  private reason: string | null = null
  private lastStatus: AudioOutputStatus | null = null
  private testToneRunning = false
  private nativePlaybackRunning = false
  private nativePlaybackPaused = false
  private nativePlaybackSource: string | null = null
  private nativePlaybackHelperPath: string | null = null
  private nativePlaybackToken: string | null = null
  private nativePlaybackSession: AudioOutputStatus['nativePlaybackSession'] | null = null
  private nativePlaybackState: NonNullable<AudioOutputStatus['nativePlaybackState']> = 'idle'
  private nativePlaybackPositionSeconds: number | null = null
  private nativePlaybackDownload: AudioOutputStatus['nativePlaybackDownload'] | null = null
  private nativePlaybackError: AudioOutputStatus['nativePlaybackError'] | null = null
  private playbackRequestId = 0
  private remotePlaybackAbortController: AbortController | null = null
  private readonly remotePlaybackCacheFiles = new Set<string>()
  private readonly playbackStopWaiters = new Set<() => void>()
  private settingsChangeStopSettle: Promise<void> | null = null
  private settingsChangeConfigureRequestId = 0
  private settingsChangeConfigureSettle: Promise<AudioOutputStatus> | null = null
  private terminalPlaybackReleaseKey: string | null = null
  private readonly voicemeeterRouteReadyWaiters = new Set<VoicemeeterRouteReadyWaiter>()

  constructor(deps: AudioOutputServiceDeps = {}) {
    this.appPath = deps.appPath ?? process.cwd()
    this.cacheDir = deps.cacheDir ?? join(this.appPath, '.userData', AUDIO_OUTPUT_CACHE_DIR_NAME)
    this.exists = deps.exists ?? existsSync
    this.fetchRemoteMedia =
      deps.fetchRemoteMedia ?? resolveDefaultRemoteMediaFetch(deps.electronNet)
    this.isPackaged = deps.isPackaged ?? false
    this.logger = deps.logger ?? console
    this.onStatusChange = deps.onStatusChange ?? (() => {})
    this.platform = deps.platform ?? process.platform
    this.remoteRangeChunkBytes = sanitizeRemoteRangeChunkBytes(deps.remoteRangeChunkBytes)
    this.resourcesPath = deps.resourcesPath ?? process.resourcesPath ?? this.appPath
    this.spawnHelper =
      deps.spawnHelper ?? ((command, args, options) => spawn(command, args, options))
  }

  setEnabled(enabled: boolean, settings?: AudioOutputSettings): AudioOutputStatus {
    this.enabled = enabled
    if (settings) {
      this.settings = sanitizeAudioOutputSettings(settings)
    }

    if (!enabled) {
      this.playbackRequestId += 1
      this.cancelRemotePlaybackDownload()
      this.testToneRunning = false
      this.nativePlaybackRunning = false
      this.nativePlaybackPaused = false
      this.nativePlaybackSource = null
      this.nativePlaybackHelperPath = null
      this.nativePlaybackToken = null
      this.clearNativePlaybackSession()
      this.nativePlaybackState = 'idle'
      this.nativePlaybackPositionSeconds = null
      this.nativePlaybackDownload = null
      this.nativePlaybackError = null
      this.terminalPlaybackReleaseKey = null
      this.rejectVoicemeeterRouteReadyWaiters(
        new Error('Native audio output was disabled before Voicemeeter route became ready.')
      )
      this.sendCommand({ type: 'stopPlayback' })
      this.sendCommand({
        type: 'configure',
        payload: {
          enabled: false,
          settings: this.settings
        }
      })
      this.stopHelper()
      this.reason = null
      return this.publishStatus(this.createStatus('disabled'))
    }

    const helperPath = this.resolveHelperPath()
    if (!helperPath) {
      this.reason = 'Rust audio output helper binary was not found.'
      return this.publishStatus(this.createStatus('unavailable'))
    }

    try {
      this.ensureHelper(helperPath)
      this.reason = 'Native audio output helper is starting.'
      this.sendCommand({
        type: 'initialize',
        payload: { protocolVersion: AUDIO_OUTPUT_PROTOCOL_VERSION }
      })
      this.sendConfigure()
      return this.publishStatus(this.createStatus('unavailable'))
    } catch (error) {
      this.reason = `Failed to start Rust audio output helper: ${formatError(error)}`
      this.logger.warn('[AudioOutput] Failed to start helper', error)
      this.stopHelper()
      return this.publishStatus(this.createStatus('unavailable'))
    }
  }

  updateSettings(settings: AudioOutputSettings): AudioOutputStatus | Promise<AudioOutputStatus> {
    const previousSettings = this.settings
    this.settings = sanitizeAudioOutputSettings(settings)

    if (!this.enabled) {
      return this.publishStatus(this.createStatus('disabled'))
    }

    if (!this.helper) {
      return this.setEnabled(true, this.settings)
    }

    const shouldStopForSettingsChange = shouldStopPlaybackForAudioOutputSettingsChange(
      previousSettings,
      this.settings
    )
    if (this.settingsChangeStopSettle) {
      return this.configureAfterSettingsChangeStopSettled(
        this.settingsChangeStopSettle,
        ++this.settingsChangeConfigureRequestId
      )
    }

    if (shouldStopForSettingsChange) {
      const settled = this.resetNativePlaybackStateForSettingsChange()
      if (settled) {
        return this.configureAfterSettingsChangeStopSettled(
          settled,
          ++this.settingsChangeConfigureRequestId
        )
      }
    }

    this.sendConfigure()
    return this.publishStatus(this.createStatus('unavailable'))
  }

  playTestTone(payload?: AudioOutputTestTonePayload): AudioOutputStatus {
    if (!this.enabled) {
      this.reason = 'Native audio output must be enabled before playing a test tone.'
      return this.publishStatus(this.createStatus('disabled'))
    }

    if (!this.helper) {
      const status = this.setEnabled(true, this.settings)
      if (!this.helper) {
        return status
      }
    }

    const sanitizedPayload = sanitizeAudioOutputTestTonePayload(payload)
    this.testToneRunning = true
    this.nativePlaybackError = null
    this.reason = 'Native audio output test tone is playing.'
    const status = this.publishStatus(this.createStatusFromLastStatus('native'))
    this.sendCommand({
      type: 'playTestTone',
      payload: sanitizedPayload
    })
    return status
  }

  probeExclusiveLock(): AudioOutputStatus {
    if (!this.enabled) {
      this.reason = 'Native audio output must be enabled before probing WASAPI exclusive lock.'
      return this.publishStatus(this.createStatus('disabled'))
    }

    if (!this.helper) {
      const status = this.setEnabled(true, this.settings)
      if (!this.helper) {
        return status
      }
    }

    this.testToneRunning = false
    this.nativePlaybackError = null
    this.reason = 'WASAPI exclusive lock probe is running.'
    const status = this.publishStatus(this.createStatusFromLastStatus('native'))
    this.sendCommand({ type: 'probeExclusiveLock' })
    return status
  }

  playFile(payload: AudioOutputPlayFilePayload): AudioOutputStatus | Promise<AudioOutputStatus> {
    if (!this.enabled) {
      this.reason = 'Native audio output must be enabled before playing a file.'
      return this.publishStatus(this.createStatus('disabled'))
    }

    if (!this.helper) {
      const status = this.setEnabled(true, this.settings)
      if (!this.helper) {
        return status
      }
    }

    const sanitizedPayload = sanitizeAudioOutputPlayFilePayload(payload)
    const requestId = ++this.playbackRequestId
    this.rejectVoicemeeterRouteReadyWaiters(
      new Error(
        'Native audio output playback request changed before Voicemeeter route became ready.'
      )
    )
    this.cancelRemotePlaybackDownload()
    this.nativePlaybackError = null
    void this.cleanupRemotePlaybackCache()

    if (this.getPendingSettingsChangeSettle()) {
      return this.playFileAfterPendingSettingsChange(sanitizedPayload, requestId)
    }

    return this.playFileWithRequest(sanitizedPayload, requestId)
  }

  private playFileWithRequest(
    sanitizedPayload: AudioOutputPlayFilePayload,
    requestId: number
  ): AudioOutputStatus | Promise<AudioOutputStatus> {
    const playbackToken = sanitizedPayload.playbackToken ?? createNativePlaybackToken(requestId)
    const path = sanitizedPayload.path?.trim() ?? ''
    const remoteUrl = resolveRemoteAudioSourceUrl(sanitizedPayload.url)
    if (!path && remoteUrl) {
      return this.playRemoteFile(remoteUrl, sanitizedPayload, requestId)
    }

    if (!path && sanitizedPayload.url) {
      this.nativePlaybackRunning = false
      this.nativePlaybackPaused = false
      this.nativePlaybackSource = sanitizedPayload.url
      this.nativePlaybackHelperPath = null
      this.nativePlaybackToken = null
      this.clearNativePlaybackSession()
      this.nativePlaybackState = 'error'
      this.nativePlaybackPositionSeconds = null
      this.nativePlaybackDownload = null
      this.nativePlaybackError = null
      this.reason = 'Native audio output remote URL is unsupported or blocked.'
      return this.publishStatus(this.createStatusFromLastStatus('unavailable'))
    }

    if (!path) {
      this.reason = 'Native audio output playback requires a local file path or remote URL.'
      return this.publishStatus(this.createStatusFromLastStatus('unavailable'))
    }

    this.sendPrePlaybackStopCommand()
    this.nativePlaybackRunning = true
    this.nativePlaybackPaused = false
    this.nativePlaybackSource = path
    this.nativePlaybackHelperPath = path
    this.nativePlaybackToken = playbackToken
    this.startNativePlaybackSession(path, playbackToken, requestId)
    this.nativePlaybackState = 'starting'
    this.nativePlaybackPositionSeconds = null
    this.nativePlaybackDownload = null
    this.nativePlaybackError = null
    this.terminalPlaybackReleaseKey = null
    this.reason = 'Native audio output playback is starting.'
    const status = this.publishStatus(this.createStatusFromLastStatus('native'))
    void this.startLocalFilePlaybackAfterRouteReady(
      path,
      sanitizedPayload,
      requestId,
      playbackToken
    )
    return status
  }

  private async startLocalFilePlaybackAfterRouteReady(
    path: string,
    payload: AudioOutputPlayFilePayload,
    requestId: number,
    playbackToken: string
  ): Promise<void> {
    if (this.shouldWaitForVoicemeeterRouteBeforePlayback()) {
      const routeReady = await this.waitForVoicemeeterRouteBeforePlayback(requestId)
      if (!routeReady || requestId !== this.playbackRequestId) {
        return
      }
    }

    this.sendCommand({
      type: 'playFile',
      payload: {
        path,
        startSeconds: payload.startSeconds,
        volume: payload.volume,
        playbackToken
      }
    })
  }

  private async playFileAfterPendingSettingsChange(
    sanitizedPayload: AudioOutputPlayFilePayload,
    requestId: number
  ): Promise<AudioOutputStatus> {
    this.publishStatus(this.createStatus('unavailable'))
    await this.waitForPendingSettingsChangeSettle()

    if (requestId !== this.playbackRequestId || !this.enabled || !this.helper) {
      return this.getStatus()
    }

    return this.playFileWithRequest(sanitizedPayload, requestId)
  }

  pausePlayback(): AudioOutputStatus {
    if (!this.enabled) {
      return this.publishStatus(this.createStatus('disabled'))
    }

    this.nativePlaybackPaused = this.nativePlaybackRunning
    this.nativePlaybackState = this.nativePlaybackRunning ? 'paused' : this.nativePlaybackState
    this.reason = this.nativePlaybackRunning
      ? 'Native audio output playback is paused.'
      : this.reason
    const status = this.publishStatus(this.createStatusFromLastStatus('native'))
    this.sendCommand({ type: 'pausePlayback' })
    return status
  }

  resumePlayback(): AudioOutputStatus {
    if (!this.enabled) {
      return this.publishStatus(this.createStatus('disabled'))
    }

    this.nativePlaybackPaused = false
    this.nativePlaybackState = this.nativePlaybackRunning ? 'playing' : this.nativePlaybackState
    this.reason = this.nativePlaybackRunning
      ? 'Native audio output playback is resuming.'
      : this.reason
    const status = this.publishStatus(this.createStatusFromLastStatus('native'))
    this.sendCommand({ type: 'resumePlayback' })
    return status
  }

  stopPlayback(): AudioOutputStatus {
    this.playbackRequestId += 1
    this.cancelRemotePlaybackDownload()
    this.nativePlaybackRunning = false
    this.nativePlaybackPaused = false
    this.nativePlaybackSource = null
    this.nativePlaybackHelperPath = null
    this.nativePlaybackToken = null
    this.clearNativePlaybackSession()
    this.nativePlaybackState = 'stopped'
    this.nativePlaybackPositionSeconds = null
    this.nativePlaybackDownload = null
    this.nativePlaybackError = null
    this.terminalPlaybackReleaseKey = null
    this.rejectVoicemeeterRouteReadyWaiters(
      new Error('Native audio output playback stopped before Voicemeeter route became ready.')
    )
    this.sendCommand({ type: 'stopPlayback' })
    void this.cleanupRemotePlaybackCache()

    if (!this.enabled) {
      return this.publishStatus(this.createStatus('disabled'))
    }

    this.reason = this.lastStatus?.reason ?? this.reason
    return this.publishStatus(this.createStatusFromLastStatus('native'))
  }

  async stopPlaybackSettled(): Promise<AudioOutputStatus> {
    const shouldWait = this.shouldWaitForHelperPlaybackStop()
    const settled = shouldWait ? this.waitForHelperPlaybackStop() : Promise.resolve()
    const status = this.stopPlayback()

    if (!shouldWait) {
      return status
    }

    await settled
    return this.getStatus()
  }

  setPlaybackVolume(payload: AudioOutputPlaybackVolumePayload): AudioOutputStatus {
    if (!this.enabled) {
      return this.publishStatus(this.createStatus('disabled'))
    }

    this.sendCommand({
      type: 'setPlaybackVolume',
      payload: sanitizeAudioOutputPlaybackVolumePayload(payload)
    })
    return this.publishStatus(this.createStatusFromLastStatus('native'))
  }

  getSettings(): AudioOutputSettings {
    return { ...this.settings }
  }

  getStatus(): AudioOutputStatus {
    if (!this.enabled) {
      return this.createStatus('disabled')
    }

    if (this.testToneRunning) {
      return this.createStatusFromLastStatus('native')
    }

    return this.createStatusFromLastStatus(this.lastStatus?.backend ?? 'unavailable')
  }

  async dispose(): Promise<void> {
    this.playbackRequestId += 1
    this.cancelRemotePlaybackDownload()
    this.enabled = false
    this.testToneRunning = false
    this.nativePlaybackRunning = false
    this.nativePlaybackPaused = false
    this.nativePlaybackSource = null
    this.nativePlaybackHelperPath = null
    this.nativePlaybackToken = null
    this.clearNativePlaybackSession()
    this.nativePlaybackState = 'stopped'
    this.nativePlaybackPositionSeconds = null
    this.nativePlaybackDownload = null
    this.nativePlaybackError = null
    this.terminalPlaybackReleaseKey = null
    this.rejectVoicemeeterRouteReadyWaiters(
      new Error('Native audio output was disposed before Voicemeeter route became ready.')
    )
    this.reason = null
    this.sendCommand({ type: 'stopPlayback' })
    this.sendCommand({ type: 'shutdown' })
    await this.stopHelperGracefully()
    await this.cleanupRemotePlaybackCache()
  }

  private createStatus(backend: AudioOutputStatus['backend']): AudioOutputStatus {
    const disabled = backend === 'disabled'
    return this.withNativePlaybackDetails({
      ...createDefaultAudioOutputStatus(),
      enabled: this.enabled,
      backend,
      backendAvailable: backend === 'native',
      settings: { ...this.settings },
      requestedMode: this.settings.mode,
      activeMode: backend === 'native' ? this.settings.mode : undefined,
      deviceId: this.settings.deviceId || undefined,
      devices: [...this.devices],
      supportedExtensions: [...this.supportedExtensions],
      supportedModes: [
        ...(this.helperSupportedModes ?? getSupportedAudioOutputModes(this.platform))
      ],
      helperPath: this.helperPath ?? undefined,
      helperRunning: Boolean(this.helper),
      testToneRunning: this.testToneRunning,
      nativePlaybackRunning: this.nativePlaybackRunning,
      nativePlaybackPaused: this.nativePlaybackPaused,
      nativePlaybackSource: this.nativePlaybackSource ?? undefined,
      nativePlaybackState: this.nativePlaybackState,
      nativePlaybackPositionSeconds: this.nativePlaybackPositionSeconds ?? undefined,
      nativePlaybackToken: this.nativePlaybackToken ?? undefined,
      nativePlaybackDownload: this.nativePlaybackDownload ?? undefined,
      nativePlaybackError: this.nativePlaybackError ?? undefined,
      reason: disabled ? undefined : (this.reason ?? undefined)
    })
  }

  private createStatusFromLastStatus(
    fallbackBackend: AudioOutputStatus['backend']
  ): AudioOutputStatus {
    const lastStatus = this.lastStatus
    const fallbackStatus = this.createStatus(fallbackBackend)
    const canReuseLastStatus =
      lastStatus !== null && lastStatus.requestedMode === this.settings.mode
    const baseStatus = canReuseLastStatus ? lastStatus : fallbackStatus
    const status: AudioOutputStatus = {
      ...baseStatus,
      settings: { ...this.settings },
      requestedMode: this.settings.mode,
      helperPath: this.helperPath ?? undefined,
      helperRunning: Boolean(this.helper),
      testToneRunning: this.testToneRunning,
      nativePlaybackRunning: this.nativePlaybackRunning,
      nativePlaybackPaused: this.nativePlaybackPaused,
      nativePlaybackSource: this.nativePlaybackSource ?? undefined,
      nativePlaybackState: this.nativePlaybackState,
      nativePlaybackPositionSeconds: this.nativePlaybackPositionSeconds ?? undefined,
      nativePlaybackToken: this.nativePlaybackToken ?? undefined,
      nativePlaybackDownload: this.nativePlaybackDownload ?? undefined,
      nativePlaybackError: this.nativePlaybackError ?? undefined,
      reason:
        this.reason ??
        (canReuseLastStatus ? this.lastStatus?.reason : undefined) ??
        fallbackStatus.reason
    }

    if (this.nativePlaybackState === 'error' || !canReuseLastStatus) {
      delete status.activeMode
      delete status.exclusiveProbe
      delete status.bitPerfect
      delete status.voicemeeterRemote
    }

    return this.withNativePlaybackDetails(status)
  }

  private startNativePlaybackSession(source: string, token: string, requestId: number): void {
    this.nativePlaybackSession = {
      id: createNativePlaybackSessionId(requestId),
      token,
      source,
      requestedMode: this.settings.mode,
      activeMode: this.settings.mode,
      startedAt: Date.now()
    }
  }

  private clearNativePlaybackSession(): void {
    this.nativePlaybackSession = null
  }

  private withNativePlaybackDetails(status: AudioOutputStatus): AudioOutputStatus {
    const nativePlaybackSession = this.nativePlaybackSession
      ? {
          ...this.nativePlaybackSession,
          activeMode: status.activeMode ?? this.nativePlaybackSession.activeMode
        }
      : undefined
    const nativePlaybackDiagnostics = createNativePlaybackDiagnostics(status, nativePlaybackSession)

    const nextStatus: AudioOutputStatus = { ...status }
    if (nativePlaybackSession) {
      nextStatus.nativePlaybackSession = nativePlaybackSession
    } else {
      delete nextStatus.nativePlaybackSession
    }
    if (nativePlaybackDiagnostics) {
      nextStatus.nativePlaybackDiagnostics = nativePlaybackDiagnostics
    } else {
      delete nextStatus.nativePlaybackDiagnostics
    }

    return nextStatus
  }

  private playRemoteFile(
    remoteUrl: string,
    payload: AudioOutputPlayFilePayload,
    requestId: number
  ): AudioOutputStatus {
    const playbackToken = payload.playbackToken ?? createNativePlaybackToken(requestId)
    this.nativePlaybackRunning = true
    this.nativePlaybackPaused = false
    this.nativePlaybackSource = remoteUrl
    this.nativePlaybackHelperPath = null
    this.nativePlaybackToken = playbackToken
    this.startNativePlaybackSession(remoteUrl, playbackToken, requestId)
    this.nativePlaybackState = 'starting'
    this.nativePlaybackPositionSeconds = null
    this.nativePlaybackDownload = {
      state: 'downloading',
      bytesReceived: 0
    }
    this.nativePlaybackError = null
    this.terminalPlaybackReleaseKey = null
    this.reason = 'Native audio output is caching remote media before playback.'
    this.sendPrePlaybackStopCommand()
    const status = this.publishStatus(this.createStatusFromLastStatus('native'))

    void this.startRemoteFilePlayback(remoteUrl, payload, requestId, playbackToken)

    return status
  }

  private async startRemoteFilePlayback(
    remoteUrl: string,
    payload: AudioOutputPlayFilePayload,
    requestId: number,
    playbackToken: string
  ): Promise<void> {
    try {
      const cacheResult = await this.cacheRemoteMedia(remoteUrl, requestId, payload.requestHeaders)
      if (requestId !== this.playbackRequestId) {
        await this.deleteCachedRemoteFile(cacheResult.cachedPath)
        return
      }

      this.nativePlaybackHelperPath = cacheResult.cachedPath
      this.nativePlaybackDownload = {
        state: cacheResult.complete ? 'cached' : 'downloading',
        bytesReceived: cacheResult.bytesReceived,
        totalBytes: cacheResult.totalBytes,
        rangeSupported: cacheResult.rangeSupported,
        strategy: cacheResult.strategy
      }
      this.reason = cacheResult.complete
        ? 'Native audio output playback is starting.'
        : 'Native audio output playback is starting while remote media continues caching.'
      this.publishStatus(this.createStatusFromLastStatus('native'))
      if (this.shouldWaitForVoicemeeterRouteBeforePlayback()) {
        const routeReady = await this.waitForVoicemeeterRouteBeforePlayback(requestId)
        if (!routeReady || requestId !== this.playbackRequestId) {
          return
        }
      }

      this.sendCommand({
        type: 'playFile',
        payload: {
          path: cacheResult.cachedPath,
          startSeconds: payload.startSeconds,
          volume: payload.volume,
          playbackToken,
          ...(cacheResult.growingExpectedBytes
            ? { growingExpectedBytes: cacheResult.growingExpectedBytes }
            : {})
        }
      })
    } catch (error) {
      if (requestId !== this.playbackRequestId) {
        return
      }

      this.nativePlaybackRunning = false
      this.nativePlaybackPaused = false
      this.nativePlaybackHelperPath = null
      this.nativePlaybackToken = null
      this.clearNativePlaybackSession()
      this.nativePlaybackState = 'error'
      this.nativePlaybackPositionSeconds = null
      this.nativePlaybackDownload = null
      this.nativePlaybackError = createNativePlaybackRemoteError(error)
      this.reason = this.nativePlaybackError
        ? createNativePlaybackErrorReason(this.nativePlaybackError)
        : `Failed to cache remote media for native audio output: ${formatError(error)}`
      this.logger.warn('[AudioOutput] Failed to cache remote media for native playback', error)
      this.publishStatus(this.createStatusFromLastStatus('unavailable'))
    }
  }

  private async cacheRemoteMedia(
    remoteUrl: string,
    requestId: number,
    requestHeaders?: Record<string, string>
  ): Promise<RemoteMediaCacheResult> {
    await mkdir(this.cacheDir, { recursive: true })
    await this.cleanupUntrackedRemotePlaybackCacheFiles()

    const abortController = new AbortController()
    let cachedPath: string | null = null
    let continueCachingInBackground = false
    this.remotePlaybackAbortController = abortController

    try {
      const firstRangeEnd = this.remoteRangeChunkBytes - 1
      const response = await this.fetchRemoteMedia(
        remoteUrl,
        createRemoteMediaRangeFetchInit(
          remoteUrl,
          0,
          firstRangeEnd,
          abortController.signal,
          requestHeaders
        )
      )
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        throw new RemoteMediaHttpStatusError('remote media request', response.status)
      }

      const contentType = response.headers.get('content-type')
      if (isRejectedRemoteMediaContentType(contentType)) {
        await response.body?.cancel().catch(() => {})
        throw new Error(`remote media response content type is not audio: ${contentType}`)
      }

      const contentLength = parseHeaderByteSize(response.headers.get('content-length'))
      const contentRange = parseContentRange(response.headers.get('content-range'))
      if (response.status === 206) {
        if (!contentRange) {
          throw new Error('remote media range response did not include a valid content-range')
        }

        if (contentRange.start !== 0 || contentRange.end > firstRangeEnd) {
          throw new Error('remote media range response did not match the requested first chunk')
        }

        if (contentRange.totalBytes === undefined) {
          await response.body?.cancel().catch(() => {})
          return this.cacheRemoteMediaAsSingleResponse(
            remoteUrl,
            requestId,
            abortController,
            requestHeaders
          )
        }
      }

      const totalBytes =
        contentRange?.totalBytes ?? (response.status === 206 ? undefined : contentLength)
      const rangeSupported = resolveRemoteMediaRangeSupport(response)
      const strategy: AudioOutputNativePlaybackDownloadStrategy =
        response.status === 206 ? 'range-chunk' : 'single-response'
      if (
        (typeof totalBytes === 'number' && totalBytes > REMOTE_AUDIO_CACHE_MAX_BYTES) ||
        (typeof contentLength === 'number' && contentLength > REMOTE_AUDIO_CACHE_MAX_BYTES)
      ) {
        throw new Error('remote media response is larger than the native playback cache limit')
      }

      const extension = resolveRemoteAudioCacheExtension(remoteUrl, contentType)
      const requiresCompleteCache = this.requiresCompleteRemoteCacheBeforePlayback(extension)
      if (!this.isRemoteAudioCacheExtensionEnabled(extension)) {
        await response.body?.cancel().catch(() => {})
        throw new Error(
          `remote media resolved to ${extension}, but the helper did not report support for that codec`
        )
      }

      const hash = createHash('sha256').update(remoteUrl).digest('hex').slice(0, 16)
      cachedPath = join(this.cacheDir, `${Date.now()}-${requestId}-${hash}${extension}`)
      this.nativePlaybackDownload = {
        state: 'downloading',
        bytesReceived: 0,
        totalBytes,
        rangeSupported,
        strategy
      }
      this.publishStatus(this.createStatusFromLastStatus('native'))
      const bytesReceived = await this.writeRemoteMediaResponseToCache({
        response,
        cachedPath,
        requestId,
        totalBytes,
        rangeSupported,
        strategy,
        abortSignal: abortController.signal,
        append: false,
        bytesReceived: 0
      })

      if (contentRange && bytesReceived !== contentRange.end + 1) {
        throw new Error('remote media range response body size did not match content-range')
      }

      this.remotePlaybackCacheFiles.add(cachedPath)

      if (
        response.status === 206 &&
        contentRange?.totalBytes !== undefined &&
        bytesReceived < contentRange.totalBytes
      ) {
        if (requiresCompleteCache) {
          const completedBytesReceived = await this.cacheRemainingRemoteMediaRanges({
            remoteUrl,
            cachedPath,
            requestId,
            totalBytes: contentRange.totalBytes,
            bytesReceived,
            strategy,
            abortSignal: abortController.signal,
            requestHeaders
          })

          return {
            cachedPath,
            bytesReceived: completedBytesReceived,
            totalBytes: contentRange.totalBytes,
            rangeSupported,
            strategy,
            complete: true
          }
        }

        continueCachingInBackground = true
        this.cacheRemainingRemoteMediaRangesInBackground({
          remoteUrl,
          cachedPath,
          requestId,
          totalBytes: contentRange.totalBytes,
          bytesReceived,
          strategy,
          abortController,
          requestHeaders
        })

        return {
          cachedPath,
          bytesReceived,
          totalBytes: contentRange.totalBytes,
          rangeSupported,
          strategy,
          complete: false,
          growingExpectedBytes: contentRange.totalBytes
        }
      }

      return {
        cachedPath,
        bytesReceived,
        totalBytes,
        rangeSupported,
        strategy,
        complete: true
      }
    } catch (error) {
      if (cachedPath) {
        this.remotePlaybackCacheFiles.delete(cachedPath)
        await removeRemotePlaybackCacheFile(cachedPath).catch(() => {})
      }
      throw error
    } finally {
      if (!continueCachingInBackground && this.remotePlaybackAbortController === abortController) {
        this.remotePlaybackAbortController = null
      }
    }
  }

  private async cacheRemoteMediaAsSingleResponse(
    remoteUrl: string,
    requestId: number,
    abortController: AbortController,
    requestHeaders?: Record<string, string>
  ): Promise<RemoteMediaCacheResult> {
    let cachedPath: string | null = null
    const response = await this.fetchRemoteMedia(
      remoteUrl,
      createRemoteMediaFetchInit(remoteUrl, abortController.signal, requestHeaders)
    )
    try {
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        throw new RemoteMediaHttpStatusError('remote media request', response.status)
      }

      const contentType = response.headers.get('content-type')
      if (isRejectedRemoteMediaContentType(contentType)) {
        await response.body?.cancel().catch(() => {})
        throw new Error(`remote media response content type is not audio: ${contentType}`)
      }

      const contentLength = parseHeaderByteSize(response.headers.get('content-length'))
      if (typeof contentLength === 'number' && contentLength > REMOTE_AUDIO_CACHE_MAX_BYTES) {
        await response.body?.cancel().catch(() => {})
        throw new Error('remote media response is larger than the native playback cache limit')
      }

      const extension = resolveRemoteAudioCacheExtension(remoteUrl, contentType)
      if (!this.isRemoteAudioCacheExtensionEnabled(extension)) {
        await response.body?.cancel().catch(() => {})
        throw new Error(
          `remote media resolved to ${extension}, but the helper did not report support for that codec`
        )
      }

      const hash = createHash('sha256').update(remoteUrl).digest('hex').slice(0, 16)
      cachedPath = join(this.cacheDir, `${Date.now()}-${requestId}-${hash}${extension}`)
      this.nativePlaybackDownload = {
        state: 'downloading',
        bytesReceived: 0,
        totalBytes: contentLength,
        rangeSupported: false,
        strategy: 'single-response'
      }
      this.publishStatus(this.createStatusFromLastStatus('native'))
      const bytesReceived = await this.writeRemoteMediaResponseToCache({
        response,
        cachedPath,
        requestId,
        totalBytes: contentLength,
        rangeSupported: false,
        strategy: 'single-response',
        abortSignal: abortController.signal,
        append: false,
        bytesReceived: 0
      })

      this.remotePlaybackCacheFiles.add(cachedPath)
      return {
        cachedPath,
        bytesReceived,
        totalBytes: contentLength,
        rangeSupported: false,
        strategy: 'single-response',
        complete: true
      }
    } catch (error) {
      if (cachedPath) {
        this.remotePlaybackCacheFiles.delete(cachedPath)
        await removeRemotePlaybackCacheFile(cachedPath).catch(() => {})
      }
      throw error
    }
  }

  private cacheRemainingRemoteMediaRangesInBackground({
    remoteUrl,
    cachedPath,
    requestId,
    totalBytes,
    bytesReceived,
    strategy,
    abortController,
    requestHeaders
  }: {
    remoteUrl: string
    cachedPath: string
    requestId: number
    totalBytes: number
    bytesReceived: number
    strategy: AudioOutputNativePlaybackDownloadStrategy
    abortController: AbortController
    requestHeaders?: Record<string, string>
  }): void {
    void this.cacheRemainingRemoteMediaRanges({
      remoteUrl,
      cachedPath,
      requestId,
      totalBytes,
      bytesReceived,
      strategy,
      abortSignal: abortController.signal,
      requestHeaders
    })
      .then(finalBytesReceived => {
        if (requestId !== this.playbackRequestId || this.nativePlaybackHelperPath !== cachedPath) {
          return
        }

        this.nativePlaybackDownload = {
          state: 'cached',
          bytesReceived: finalBytesReceived,
          totalBytes,
          rangeSupported: true,
          strategy
        }
        this.reason = 'Native audio output remote media cache completed.'
        this.publishStatus(this.createStatusFromLastStatus('native'))
      })
      .catch(error => {
        if (requestId !== this.playbackRequestId || this.nativePlaybackHelperPath !== cachedPath) {
          return
        }

        this.nativePlaybackRunning = false
        this.nativePlaybackPaused = false
        this.nativePlaybackHelperPath = null
        this.nativePlaybackToken = null
        this.clearNativePlaybackSession()
        this.nativePlaybackState = 'error'
        this.nativePlaybackPositionSeconds = null
        this.nativePlaybackDownload = null
        this.nativePlaybackError = createNativePlaybackRemoteError(error)
        this.reason = this.nativePlaybackError
          ? createNativePlaybackErrorReason(this.nativePlaybackError)
          : `Failed to finish remote media cache for native audio output: ${formatError(error)}`
        this.logger.warn(
          '[AudioOutput] Failed to finish remote media cache for native playback',
          error
        )
        this.sendCommand({ type: 'stopPlayback' })
        void this.deleteCachedRemoteFile(cachedPath)
        this.publishStatus(this.createStatusFromLastStatus('unavailable'))
      })
      .finally(() => {
        if (this.remotePlaybackAbortController === abortController) {
          this.remotePlaybackAbortController = null
        }
      })
  }

  private requiresCompleteRemoteCacheBeforePlayback(extension: string): boolean {
    return (
      this.settings.bitPerfectRequired === true ||
      this.settings.mode === 'exclusive' ||
      this.settings.mode === 'voicemeeter' ||
      COMPLETE_CACHE_BEFORE_PLAYBACK_EXTENSIONS.has(extension)
    )
  }

  private async writeRemoteMediaResponseToCache({
    response,
    cachedPath,
    requestId,
    totalBytes,
    rangeSupported,
    strategy,
    abortSignal,
    append,
    bytesReceived
  }: {
    response: Response
    cachedPath: string
    requestId: number
    totalBytes?: number
    rangeSupported: boolean
    strategy: AudioOutputNativePlaybackDownloadStrategy
    abortSignal: AbortSignal
    append: boolean
    bytesReceived: number
  }): Promise<number> {
    if (!response.body) {
      throw new Error('remote media response did not include a body')
    }

    let currentBytesReceived = bytesReceived
    const byteLimit = createByteLimitTransform(
      REMOTE_AUDIO_CACHE_MAX_BYTES,
      nextBytesReceived => {
        currentBytesReceived = nextBytesReceived
        if (requestId !== this.playbackRequestId) {
          return
        }

        this.nativePlaybackDownload = {
          state: 'downloading',
          bytesReceived: nextBytesReceived,
          totalBytes,
          rangeSupported,
          strategy
        }
        this.publishStatus(this.createStatusFromLastStatus('native'))
      },
      bytesReceived
    )

    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
      byteLimit,
      createWriteStream(cachedPath, { flags: append ? 'a' : 'w' }),
      { signal: abortSignal }
    )

    return currentBytesReceived
  }

  private async cacheRemainingRemoteMediaRanges({
    remoteUrl,
    cachedPath,
    requestId,
    totalBytes,
    bytesReceived,
    strategy,
    abortSignal,
    requestHeaders
  }: {
    remoteUrl: string
    cachedPath: string
    requestId: number
    totalBytes: number
    bytesReceived: number
    strategy: AudioOutputNativePlaybackDownloadStrategy
    abortSignal: AbortSignal
    requestHeaders?: Record<string, string>
  }): Promise<number> {
    let currentBytesReceived = bytesReceived

    while (currentBytesReceived < totalBytes) {
      if (requestId !== this.playbackRequestId) {
        throw new Error('remote media cache request was superseded')
      }

      const rangeStart = currentBytesReceived
      const rangeEnd = Math.min(totalBytes - 1, rangeStart + this.remoteRangeChunkBytes - 1)
      const response = await this.fetchRemoteMedia(
        remoteUrl,
        createRemoteMediaRangeFetchInit(
          remoteUrl,
          rangeStart,
          rangeEnd,
          abortSignal,
          requestHeaders
        )
      )
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        throw new RemoteMediaHttpStatusError('remote media range request', response.status)
      }

      const contentType = response.headers.get('content-type')
      if (isRejectedRemoteMediaContentType(contentType)) {
        await response.body?.cancel().catch(() => {})
        throw new Error(`remote media range response content type is not audio: ${contentType}`)
      }

      const contentRange = parseContentRange(response.headers.get('content-range'))
      if (
        response.status !== 206 ||
        !contentRange ||
        contentRange.start !== rangeStart ||
        contentRange.end > rangeEnd ||
        contentRange.totalBytes !== totalBytes
      ) {
        throw new Error('remote media range response did not match the requested chunk')
      }

      const previousBytesReceived = currentBytesReceived
      currentBytesReceived = await this.writeRemoteMediaResponseToCache({
        response,
        cachedPath,
        requestId,
        totalBytes,
        rangeSupported: true,
        strategy,
        abortSignal,
        append: true,
        bytesReceived: currentBytesReceived
      })

      if (
        currentBytesReceived !== contentRange.end + 1 ||
        currentBytesReceived <= previousBytesReceived
      ) {
        throw new Error('remote media range response body size did not match content-range')
      }
    }

    return currentBytesReceived
  }

  private cancelRemotePlaybackDownload(): void {
    this.remotePlaybackAbortController?.abort()
    this.remotePlaybackAbortController = null
  }

  private shouldWaitForVoicemeeterRouteBeforePlayback(): boolean {
    return (
      this.settings.mode === 'voicemeeter' &&
      !this.isVoicemeeterRouteReadyForPlayback(this.lastStatus)
    )
  }

  private async waitForVoicemeeterRouteBeforePlayback(requestId: number): Promise<boolean> {
    if (!this.shouldWaitForVoicemeeterRouteBeforePlayback()) {
      return true
    }

    this.reason = 'Native audio output is waiting for Voicemeeter route before playback.'
    this.publishStatus(this.createStatusFromLastStatus('native'))

    try {
      await this.waitForVoicemeeterRouteReady()
    } catch (error) {
      if (requestId === this.playbackRequestId) {
        this.failPendingPlaybackForVoicemeeterRoute(error)
      }
      return false
    }

    return requestId === this.playbackRequestId && this.enabled && Boolean(this.helper)
  }

  private waitForVoicemeeterRouteReady(): Promise<void> {
    if (this.isVoicemeeterRouteReadyForPlayback(this.lastStatus)) {
      return Promise.resolve()
    }

    if (!this.helper || !this.enabled) {
      return Promise.reject(new Error('Native audio output helper is not running.'))
    }

    return new Promise((resolve, reject) => {
      const waiter: VoicemeeterRouteReadyWaiter = {
        resolve: () => {
          clearTimeout(waiter.timer)
          this.voicemeeterRouteReadyWaiters.delete(waiter)
          resolve()
        },
        reject: error => {
          clearTimeout(waiter.timer)
          this.voicemeeterRouteReadyWaiters.delete(waiter)
          reject(error)
        },
        timer: setTimeout(() => {
          waiter.reject(
            new Error('Timed out waiting for Voicemeeter route to be ready before playback.')
          )
        }, VOICEMEETER_ROUTE_READY_TIMEOUT_MS)
      }
      waiter.timer.unref?.()
      this.voicemeeterRouteReadyWaiters.add(waiter)
    })
  }

  private resolveVoicemeeterRouteReadyWaiters(status: AudioOutputStatus): void {
    if (
      this.voicemeeterRouteReadyWaiters.size === 0 ||
      !this.isVoicemeeterRouteReadyForPlayback(status)
    ) {
      return
    }

    for (const waiter of this.voicemeeterRouteReadyWaiters) {
      waiter.resolve()
    }
  }

  private rejectVoicemeeterRouteReadyWaiters(error: Error): void {
    if (this.voicemeeterRouteReadyWaiters.size === 0) {
      return
    }

    for (const waiter of this.voicemeeterRouteReadyWaiters) {
      waiter.reject(error)
    }
  }

  private isVoicemeeterRouteReadyForPlayback(status: AudioOutputStatus | null): boolean {
    const remote = status?.voicemeeterRemote
    if (
      this.settings.mode !== 'voicemeeter' ||
      status?.requestedMode !== 'voicemeeter' ||
      status.activeMode !== 'voicemeeter' ||
      remote?.available !== true ||
      remote.connected !== true ||
      remote.routeApplied !== true ||
      remote.routeManaged !== true ||
      remote.routeBus !== this.settings.voicemeeterBus
    ) {
      return false
    }

    const hardwareOutDevice = this.settings.voicemeeterHardwareOutDevice?.trim()
    if (!hardwareOutDevice) {
      return true
    }

    return (
      remote.hardwareOutApplied === true &&
      remote.hardwareOutBus === this.settings.voicemeeterHardwareOutBus &&
      remote.hardwareOutDriver === this.settings.voicemeeterHardwareOutDriver &&
      remote.hardwareOutDevice?.trim() === hardwareOutDevice
    )
  }

  private failPendingPlaybackForVoicemeeterRoute(error: unknown): void {
    this.sendCommand({ type: 'stopPlayback' })
    this.nativePlaybackRunning = false
    this.nativePlaybackPaused = false
    this.nativePlaybackHelperPath = null
    this.nativePlaybackToken = null
    this.clearNativePlaybackSession()
    this.nativePlaybackState = 'error'
    this.nativePlaybackPositionSeconds = null
    this.nativePlaybackDownload = null
    this.nativePlaybackError = null
    this.reason = `Voicemeeter route was not ready before native playback: ${formatError(error)}`
    this.publishStatus(this.createStatusFromLastStatus('unavailable'))
    void this.cleanupRemotePlaybackCache()
  }

  private resetNativePlaybackStateForSettingsChange(): Promise<void> | null {
    const hadNativePlayback =
      this.nativePlaybackRunning ||
      this.nativePlaybackPaused ||
      this.nativePlaybackSource !== null ||
      this.nativePlaybackState === 'starting' ||
      this.nativePlaybackState === 'playing' ||
      this.nativePlaybackState === 'paused'

    const shouldWait = this.shouldWaitForHelperPlaybackStop()
    const settled = shouldWait ? this.waitForHelperPlaybackStop() : null
    this.playbackRequestId += 1
    this.cancelRemotePlaybackDownload()
    this.nativePlaybackRunning = false
    this.nativePlaybackPaused = false
    this.nativePlaybackSource = null
    this.nativePlaybackHelperPath = null
    this.nativePlaybackToken = null
    this.clearNativePlaybackSession()
    this.nativePlaybackState = 'stopped'
    this.nativePlaybackPositionSeconds = null
    this.nativePlaybackDownload = null
    this.nativePlaybackError = null
    this.terminalPlaybackReleaseKey = null
    this.rejectVoicemeeterRouteReadyWaiters(
      new Error('Native audio output settings changed before Voicemeeter route became ready.')
    )
    if (hadNativePlayback) {
      this.reason = 'Native audio output playback stopped because output settings changed.'
    }
    this.sendCommand({ type: 'stopPlayback' })
    void this.cleanupRemotePlaybackCache()
    if (!settled) {
      return null
    }

    const settingsChangeStopSettle = settled.finally(() => {
      if (this.settingsChangeStopSettle === settingsChangeStopSettle) {
        this.settingsChangeStopSettle = null
      }
    })
    this.settingsChangeStopSettle = settingsChangeStopSettle
    return settingsChangeStopSettle
  }

  private async configureAfterSettingsChangeStopSettled(
    settled: Promise<void>,
    requestId: number
  ): Promise<AudioOutputStatus> {
    this.publishStatus(this.createStatus('unavailable'))
    const configureSettle = this.runConfigureAfterSettingsChangeStopSettled(settled, requestId)
    this.settingsChangeConfigureSettle = configureSettle
    void configureSettle
      .finally(() => {
        if (this.settingsChangeConfigureSettle === configureSettle) {
          this.settingsChangeConfigureSettle = null
        }
      })
      .catch(() => {})
    return configureSettle
  }

  private async runConfigureAfterSettingsChangeStopSettled(
    settled: Promise<void>,
    requestId: number
  ): Promise<AudioOutputStatus> {
    await settled
    if (requestId !== this.settingsChangeConfigureRequestId) {
      return this.getStatus()
    }

    this.sendConfigure()
    return this.publishStatus(this.createStatus('unavailable'))
  }

  private getPendingSettingsChangeSettle(): Promise<unknown> | null {
    return this.settingsChangeConfigureSettle ?? this.settingsChangeStopSettle
  }

  private async waitForPendingSettingsChangeSettle(): Promise<void> {
    let pendingSettingsChange = this.getPendingSettingsChangeSettle()
    while (pendingSettingsChange) {
      await pendingSettingsChange.catch(() => {})
      pendingSettingsChange = this.getPendingSettingsChangeSettle()
    }
  }

  private isRemoteAudioCacheExtensionEnabled(extension: string): boolean {
    const normalizedExtension = extension.toLocaleLowerCase()
    if (!OPTIONAL_HELPER_AUDIO_CACHE_EXTENSIONS.has(normalizedExtension)) {
      return true
    }

    return Boolean(
      this.lastStatus?.supportedExtensions?.some(
        supportedExtension => supportedExtension.toLocaleLowerCase() === normalizedExtension
      )
    )
  }

  private resolveVisiblePlaybackSource(helperSource: string | null | undefined): string | null {
    if (!helperSource) {
      return null
    }

    if (this.nativePlaybackHelperPath === helperSource && this.nativePlaybackSource) {
      return this.nativePlaybackSource
    }

    return helperSource
  }

  private isStaleHelperPlaybackSource(helperSource: string | null | undefined): boolean {
    if (helperSource && this.isPreparingRemotePlaybackWithoutHelperPath()) {
      return true
    }

    if (!helperSource || !this.nativePlaybackHelperPath) {
      return false
    }

    return helperSource !== this.nativePlaybackHelperPath
  }

  private isPreparingRemotePlaybackWithoutHelperPath(): boolean {
    return Boolean(
      this.nativePlaybackState === 'starting' &&
      this.nativePlaybackSource &&
      !this.nativePlaybackHelperPath &&
      resolveRemoteAudioSourceUrl(this.nativePlaybackSource)
    )
  }

  private shouldIgnoreSourceLessPreStartStop(
    helperSource: string | null | undefined,
    state: NonNullable<AudioOutputStatus['nativePlaybackState']>
  ): boolean {
    return (
      !helperSource &&
      this.nativePlaybackState === 'starting' &&
      (state === 'stopped' || state === 'idle')
    )
  }

  private shouldIgnoreSourceLessStopAfterError(
    helperSource: string | null | undefined,
    helperToken: string | null | undefined,
    state: NonNullable<AudioOutputStatus['nativePlaybackState']>
  ): boolean {
    return (
      !helperSource &&
      !helperToken &&
      this.nativePlaybackState === 'error' &&
      (state === 'stopped' || state === 'idle')
    )
  }

  private shouldIgnorePlaybackUpdateAfterStop(
    helperSource: string | null | undefined,
    state: NonNullable<AudioOutputStatus['nativePlaybackState']>
  ): boolean {
    const stoppedLocally =
      !this.nativePlaybackSource &&
      !this.nativePlaybackHelperPath &&
      this.nativePlaybackState === 'stopped'
    if (!stoppedLocally) {
      return false
    }

    if (state === 'starting' || state === 'playing' || state === 'paused') {
      return true
    }

    if (state === 'stopped' || state === 'idle' || state === 'error' || state === 'ended') {
      const hasPendingStopWaiter = this.playbackStopWaiters.size > 0
      if (hasPendingStopWaiter) {
        this.resolvePlaybackStopWaitersForState(state, false)
        return true
      }

      return Boolean(helperSource)
    }

    return false
  }

  private shouldIgnoreHelperStatusPlaybackUpdate(helperStatus: AudioOutputStatus): boolean {
    return (
      this.shouldIgnorePlaybackUpdateAfterStop(
        helperStatus.nativePlaybackSource,
        helperStatus.nativePlaybackState ?? 'idle'
      ) ||
      this.isStaleHelperPlaybackToken(helperStatus.nativePlaybackToken) ||
      this.isStaleHelperPlaybackSource(helperStatus.nativePlaybackSource) ||
      this.shouldIgnoreSourceLessStopAfterError(
        helperStatus.nativePlaybackSource,
        helperStatus.nativePlaybackToken,
        helperStatus.nativePlaybackState ?? 'idle'
      ) ||
      this.shouldIgnoreSourceLessPreStartStop(
        helperStatus.nativePlaybackSource,
        helperStatus.nativePlaybackState ?? 'idle'
      )
    )
  }

  private publishHelperStatusWithoutPlaybackUpdateIfNeeded(helperStatus: AudioOutputStatus): void {
    if (
      this.settings.mode !== 'voicemeeter' ||
      helperStatus.requestedMode !== 'voicemeeter' ||
      !helperStatus.voicemeeterRemote ||
      this.nativePlaybackState === 'error'
    ) {
      return
    }

    this.testToneRunning = false
    this.reason = helperStatus.reason ?? this.reason
    this.lastStatus = {
      ...helperStatus,
      helperPath: this.helperPath ?? undefined,
      helperRunning: Boolean(this.helper),
      testToneRunning: this.testToneRunning,
      nativePlaybackRunning: this.nativePlaybackRunning,
      nativePlaybackPaused: this.nativePlaybackPaused,
      nativePlaybackSource: this.nativePlaybackSource ?? undefined,
      nativePlaybackState: this.nativePlaybackState,
      nativePlaybackPositionSeconds: this.nativePlaybackPositionSeconds ?? undefined,
      nativePlaybackToken: this.nativePlaybackToken ?? undefined,
      nativePlaybackDownload: this.nativePlaybackDownload ?? undefined,
      nativePlaybackError: this.nativePlaybackError ?? undefined
    }
    this.resolveVoicemeeterRouteReadyWaiters(this.lastStatus)
    this.publishStatus(this.lastStatus)
  }

  private isStaleHelperPlaybackToken(helperToken: string | null | undefined): boolean {
    if (!helperToken) {
      return false
    }

    return helperToken !== this.nativePlaybackToken
  }

  private cleanupCacheAfterTerminalPlaybackState(
    helperSource: string | null | undefined,
    state: NonNullable<AudioOutputStatus['nativePlaybackState']>,
    helperToken?: string | null
  ): void {
    if (state !== 'ended' && state !== 'stopped' && state !== 'error') {
      return
    }

    if (helperSource && this.remotePlaybackCacheFiles.has(helperSource)) {
      this.cancelRemotePlaybackDownload()
      void this.deleteCachedRemoteFile(helperSource)
    }

    if (this.nativePlaybackHelperPath === helperSource) {
      this.nativePlaybackHelperPath = null
    }

    if (helperToken && helperToken === this.nativePlaybackToken) {
      this.nativePlaybackToken = null
    }
    if (!helperToken || helperToken === this.nativePlaybackSession?.token) {
      this.clearNativePlaybackSession()
    }

    this.nativePlaybackDownload = null
    this.nativePlaybackPositionSeconds = null
  }

  private releaseNativeModeAfterTerminalPlayback(
    helperSource: string | null | undefined,
    state: NonNullable<AudioOutputStatus['nativePlaybackState']>,
    helperToken?: string | null
  ): void {
    if (state !== 'ended' && state !== 'error') {
      return
    }

    if (
      helperSource &&
      this.nativePlaybackHelperPath &&
      helperSource !== this.nativePlaybackHelperPath
    ) {
      return
    }

    const releaseKey = `${state}:${helperToken ?? ''}:${helperSource ?? ''}`
    if (this.terminalPlaybackReleaseKey === releaseKey) {
      return
    }

    this.terminalPlaybackReleaseKey = releaseKey
    this.sendCommand({
      type: this.settings.mode === 'voicemeeter' ? 'stopPlaybackOnly' : 'stopPlayback'
    })
  }

  private async deleteCachedRemoteFile(filePath: string): Promise<void> {
    await removeRemotePlaybackCacheFile(filePath)
      .then(() => {
        this.remotePlaybackCacheFiles.delete(filePath)
      })
      .catch(() => {})
  }

  private async cleanupRemotePlaybackCache(): Promise<void> {
    const cachedFiles = [...this.remotePlaybackCacheFiles]
    await Promise.all(cachedFiles.map(filePath => this.deleteCachedRemoteFile(filePath)))
  }

  private async cleanupUntrackedRemotePlaybackCacheFiles(): Promise<void> {
    const entries = await readdir(this.cacheDir, { withFileTypes: true }).catch(() => [])
    await Promise.all(
      entries
        .filter(entry => entry.isFile())
        .map(entry => join(this.cacheDir, entry.name))
        .filter(filePath => !this.remotePlaybackCacheFiles.has(filePath))
        .map(filePath => removeRemotePlaybackCacheFile(filePath).catch(() => {}))
    )
  }

  private ensureHelper(helperPath: string): void {
    if (this.helper) {
      return
    }

    this.helperPath = helperPath
    const helper = this.spawnHelper(helperPath, [], {
      env: process.env,
      stdio: 'pipe',
      windowsHide: this.platform === 'win32'
    })
    this.helper = helper

    helper.stdout.setEncoding('utf8')
    helper.stderr.setEncoding('utf8')

    helper.stdout.on('data', chunk => this.handleStdout(String(chunk)))
    helper.stderr.on('data', chunk => {
      const message = String(chunk).trim()
      if (message) {
        this.logger.warn(`[AudioOutput] ${message}`)
      }
    })
    helper.stdin.on('error', error => {
      this.logger.warn('[AudioOutput] Helper stdin error', error)
    })
    helper.on('error', error => {
      this.reason = `Rust audio output helper error: ${formatError(error)}`
      this.logger.warn('[AudioOutput] Helper process error', error)
      this.helper = null
      this.lastStatus = null
      this.nativePlaybackRunning = false
      this.nativePlaybackPaused = false
      this.nativePlaybackSource = null
      this.nativePlaybackHelperPath = null
      this.nativePlaybackToken = null
      this.clearNativePlaybackSession()
      this.nativePlaybackState = 'error'
      this.nativePlaybackPositionSeconds = null
      this.nativePlaybackDownload = null
      this.nativePlaybackError = null
      this.resolvePlaybackStopWaiters()
      this.rejectVoicemeeterRouteReadyWaiters(
        new Error('Native audio output helper errored before Voicemeeter route became ready.')
      )
      void this.cleanupRemotePlaybackCache()
      this.publishStatus(this.createStatus('unavailable'))
    })
    helper.on('exit', (code, signal) => {
      if (this.enabled) {
        this.reason = `Rust audio output helper exited with code ${String(code)} signal ${String(
          signal
        )}.`
        this.logger.warn(`[AudioOutput] ${this.reason}`)
      }
      this.helper = null
      this.lastStatus = null
      this.nativePlaybackRunning = false
      this.nativePlaybackPaused = false
      this.nativePlaybackSource = null
      this.nativePlaybackHelperPath = null
      this.nativePlaybackToken = null
      this.clearNativePlaybackSession()
      this.nativePlaybackState = 'error'
      this.nativePlaybackPositionSeconds = null
      this.nativePlaybackDownload = null
      this.nativePlaybackError = null
      this.resolvePlaybackStopWaiters()
      this.rejectVoicemeeterRouteReadyWaiters(
        new Error('Native audio output helper exited before Voicemeeter route became ready.')
      )
      void this.cleanupRemotePlaybackCache()
      if (this.enabled) {
        this.publishStatus(this.createStatus('unavailable'))
      }
    })
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    const lines = this.stdoutBuffer.split(/\r?\n/)
    this.stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const event = parseAudioOutputEventLine(line)
      if (event) {
        this.handleHelperEvent(event)
      }
    }
  }

  private handleHelperEvent(event: AudioOutputEvent): void {
    switch (event.type) {
      case 'ready':
        this.supportedExtensions = event.payload.supportedExtensions ?? this.supportedExtensions
        this.helperSupportedModes = event.payload.supportedModes ?? this.helperSupportedModes
        this.logger.info('[AudioOutput] Helper ready')
        break
      case 'devices':
        this.devices = event.payload.devices
        this.publishStatus(this.createStatusFromLastStatus('unavailable'))
        break
      case 'status': {
        if (this.isStaleHelperStatusMode(event.payload)) {
          this.devices = event.payload.devices
          this.resolvePlaybackStopWaitersForState(
            event.payload.nativePlaybackState ?? 'idle',
            event.payload.nativePlaybackRunning
          )
          break
        }

        const helperStatus = this.createStatusFromHelperStatus(event.payload)
        this.resolveVoicemeeterRouteReadyWaiters(helperStatus)
        if (this.shouldIgnoreHelperStatusPlaybackUpdate(helperStatus)) {
          this.devices = helperStatus.devices
          this.publishHelperStatusWithoutPlaybackUpdateIfNeeded(helperStatus)
          break
        }

        this.testToneRunning = false
        this.reason = helperStatus.reason ?? null
        this.devices = helperStatus.devices
        const statusPlaybackSource = this.resolveVisiblePlaybackSource(
          helperStatus.nativePlaybackSource
        )
        this.nativePlaybackRunning =
          helperStatus.nativePlaybackRunning ?? this.nativePlaybackRunning
        this.nativePlaybackPaused = helperStatus.nativePlaybackPaused ?? this.nativePlaybackPaused
        this.nativePlaybackSource = statusPlaybackSource ?? this.nativePlaybackSource
        this.nativePlaybackState = helperStatus.nativePlaybackState ?? this.nativePlaybackState
        this.nativePlaybackPositionSeconds =
          helperStatus.nativePlaybackPositionSeconds ?? this.nativePlaybackPositionSeconds
        this.nativePlaybackError = helperStatus.nativePlaybackError ?? null
        this.nativePlaybackToken = helperStatus.nativePlaybackToken ?? this.nativePlaybackToken
        this.releaseNativeModeAfterTerminalPlayback(
          helperStatus.nativePlaybackSource,
          this.nativePlaybackState,
          helperStatus.nativePlaybackToken
        )
        this.resolvePlaybackStopWaitersForState(
          this.nativePlaybackState,
          this.nativePlaybackRunning
        )
        this.cleanupCacheAfterTerminalPlaybackState(
          helperStatus.nativePlaybackSource,
          this.nativePlaybackState,
          helperStatus.nativePlaybackToken
        )
        this.lastStatus = {
          ...helperStatus,
          helperPath: this.helperPath ?? undefined,
          helperRunning: Boolean(this.helper),
          testToneRunning: this.testToneRunning,
          nativePlaybackRunning: this.nativePlaybackRunning,
          nativePlaybackPaused: this.nativePlaybackPaused,
          nativePlaybackSource: this.nativePlaybackSource ?? undefined,
          nativePlaybackState: this.nativePlaybackState,
          nativePlaybackPositionSeconds: this.nativePlaybackPositionSeconds ?? undefined,
          nativePlaybackToken: this.nativePlaybackToken ?? undefined,
          nativePlaybackDownload: this.nativePlaybackDownload ?? undefined,
          nativePlaybackError: this.nativePlaybackError ?? undefined
        }
        this.resolveVoicemeeterRouteReadyWaiters(this.lastStatus)
        this.publishStatus(this.lastStatus)
        break
      }
      case 'playback': {
        const helperPlaybackSource = event.payload.source ?? null
        const helperPlaybackToken = event.payload.playbackToken ?? null
        if (
          this.shouldIgnorePlaybackUpdateAfterStop(helperPlaybackSource, event.payload.state) ||
          this.isStaleHelperPlaybackToken(helperPlaybackToken) ||
          this.isStaleHelperPlaybackSource(helperPlaybackSource) ||
          this.shouldIgnoreSourceLessStopAfterError(
            helperPlaybackSource,
            helperPlaybackToken,
            event.payload.state
          ) ||
          this.shouldIgnoreSourceLessPreStartStop(helperPlaybackSource, event.payload.state)
        ) {
          break
        }

        this.nativePlaybackRunning = event.payload.running
        this.nativePlaybackPaused = Boolean(event.payload.paused)
        this.nativePlaybackSource = this.resolveVisiblePlaybackSource(helperPlaybackSource)
        this.nativePlaybackState = event.payload.state
        this.nativePlaybackPositionSeconds =
          typeof event.payload.positionSeconds === 'number' ? event.payload.positionSeconds : null
        this.nativePlaybackToken = helperPlaybackToken ?? this.nativePlaybackToken
        this.nativePlaybackError =
          event.payload.nativePlaybackError ??
          createNativePlaybackErrorFromReason(event.payload.state, event.payload.reason)
        this.reason = event.payload.reason ?? this.reason
        this.releaseNativeModeAfterTerminalPlayback(
          helperPlaybackSource,
          event.payload.state,
          helperPlaybackToken
        )
        this.resolvePlaybackStopWaitersForState(event.payload.state, event.payload.running)
        this.cleanupCacheAfterTerminalPlaybackState(
          helperPlaybackSource,
          event.payload.state,
          helperPlaybackToken
        )
        this.publishStatus(this.createStatusFromLastStatus('native'))
        break
      }
      case 'log':
        this.logger[event.level]?.(`[AudioOutput] ${event.message}`)
        break
      case 'error':
        this.testToneRunning = false
        this.nativePlaybackRunning = false
        this.nativePlaybackPaused = false
        this.nativePlaybackSource = null
        this.nativePlaybackHelperPath = null
        this.nativePlaybackToken = null
        this.clearNativePlaybackSession()
        this.nativePlaybackState = 'error'
        this.nativePlaybackPositionSeconds = null
        this.nativePlaybackDownload = null
        this.nativePlaybackError = null
        this.reason = event.message
        this.lastStatus = null
        this.resolvePlaybackStopWaiters()
        void this.cleanupRemotePlaybackCache()
        this.publishStatus(this.createStatus('unavailable'))
        break
    }
  }

  private sendConfigure(): void {
    this.sendCommand({
      type: 'configure',
      payload: {
        enabled: this.enabled,
        settings: this.settings
      }
    })
  }

  private sendPrePlaybackStopCommand(): void {
    this.sendCommand({
      type: this.settings.mode === 'voicemeeter' ? 'stopPlaybackOnly' : 'stopPlayback'
    })
  }

  private createStatusFromHelperStatus(status: AudioOutputHelperStatus): AudioOutputStatus {
    return {
      ...status,
      settings: { ...this.settings }
    }
  }

  private isStaleHelperStatusMode(status: AudioOutputHelperStatus): boolean {
    return status.requestedMode !== this.settings.mode
  }

  private sendCommand(command: AudioOutputCommand): void {
    if (!this.helper || this.helper.killed || this.helper.stdin.destroyed) {
      return
    }

    this.helper.stdin.write(serializeAudioOutputCommand(command))
  }

  private stopHelper(): void {
    const helper = this.helper
    this.helper = null
    this.stdoutBuffer = ''
    this.lastStatus = null
    this.testToneRunning = false
    this.nativePlaybackRunning = false
    this.nativePlaybackPaused = false
    this.nativePlaybackSource = null
    this.nativePlaybackHelperPath = null
    this.nativePlaybackToken = null
    this.clearNativePlaybackSession()
    this.nativePlaybackState = 'idle'
    this.nativePlaybackPositionSeconds = null
    this.nativePlaybackDownload = null
    this.nativePlaybackError = null
    void this.cleanupRemotePlaybackCache()

    if (!helper || helper.killed) {
      return
    }

    helper.kill()
  }

  private shouldWaitForHelperPlaybackStop(): boolean {
    return Boolean(
      this.helper &&
      (this.nativePlaybackRunning ||
        this.nativePlaybackState === 'starting' ||
        this.nativePlaybackState === 'playing' ||
        this.nativePlaybackState === 'paused')
    )
  }

  private waitForHelperPlaybackStop(): Promise<void> {
    if (!this.helper) {
      return Promise.resolve()
    }

    return new Promise(resolve => {
      let timeout: NodeJS.Timeout | null = null
      const settle = () => {
        if (timeout) {
          clearTimeout(timeout)
        }
        this.playbackStopWaiters.delete(settle)
        resolve()
      }

      this.playbackStopWaiters.add(settle)
      timeout = setTimeout(settle, HELPER_PLAYBACK_STOP_SETTLE_TIMEOUT_MS)
      timeout.unref?.()
    })
  }

  private resolvePlaybackStopWaitersForState(
    state: NonNullable<AudioOutputStatus['nativePlaybackState']>,
    running: boolean | undefined
  ): void {
    if (running) {
      return
    }

    if (state === 'stopped' || state === 'idle' || state === 'error' || state === 'ended') {
      this.resolvePlaybackStopWaiters()
    }
  }

  private resolvePlaybackStopWaiters(): void {
    if (this.playbackStopWaiters.size === 0) {
      return
    }

    for (const settle of this.playbackStopWaiters) {
      settle()
    }
  }

  private stopHelperGracefully(): Promise<void> {
    const helper = this.helper
    this.helper = null
    this.stdoutBuffer = ''
    this.lastStatus = null
    this.testToneRunning = false
    this.nativePlaybackRunning = false
    this.nativePlaybackPaused = false
    this.nativePlaybackSource = null
    this.nativePlaybackHelperPath = null
    this.nativePlaybackToken = null
    this.clearNativePlaybackSession()
    this.nativePlaybackState = 'idle'
    this.nativePlaybackPositionSeconds = null
    this.nativePlaybackDownload = null
    this.nativePlaybackError = null

    if (!helper || helper.killed) {
      return Promise.resolve()
    }

    return new Promise(resolve => {
      let settled = false
      let timeout: NodeJS.Timeout | null = null

      const settle = () => {
        if (settled) {
          return
        }

        settled = true
        if (timeout) {
          clearTimeout(timeout)
        }
        helper.off('exit', settle)
        helper.off('error', settle)
        resolve()
      }

      helper.once('exit', settle)
      helper.once('error', settle)
      timeout = setTimeout(() => {
        if (!helper.killed) {
          helper.kill()
        }
        settle()
      }, HELPER_GRACEFUL_SHUTDOWN_TIMEOUT_MS)

      if (!helper.stdin.destroyed && !helper.stdin.writableEnded) {
        helper.stdin.end()
      }
    })
  }

  private resolveHelperPath(): string | null {
    const helperPath = resolveAudioOutputHelperPath({
      appPath: this.appPath,
      exists: this.exists,
      isPackaged: this.isPackaged,
      platform: this.platform,
      resourcesPath: this.resourcesPath
    })
    this.helperPath = helperPath
    return helperPath
  }

  private publishStatus(status: AudioOutputStatus): AudioOutputStatus {
    const nextStatus = this.withNativePlaybackDetails(status)
    this.onStatusChange(nextStatus)
    return nextStatus
  }
}

function getSupportedAudioOutputModes(platform: NodeJS.Platform): AudioOutputMode[] {
  return platform === 'win32' ? ['shared', 'exclusive', 'voicemeeter'] : ['shared']
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function createNativePlaybackToken(requestId: number): string {
  return `native-playback-${requestId}`
}

function createNativePlaybackSessionId(requestId: number): string {
  return `native-session-${requestId}`
}

function createNativePlaybackDiagnostics(
  status: AudioOutputStatus,
  session?: AudioOutputStatus['nativePlaybackSession']
): AudioOutputStatus['nativePlaybackDiagnostics'] {
  const sourceFormat = status.bitPerfect?.sourceFormat
  const outputFormat = status.bitPerfect?.outputFormat
  if (!session && !status.bitPerfect && !sourceFormat && !outputFormat) {
    return undefined
  }

  const sourceSampleRate = sourceFormat?.sampleRate
  const outputSampleRate = outputFormat?.sampleRate
  const sourceChannels = sourceFormat?.channels
  const outputChannels = outputFormat?.channels
  const sourceBitDepth = sourceFormat?.bitDepth
  const outputBitDepth = outputFormat?.bitDepth

  return {
    requestedMode: session?.requestedMode ?? status.requestedMode,
    activeMode: status.activeMode ?? session?.activeMode,
    sourceFormat,
    outputFormat,
    sourceSampleRate,
    outputSampleRate,
    sampleRateMismatch:
      typeof sourceSampleRate === 'number' && typeof outputSampleRate === 'number'
        ? sourceSampleRate !== outputSampleRate
        : undefined,
    sourceChannels,
    outputChannels,
    channelMismatch:
      typeof sourceChannels === 'number' && typeof outputChannels === 'number'
        ? sourceChannels !== outputChannels
        : undefined,
    bitDepthMismatch:
      typeof sourceBitDepth === 'number' && typeof outputBitDepth === 'number'
        ? sourceBitDepth !== outputBitDepth
        : undefined,
    bitPerfectStatus: status.bitPerfect?.status,
    reason: status.bitPerfect?.reason ?? status.reason
  }
}

function createNativePlaybackRemoteError(error: unknown): NativePlaybackError | null {
  if (error instanceof RemoteMediaHttpStatusError) {
    if (error.status === 401 || error.status === 403 || error.status === 404) {
      return {
        code: 'remote-auth-expired',
        httpStatus: error.status,
        retryable: true
      }
    }

    return {
      code: isTransientRemoteHttpStatus(error.status)
        ? 'remote-network-failed'
        : 'remote-cache-failed',
      httpStatus: error.status,
      nativeMessage: error.message,
      retryable: false
    }
  }

  const message = formatError(error)
  if (isRemoteUnsupportedCodecMessage(message)) {
    return {
      code: 'remote-unsupported-codec',
      nativeMessage: message,
      retryable: false
    }
  }

  if (isRemoteNetworkFailureMessage(message)) {
    return {
      code: 'remote-network-failed',
      nativeMessage: message,
      retryable: false
    }
  }

  if (isRemoteCacheFailureMessage(message)) {
    return {
      code: 'remote-cache-failed',
      nativeMessage: message,
      retryable: false
    }
  }

  return null
}

function createNativePlaybackErrorFromReason(
  state: NonNullable<AudioOutputStatus['nativePlaybackState']>,
  reason: string | undefined
): NativePlaybackError | null {
  if (state !== 'error' || !reason) {
    return null
  }

  if (/\bwasapi\b/i.test(reason) && /\bexclusive\b/i.test(reason)) {
    return {
      code: 'wasapi-exclusive-failed',
      nativeErrorCode: extractNativeAudioErrorCode(reason),
      nativeMessage: reason,
      retryable: false
    }
  }

  if (isNativeDecodeFailureMessage(reason)) {
    return {
      code: 'native-decode-failed',
      nativeErrorCode: extractNativeAudioErrorCode(reason),
      nativeMessage: reason,
      retryable: false
    }
  }

  return {
    code: 'native-playback-failed',
    nativeErrorCode: extractNativeAudioErrorCode(reason),
    nativeMessage: reason,
    retryable: false
  }
}

function extractNativeAudioErrorCode(reason: string): string | undefined {
  return reason
    .split(/[^A-Za-z0-9_x]+/)
    .find(part => part.startsWith('AUDCLNT_E_') || part.startsWith('0x'))
}

function createRemoteAuthExpiredReason(error: NativePlaybackError): string {
  const suffix = typeof error.httpStatus === 'number' ? ` HTTP ${error.httpStatus}.` : '.'
  return `Native audio output remote media authorization expired; refreshing the playback URL is required.${suffix}`
}

function createNativePlaybackErrorReason(error: NativePlaybackError): string {
  if (error.code === 'remote-auth-expired') {
    return createRemoteAuthExpiredReason(error)
  }

  const suffix = error.nativeMessage ? ` ${error.nativeMessage}` : ''
  switch (error.code) {
    case 'remote-network-failed':
      return `Native audio output remote media network failed.${suffix}`.trim()
    case 'remote-cache-failed':
      return `Native audio output remote media cache failed.${suffix}`.trim()
    case 'remote-unsupported-codec':
      return `Native audio output helper does not support the remote media codec.${suffix}`.trim()
    case 'native-decode-failed':
      return `Native audio output failed to decode the source.${suffix}`.trim()
    case 'native-playback-failed':
      return `Native audio output playback failed.${suffix}`.trim()
    case 'wasapi-exclusive-failed':
      return 'Native WASAPI exclusive playback failed.'
  }
}

function isTransientRemoteHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function isRemoteUnsupportedCodecMessage(message: string): boolean {
  return /helper did not report support|unsupported .*codec|resolved to .*but the helper did not report support/i.test(
    message
  )
}

function isRemoteNetworkFailureMessage(message: string): boolean {
  return /fetch failed|network|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|timeout|socket|TLS|certificate/i.test(
    message
  )
}

function isRemoteCacheFailureMessage(message: string): boolean {
  return /remote media|content type|content-range|range response|cache limit|did not include a body|body size|exceeded|larger than|superseded/i.test(
    message
  )
}

function isNativeDecodeFailureMessage(message: string): boolean {
  return /decode|decoder|symphonia|probe audio file|playable audio track|unsupported .*bit depth|APE .*PCM|APE .*audio|Failed to open audio file/i.test(
    message
  )
}

function resolveDefaultRemoteMediaFetch(electronNet?: ElectronNetLike): RemoteMediaFetch {
  if (electronNet?.fetch) {
    return electronNet.fetch.bind(electronNet)
  }

  try {
    const electronModule = require('electron') as { net?: ElectronNetLike } | string
    if (typeof electronModule === 'object' && electronModule?.net?.fetch) {
      return electronModule.net.fetch.bind(electronModule.net)
    }
  } catch {
    // Tests and non-Electron tooling can still use the global fetch fallback.
  }

  return fetch.bind(globalThis)
}

function shouldStopPlaybackForAudioOutputSettingsChange(
  previous: AudioOutputSettings,
  next: AudioOutputSettings
): boolean {
  return (
    previous.mode !== next.mode ||
    previous.deviceId !== next.deviceId ||
    previous.bufferFrames !== next.bufferFrames ||
    previous.fallbackToShared !== next.fallbackToShared ||
    previous.bitPerfectRequired !== next.bitPerfectRequired ||
    previous.voicemeeterBus !== next.voicemeeterBus ||
    previous.voicemeeterHardwareOutBus !== next.voicemeeterHardwareOutBus ||
    previous.voicemeeterHardwareOutDriver !== next.voicemeeterHardwareOutDriver ||
    previous.voicemeeterHardwareOutDevice !== next.voicemeeterHardwareOutDevice
  )
}
