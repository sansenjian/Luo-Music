import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '@shared/protocol/channels'
import { isAudioOutputStatus, type AudioOutputStatus } from '@shared/audioOutput/protocol'
import { isLocalLibrarySong } from '@shared/types/localLibrary'
import type { Song } from '@shared/types/schemas'
import { getSongNativeAudioOutputRequestHeaders } from '@/utils/player/songUrlResult'

export class NativeAudioOutputRetryablePlaybackError extends Error {
  constructor(
    readonly code: NonNullable<AudioOutputStatus['nativePlaybackError']>['code'],
    readonly httpStatus?: number
  ) {
    super(
      httpStatus
        ? `Native audio output playback needs a refreshed URL after HTTP ${httpStatus}.`
        : 'Native audio output playback needs a refreshed URL.'
    )
    this.name = 'NativeAudioOutputRetryablePlaybackError'
  }
}

export class NativeAudioOutputFailedPlaybackError extends Error {
  readonly code?: NonNullable<AudioOutputStatus['nativePlaybackError']>['code']
  readonly httpStatus?: number
  readonly nativeErrorCode?: string
  readonly nativeMessage?: string
  readonly reason?: string

  constructor(readonly status: AudioOutputStatus) {
    super(resolveNativePlaybackFailureMessage(status))
    this.name = 'NativeAudioOutputFailedPlaybackError'
    this.code = status.nativePlaybackError?.code
    this.httpStatus = status.nativePlaybackError?.httpStatus
    this.nativeErrorCode = status.nativePlaybackError?.nativeErrorCode
    this.nativeMessage = status.nativePlaybackError?.nativeMessage
    this.reason = status.reason
  }
}

export class NativeAudioOutputRequiredError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'NativeAudioOutputRequiredError'
  }
}

export function isNativeAudioOutputRetryablePlaybackError(
  error: unknown
): error is NativeAudioOutputRetryablePlaybackError {
  return error instanceof NativeAudioOutputRetryablePlaybackError
}

export function isNativeAudioOutputFailedPlaybackError(
  error: unknown
): error is NativeAudioOutputFailedPlaybackError {
  return error instanceof NativeAudioOutputFailedPlaybackError
}

export function isNativeAudioOutputRequiredError(
  error: unknown
): error is NativeAudioOutputRequiredError {
  return error instanceof NativeAudioOutputRequiredError
}

export type NativeAudioOutputPlaybackRequest = {
  song: Song
  startSeconds?: number
  volume: number
}

export type NativeAudioOutputPlaybackError =
  | NativeAudioOutputFailedPlaybackError
  | NativeAudioOutputRetryablePlaybackError

export type NativeAudioOutputPlaybackController = {
  canPlay(request: NativeAudioOutputPlaybackRequest): boolean
  requiresNativePlayback(request: NativeAudioOutputPlaybackRequest): boolean
  play(request: NativeAudioOutputPlaybackRequest): Promise<boolean>
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<void>
  setVolume(volume: number): Promise<void>
  onStatus?: (listener: (status: AudioOutputStatus) => void) => () => void
  onEnded(listener: () => void): () => void
  onError(listener: (error?: NativeAudioOutputPlaybackError) => void): () => void
}

type AudioOutputServiceBridge = {
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>
  on?: (channel: string, callback: (value: unknown) => void) => (() => void) | void
}

const NATIVE_PLAYABLE_LOCAL_AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.aif',
  '.aiff',
  '.ape',
  '.caf',
  '.flac',
  '.m2a',
  '.m4a',
  '.mka',
  '.mp1',
  '.mp2',
  '.mp3',
  '.mpa',
  '.oga',
  '.ogg',
  '.wav'
])

