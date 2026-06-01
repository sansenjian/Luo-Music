import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process'
import { existsSync } from 'node:fs'

import type { PlayerStateSnapshot } from '@shared/contracts/ipc'
import { PLAY_MODE } from '@shared/player/playMode'
import {
  createDefaultSmtcNativeStatus,
  parseSmtcEventLine,
  serializeSmtcCommand,
  SMTC_PROTOCOL_VERSION,
  type SmtcCommand,
  type SmtcEvent,
  type SmtcMetadataPayload,
  type SmtcNativeStatus,
  type SmtcPlaybackState,
  type SmtcRepeatMode
} from '@shared/smtc/protocol'
import { resolveSmtcHelperPath } from './smtcNativePaths'

type SmtcLogger = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>

export type SmtcNativePlayerCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'nextTrack' }
  | { type: 'previousTrack' }
  | { type: 'seek'; positionSeconds: number }
  | { type: 'toggleShuffle' }
  | { type: 'toggleRepeat' }

type SpawnHelper = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams

export type SmtcNativeServiceDeps = {
  appName?: string
  appPath?: string
  appUserModelId?: string
  exists?: (filePath: string) => boolean
  isPackaged?: boolean
  logger?: SmtcLogger
  onCommand?: (command: SmtcNativePlayerCommand) => void
  onStatusChange?: (status: SmtcNativeStatus) => void
  platform?: NodeJS.Platform
  resourcesPath?: string
  spawnHelper?: SpawnHelper
}

const TIMELINE_MIN_DELTA_MS = 900
const DEFAULT_APP_USER_MODEL_ID = 'com.sansenjian.luo-music'
const UNKNOWN_SONG_TITLE = '未知歌曲'
const UNKNOWN_ARTIST_NAME = '未知艺术家'

export class SmtcNativeService {
  private readonly appName: string
  private readonly appPath: string
  private readonly appUserModelId: string
  private readonly exists: (filePath: string) => boolean
  private readonly isPackaged: boolean
  private readonly logger: SmtcLogger
  private readonly onCommand: (command: SmtcNativePlayerCommand) => void
  private readonly onStatusChange: (status: SmtcNativeStatus) => void
  private readonly platform: NodeJS.Platform
  private readonly resourcesPath: string
  private readonly spawnHelper: SpawnHelper

  private enabled = false
  private helper: ChildProcessWithoutNullStreams | null = null
  private helperPath: string | null = null
  private stdoutBuffer = ''
  private fallbackReason: string | null = null
  private chromiumRestartRequired = false
  private lastMetadataKey = ''
  private lastPlaybackState: SmtcPlaybackState | null = null
  private lastPlayModeKey = ''
  private lastTimelineKey = ''
  private lastTimelinePositionMs: number | null = null
  private mediaSessionVisible = false

  constructor(deps: SmtcNativeServiceDeps = {}) {
    this.appName = deps.appName ?? 'LUO Music'
    this.appPath = deps.appPath ?? process.cwd()
    this.appUserModelId = deps.appUserModelId ?? DEFAULT_APP_USER_MODEL_ID
    this.exists = deps.exists ?? existsSync
    this.isPackaged = deps.isPackaged ?? false
    this.logger = deps.logger ?? console
    this.onCommand = deps.onCommand ?? (() => {})
    this.onStatusChange = deps.onStatusChange ?? (() => {})
    this.platform = deps.platform ?? process.platform
    this.resourcesPath = deps.resourcesPath ?? process.resourcesPath ?? this.appPath
    this.spawnHelper =
      deps.spawnHelper ?? ((command, args, options) => spawn(command, args, options))
  }

  async setEnabled(enabled: boolean, restartRequired = false): Promise<SmtcNativeStatus> {
    this.enabled = enabled
    this.chromiumRestartRequired = restartRequired

    if (!enabled) {
      this.sendCommand({ type: 'disable' })
      this.stopHelper()
      this.resetLastSentState()
      return this.publishStatus(this.createStatus('disabled', restartRequired))
    }

    if (this.platform !== 'win32') {
      this.fallbackReason = 'Native SMTC is only available on Windows.'
      return this.publishStatus(this.createStatus('chromium', restartRequired))
    }

    const helperPath = this.resolveHelperPath()
    if (!helperPath) {
      this.fallbackReason = 'Rust SMTC helper binary was not found.'
      return this.publishStatus(this.createStatus('chromium', restartRequired))
    }

    try {
      this.ensureHelper(helperPath)
      this.sendCommand({
        type: 'initialize',
        payload: {
          appName: this.appName,
          protocolVersion: SMTC_PROTOCOL_VERSION
        }
      })
      this.fallbackReason = null
      return this.publishStatus(this.createStatus('native', false))
    } catch (error) {
      this.fallbackReason = `Failed to start Rust SMTC helper: ${formatError(error)}`
      this.logger.warn('[SMTC Native] Falling back to Chromium MediaSession', error)
      this.stopHelper()
      return this.publishStatus(this.createStatus('chromium', restartRequired))
    }
  }