const NATIVE_UNPLAYABLE_REMOTE_AUDIO_EXTENSIONS = new Set(['.mkv', '.opus', '.webm'])
const NATIVE_PLAYBACK_MODES = new Set<AudioOutputStatus['requestedMode']>([
  'shared',
  'exclusive',
  'voicemeeter'
])
const REMOTE_MEDIA_PROXY_PROTOCOL = 'luo-media:'
const REMOTE_MEDIA_PROXY_HOST = 'remote'

type NativePlayableAudioSource = {
  path?: string
  url?: string
  source: string
}

function getServicesBridge(): AudioOutputServiceBridge | null {
  if (typeof window === 'undefined') {
    return null
  }

  return (
    (
      window as Window & {
        services?: AudioOutputServiceBridge
      }
    ).services ?? null
  )
}

function createNativePlaybackToken(requestId: number): string {
  return `native-playback-renderer-${requestId}`
}

function getNativeSupportedExtensions(status?: AudioOutputStatus | null): Set<string> {
  return new Set([
    ...NATIVE_PLAYABLE_LOCAL_AUDIO_EXTENSIONS,
    ...(status?.supportedExtensions ?? []).map(extension => extension.toLocaleLowerCase())
  ])
}

function hasNativePlayableAudioExtension(
  value: string,
  status?: AudioOutputStatus | null
): boolean {
  const normalizedValue = value.toLocaleLowerCase()
  for (const extension of getNativeSupportedExtensions(status)) {
    if (normalizedValue.endsWith(extension)) {
      return true
    }
  }

  return false
}

function hasNativeUnplayableRemoteExtension(url: URL, status?: AudioOutputStatus | null): boolean {
  const normalizedPathname = url.pathname.toLocaleLowerCase()
  const nativeSupportedExtensions = getNativeSupportedExtensions(status)
  for (const extension of NATIVE_UNPLAYABLE_REMOTE_AUDIO_EXTENSIONS) {
    if (normalizedPathname.endsWith(extension) && !nativeSupportedExtensions.has(extension)) {
      return true
    }
  }

  return false
}

function isNativePlayableHttpUrl(url: URL, status?: AudioOutputStatus | null): boolean {
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    !hasNativeUnplayableRemoteExtension(url, status)
  )
}

function resolveNativePlayableLocalFilePath(
  song: Song,
  status?: AudioOutputStatus | null
): string | null {
  const localFilePath = (song.extra as Record<string, unknown> | undefined)?.localFilePath
  if (typeof localFilePath !== 'string' || !localFilePath.trim()) {
    return null
  }

  const trimmedPath = localFilePath.trim()
  return hasNativePlayableAudioExtension(trimmedPath, status) ? trimmedPath : null
}

function resolveNativePlayableRemoteUrl(
  song: Song,
  status?: AudioOutputStatus | null
): string | null {
  if (typeof song.url !== 'string' || !song.url.trim()) {
    return null
  }

  const trimmedUrl = song.url.trim()

  try {
    const parsedUrl = new URL(trimmedUrl)
    if (isNativePlayableHttpUrl(parsedUrl, status)) {
      return trimmedUrl
    }

    if (
      parsedUrl.protocol === REMOTE_MEDIA_PROXY_PROTOCOL &&
      parsedUrl.hostname === REMOTE_MEDIA_PROXY_HOST
    ) {
      const sourceUrl = parsedUrl.searchParams.get('url')
      if (!sourceUrl) {
        return null
      }

      const parsedSourceUrl = new URL(sourceUrl)
      if (isNativePlayableHttpUrl(parsedSourceUrl, status)) {
        return parsedSourceUrl.href
      }
    }
  } catch {
    return null
  }

  return null
}

function resolveNativePlayableAudioSource(
  song: Song,
  status?: AudioOutputStatus | null
): NativePlayableAudioSource | null {
  if (isLocalLibrarySong(song)) {
    const path = resolveNativePlayableLocalFilePath(song, status)
    return path ? { path, source: path } : null
  }

  const url = resolveNativePlayableRemoteUrl(song, status)
  return url ? { url, source: url } : null
}