  getStatus(restartRequired = false): SmtcNativeStatus {
    if (!this.enabled) {
      return this.createStatus('disabled', restartRequired)
    }

    if (this.helper) {
      return this.createStatus('native', false)
    }

    return this.createStatus('chromium', restartRequired || this.chromiumRestartRequired)
  }

  syncPlayerState(state: PlayerStateSnapshot): void {
    if (!this.enabled || !this.helper) {
      return
    }

    const song = state.currentSong
    const playbackState = resolvePlaybackState(state)
    const durationMs = resolveDurationMs(state)
    const positionMs = secondsToMs(state.progress)
    const playModePayload = {
      shuffle: state.playMode === PLAY_MODE.SHUFFLE,
      repeat: resolveRepeatMode(state.playMode)
    }

    if (!song) {
      this.hideNativeSession()
      this.resetLastSentState()
      return
    }

    const metadataPayload = createMetadataPayload(song, durationMs)
    const metadataKey = createMetadataKey(metadataPayload, song.platform)

    if (metadataKey !== this.lastMetadataKey) {
      this.lastMetadataKey = metadataKey
      this.sendCommand({
        type: 'metadata',
        payload: metadataPayload
      })
    }

    if (playbackState !== this.lastPlaybackState) {
      this.lastPlaybackState = playbackState
      this.sendCommand({ type: 'playbackState', payload: { state: playbackState } })
    }

    const playModeKey = `${playModePayload.shuffle}:${playModePayload.repeat}`
    if (playModeKey !== this.lastPlayModeKey) {
      this.lastPlayModeKey = playModeKey
      this.sendCommand({ type: 'playMode', payload: playModePayload })
    }

    if (durationMs > 0) {
      const timelineKey = `${durationMs}:${playbackState}`
      const shouldSendTimeline =
        timelineKey !== this.lastTimelineKey ||
        this.lastTimelinePositionMs === null ||
        Math.abs(positionMs - this.lastTimelinePositionMs) >= TIMELINE_MIN_DELTA_MS

      if (shouldSendTimeline) {
        this.lastTimelineKey = timelineKey
        this.lastTimelinePositionMs = positionMs
        this.sendCommand({
          type: 'timeline',
          payload: {
            positionMs,
            durationMs
          }
        })
      }
    } else {
      this.lastTimelineKey = ''
      this.lastTimelinePositionMs = null
    }

    this.showNativeSession()
  }

  dispose(): void {
    this.enabled = false
    this.sendCommand({ type: 'shutdown' })
    this.stopHelper()
    this.resetLastSentState()
  }

  private createStatus(
    backend: SmtcNativeStatus['backend'],
    restartRequired: boolean
  ): SmtcNativeStatus {
    return {
      ...createDefaultSmtcNativeStatus(),
      enabled: this.enabled,
      backend,
      nativeAvailable: Boolean(this.helperPath),
      helperRunning: Boolean(this.helper),
      restartRequired,
      ...(this.helperPath ? { helperPath: this.helperPath } : {}),
      ...(this.fallbackReason ? { reason: this.fallbackReason } : {})
    }
  }