function isNativePlayableStatus(status: AudioOutputStatus): boolean {
  return (
    status.enabled &&
    status.backend === 'native' &&
    status.backendAvailable &&
    NATIVE_PLAYBACK_MODES.has(status.requestedMode) &&
    status.nativePlaybackState !== 'error' &&
    status.nativePlaybackState !== 'stopped'
  )
}

function isTerminalNativePlaybackState(state: AudioOutputStatus['nativePlaybackState']): boolean {
  return state === 'stopped' || state === 'idle' || state === 'error' || state === 'ended'
}

function shouldAttemptNativePlayback(status: AudioOutputStatus | null): boolean {
  if (!status) {
    return true
  }

  if (!status.enabled) {
    return false
  }

  return NATIVE_PLAYBACK_MODES.has(status.requestedMode)
}

function shouldRequireNativePlayback(status: AudioOutputStatus | null): boolean {
  if (!status?.enabled || !shouldAttemptNativePlayback(status)) {
    return false
  }

  if (status.requestedMode === 'exclusive' && status.settings?.bitPerfectRequired === true) {
    return true
  }

  if (status.requestedMode === 'voicemeeter') {
    return true
  }

  if (status.requestedMode === 'exclusive') {
    return status.settings?.fallbackToShared !== true
  }

  return false
}

class DisabledNativeAudioOutputPlaybackController implements NativeAudioOutputPlaybackController {
  canPlay(): boolean {
    return false
  }

  requiresNativePlayback(): boolean {
    return false
  }

  async play(): Promise<boolean> {
    return false
  }

  async pause(): Promise<void> {}

  async resume(): Promise<void> {}

  async stop(): Promise<void> {}

  async setVolume(): Promise<void> {}

  onStatus(): () => void {
    return () => {}
  }

  onEnded(): () => void {
    return () => {}
  }

  onError(): () => void {
    return () => {}
  }
}

class IpcNativeAudioOutputPlaybackController implements NativeAudioOutputPlaybackController {
  private status: AudioOutputStatus | null = null
  private currentSource: string | null = null
  private currentPlaybackToken: string | null = null
  private retiredPlaybackSource: string | null = null
  private retiredPlaybackToken: string | null = null
  private playRequestId = 0
  private pendingPlayRequestId: number | null = null
  private readonly statusListeners = new Set<(status: AudioOutputStatus) => void>()
  private readonly endedListeners = new Set<() => void>()
  private readonly errorListeners = new Set<(error?: NativeAudioOutputPlaybackError) => void>()

  constructor(private readonly bridge: AudioOutputServiceBridge) {
    void this.refreshStatus()
    bridge.on?.(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED, value => {
      if (!isAudioOutputStatus(value)) {
        return
      }

      if (this.shouldDeferPendingPlaybackStatus(value)) {
        return
      }

      if (this.isStalePlaybackStatus(value)) {
        return
      }

      const previousState = this.status?.nativePlaybackState
      this.status = value
      this.syncCurrentPlaybackIdentity(value)

      this.emitStatus(value)

      if (previousState !== 'ended' && value.nativePlaybackState === 'ended') {
        for (const listener of this.endedListeners) {
          listener()
        }
      }

      if (previousState !== 'error' && value.nativePlaybackState === 'error') {
        const playbackError = createNativeAudioOutputPlaybackError(value)
        for (const listener of this.errorListeners) {
          listener(playbackError)
        }
      }
    })
  }

  canPlay(request: NativeAudioOutputPlaybackRequest): boolean {
    if (!this.bridge.invoke || !resolveNativePlayableAudioSource(request.song, this.status)) {
      return false
    }

    return shouldAttemptNativePlayback(this.status)
  }

  requiresNativePlayback(request: NativeAudioOutputPlaybackRequest): boolean {
    if (!this.bridge.invoke || !this.status || !shouldRequireNativePlayback(this.status)) {
      return false
    }

    if (this.status.requestedMode === 'exclusive' || this.status.requestedMode === 'voicemeeter') {
      return true
    }

    return Boolean(resolveNativePlayableAudioSource(request.song, this.status))
  }

  async play(request: NativeAudioOutputPlaybackRequest): Promise<boolean> {
    const source = resolveNativePlayableAudioSource(request.song, this.status)
    if (!this.bridge.invoke || !source) {
      return false
    }

    const requestId = ++this.playRequestId
    const playbackToken = createNativePlaybackToken(requestId)
    this.pendingPlayRequestId = requestId
    this.currentSource = source.source
    this.currentPlaybackToken = playbackToken
    const requestHeaders = source.url
      ? getSongNativeAudioOutputRequestHeaders(request.song)
      : undefined
    let status: AudioOutputStatus
    try {
      status = await this.invokeStatus(INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE, {
        path: source.path,
        url: source.url,
        ...(requestHeaders ? { requestHeaders } : {}),
        startSeconds: request.startSeconds,
        volume: request.volume,
        playbackToken
      })
    } catch (error) {
      if (this.pendingPlayRequestId === requestId) {
        this.pendingPlayRequestId = null
        this.retirePlaybackIdentity(source.source, playbackToken)
      }
      throw error
    }

    if (this.pendingPlayRequestId === requestId) {
      this.pendingPlayRequestId = null
    }

    if (requestId !== this.playRequestId || this.isStalePlaybackStatus(status)) {
      return false
    }

    this.status = status
    const playbackError = createNativeAudioOutputPlaybackError(status)
    if (playbackError) {
      this.retirePlaybackIdentity(
        status.nativePlaybackSource ?? source.source,
        status.nativePlaybackToken ?? playbackToken
      )
      throw playbackError
    }

    const didStart = isNativePlayableStatus(status)
    if (didStart) {
      this.currentSource = source.source
      this.currentPlaybackToken = status.nativePlaybackToken ?? playbackToken
    } else {
      this.retirePlaybackIdentity(
        status.nativePlaybackSource ?? source.source,
        status.nativePlaybackToken ?? playbackToken
      )
    }
    this.emitStatus(status)
    return didStart
  }

  async pause(): Promise<void> {
    this.emitStatus(await this.invokeStatus(INVOKE_CHANNELS.AUDIO_OUTPUT_PAUSE_PLAYBACK))
  }

  async resume(): Promise<void> {
    this.emitStatus(await this.invokeStatus(INVOKE_CHANNELS.AUDIO_OUTPUT_RESUME_PLAYBACK))
  }

  async stop(): Promise<void> {
    this.playRequestId += 1
    this.pendingPlayRequestId = null
    this.retirePlaybackIdentity()
    this.emitStatus(await this.invokeStatus(INVOKE_CHANNELS.AUDIO_OUTPUT_STOP_PLAYBACK))
  }

  async setVolume(volume: number): Promise<void> {
    if (!this.currentSource) {
      return
    }

    this.emitStatus(
      await this.invokeStatus(INVOKE_CHANNELS.AUDIO_OUTPUT_SET_PLAYBACK_VOLUME, { volume })
    )
  }