  private ensureHelper(helperPath: string): void {
    if (this.helper) {
      return
    }

    this.helperPath = helperPath
    const helper = this.spawnHelper(helperPath, [], {
      env: {
        ...process.env,
        LUO_SMTC_APP_USER_MODEL_ID: this.appUserModelId
      },
      stdio: 'pipe',
      windowsHide: true
    })
    this.helper = helper

    helper.stdout.setEncoding('utf8')
    helper.stderr.setEncoding('utf8')

    helper.stdout.on('data', chunk => this.handleStdout(String(chunk)))
    helper.stderr.on('data', chunk => {
      const message = String(chunk).trim()
      if (message) {
        this.logger.warn(`[SMTC Native] ${message}`)
      }
    })
    helper.on('error', error => {
      this.fallbackReason = `Rust SMTC helper error: ${formatError(error)}`
      this.logger.warn('[SMTC Native] Helper process error', error)
      this.helper = null
      this.mediaSessionVisible = false
      this.resetLastSentState()
      this.publishStatus(this.createStatus('chromium', this.chromiumRestartRequired))
    })
    helper.on('exit', (code, signal) => {
      if (this.enabled) {
        this.fallbackReason = `Rust SMTC helper exited with code ${String(code)} signal ${String(signal)}.`
        this.logger.warn(`[SMTC Native] ${this.fallbackReason}`)
      }
      this.helper = null
      this.mediaSessionVisible = false
      this.resetLastSentState()
      if (this.enabled) {
        this.publishStatus(this.createStatus('chromium', this.chromiumRestartRequired))
      }
    })
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    const lines = this.stdoutBuffer.split(/\r?\n/)
    this.stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const event = parseSmtcEventLine(line)
      if (event) {
        this.handleHelperEvent(event)
      }
    }
  }

  private handleHelperEvent(event: SmtcEvent): void {
    switch (event.type) {
      case 'ready':
        this.logger.info('[SMTC Native] Helper ready')
        break
      case 'log':
        this.logHelperMessage(event.level ?? 'info', event.message)
        break
      case 'error':
        this.fallbackReason = event.message
        this.logger.warn(`[SMTC Native] ${event.message}`)
        this.stopHelper()
        this.fallbackReason = event.message
        this.resetLastSentState()
        this.publishStatus(this.createStatus('chromium', this.chromiumRestartRequired))
        break
      case 'play':
      case 'pause':
      case 'stop':
      case 'nextTrack':
      case 'previousTrack':
      case 'toggleShuffle':
      case 'toggleRepeat':
        this.onCommand({ type: event.type })
        break
      case 'seek':
        this.onCommand({ type: 'seek', positionSeconds: event.positionMs / 1000 })
        break
    }
  }

  private logHelperMessage(
    level: NonNullable<Extract<SmtcEvent, { type: 'log' }>['level']>,
    message: string
  ): void {
    this.logger[level]?.(`[SMTC Native] ${message}`)
  }

  private sendCommand(command: SmtcCommand): void {
    if (!this.helper || this.helper.killed || this.helper.stdin.destroyed) {
      return
    }

    this.helper.stdin.write(serializeSmtcCommand(command))
  }

  private stopHelper(): void {
    const helper = this.helper
    this.helper = null
    this.stdoutBuffer = ''

    if (!helper || helper.killed) {
      return
    }

    helper.kill()
    this.mediaSessionVisible = false
  }

  private resolveHelperPath(): string | null {
    const helperPath = resolveSmtcHelperPath({
      appPath: this.appPath,
      exists: this.exists,
      isPackaged: this.isPackaged,
      platform: this.platform,
      resourcesPath: this.resourcesPath
    })
    this.helperPath = helperPath
    return helperPath
  }

  private resetLastSentState(): void {
    this.lastMetadataKey = ''
    this.lastPlaybackState = null
    this.lastPlayModeKey = ''
    this.lastTimelineKey = ''
    this.lastTimelinePositionMs = null
  }

  private showNativeSession(): void {
    if (this.mediaSessionVisible) {
      return
    }

    this.sendCommand({ type: 'enable' })
    this.mediaSessionVisible = true
  }

  private hideNativeSession(): void {
    if (!this.mediaSessionVisible) {
      return
    }

    this.sendCommand({ type: 'disable' })
    this.mediaSessionVisible = false
  }

  private publishStatus(status: SmtcNativeStatus): SmtcNativeStatus {
    this.onStatusChange(status)
    return status
  }
}

function resolvePlaybackState(state: PlayerStateSnapshot): SmtcPlaybackState {
  if (!state.currentSong) {
    return 'stopped'
  }

  return state.isPlaying ? 'playing' : 'paused'
}

function createMetadataPayload(
  song: NonNullable<PlayerStateSnapshot['currentSong']>,
  durationMs: number
): SmtcMetadataPayload {
  return {
    title: normalizeRequiredText(song.name, UNKNOWN_SONG_TITLE),
    artist: createArtistText(song.artists),
    album: normalizeOptionalText(song.album.name),
    artworkUrl: normalizeOptionalText(song.album.picUrl),
    sourceId: song.id,
    durationMs: durationMs > 0 ? durationMs : undefined
  }
}

function createMetadataKey(payload: SmtcMetadataPayload, platform?: string): string {
  return [
    payload.sourceId,
    platform,
    payload.title,
    payload.artist,
    payload.album,
    payload.artworkUrl,
    payload.durationMs
  ].join('|')
}

function createArtistText(
  artists: NonNullable<PlayerStateSnapshot['currentSong']>['artists']
): string {
  const artistText = artists
    .map(artist => normalizeOptionalText(artist.name))
    .filter((name): name is string => Boolean(name))
    .join(' / ')

  return artistText || UNKNOWN_ARTIST_NAME
}

function normalizeRequiredText(value: string, fallback: string): string {
  return normalizeOptionalText(value) ?? fallback
}

function normalizeOptionalText(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function resolveRepeatMode(playMode: PlayerStateSnapshot['playMode']): SmtcRepeatMode {
  if (playMode === PLAY_MODE.SINGLE_LOOP) {
    return 'track'
  }

  if (playMode === PLAY_MODE.LIST_LOOP) {
    return 'list'
  }

  return 'none'
}

function resolveDurationMs(state: PlayerStateSnapshot): number {
  if (Number.isFinite(state.duration) && state.duration > 0) {
    return secondsToMs(state.duration)
  }

  const songDuration = state.currentSong?.duration
  return typeof songDuration === 'number' && Number.isFinite(songDuration) && songDuration > 0
    ? Math.round(songDuration)
    : 0
}

function secondsToMs(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : 0
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