  onStatus(listener: (status: AudioOutputStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  onEnded(listener: () => void): () => void {
    this.endedListeners.add(listener)
    return () => {
      this.endedListeners.delete(listener)
    }
  }

  onError(listener: (error?: NativeAudioOutputPlaybackError) => void): () => void {
    this.errorListeners.add(listener)
    return () => {
      this.errorListeners.delete(listener)
    }
  }

  private async refreshStatus(): Promise<void> {
    try {
      this.status = await this.invokeStatus(INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS)
      this.syncCurrentPlaybackIdentity(this.status)
    } catch {
      this.status = null
      this.currentSource = null
      this.currentPlaybackToken = null
    }
  }

  private emitStatus(status: AudioOutputStatus): void {
    for (const listener of this.statusListeners) {
      listener(status)
    }
  }

  private isStalePlaybackStatus(status: AudioOutputStatus): boolean {
    return Boolean(
      (this.currentSource &&
        status.nativePlaybackSource &&
        status.nativePlaybackSource !== this.currentSource) ||
      (this.currentPlaybackToken &&
        status.nativePlaybackToken &&
        status.nativePlaybackToken !== this.currentPlaybackToken) ||
      this.isRetiredPlaybackStatus(status)
    )
  }

  private shouldDeferPendingPlaybackStatus(status: AudioOutputStatus): boolean {
    if (this.pendingPlayRequestId === null) {
      return false
    }

    return Boolean(status.nativePlaybackSource || status.nativePlaybackToken)
  }

  private syncCurrentPlaybackIdentity(status: AudioOutputStatus): void {
    if (isTerminalNativePlaybackState(status.nativePlaybackState)) {
      this.retirePlaybackIdentity(
        status.nativePlaybackSource ?? this.currentSource,
        status.nativePlaybackToken ?? this.currentPlaybackToken
      )
      return
    }

    if (status.nativePlaybackSource) {
      this.currentSource = status.nativePlaybackSource
    }

    if (status.nativePlaybackToken) {
      this.currentPlaybackToken = status.nativePlaybackToken
    }
  }

  private retirePlaybackIdentity(
    source = this.currentSource,
    playbackToken = this.currentPlaybackToken
  ): void {
    if (source) {
      this.retiredPlaybackSource = source
    }

    if (playbackToken) {
      this.retiredPlaybackToken = playbackToken
    }

    this.currentSource = null
    this.currentPlaybackToken = null
  }

  private isRetiredPlaybackStatus(status: AudioOutputStatus): boolean {
    if (this.currentSource || this.currentPlaybackToken) {
      return false
    }

    return Boolean(
      (this.retiredPlaybackSource &&
        status.nativePlaybackSource &&
        status.nativePlaybackSource === this.retiredPlaybackSource) ||
      (this.retiredPlaybackToken &&
        status.nativePlaybackToken &&
        status.nativePlaybackToken === this.retiredPlaybackToken)
    )
  }

  private async invokeStatus(channel: string, ...args: unknown[]): Promise<AudioOutputStatus> {
    if (!this.bridge.invoke) {
      throw new Error('Native audio output bridge is unavailable.')
    }

    const result = await this.bridge.invoke(channel, ...args)
    if (isAudioOutputStatus(result)) {
      return result
    }

    throw new Error('Native audio output service returned an invalid status.')
  }
}

export function createNativeAudioOutputPlaybackError(
  status: AudioOutputStatus
): NativeAudioOutputPlaybackError | undefined {
  if (status.nativePlaybackState !== 'error') {
    return undefined
  }

  const playbackError = status.nativePlaybackError
  if (playbackError?.retryable && playbackError.code === 'remote-auth-expired') {
    return new NativeAudioOutputRetryablePlaybackError(playbackError.code, playbackError.httpStatus)
  }

  return new NativeAudioOutputFailedPlaybackError(status)
}

function resolveNativePlaybackFailureMessage(status: AudioOutputStatus): string {
  const reason = status.reason?.trim()
  if (reason) {
    return reason
  }

  const httpStatus = status.nativePlaybackError?.httpStatus
  if (typeof httpStatus === 'number') {
    return `Native audio output playback failed after HTTP ${httpStatus}.`
  }

  return 'Native audio output playback failed.'
}

let defaultController: NativeAudioOutputPlaybackController | null = null

export function getDefaultNativeAudioOutputPlaybackController(): NativeAudioOutputPlaybackController {
  if (defaultController) {
    return defaultController
  }

  const bridge = getServicesBridge()
  defaultController = bridge?.invoke
    ? new IpcNativeAudioOutputPlaybackController(bridge)
    : new DisabledNativeAudioOutputPlaybackController()

  return defaultController
}
