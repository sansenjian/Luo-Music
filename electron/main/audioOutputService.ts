import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process'
import { existsSync } from 'node:fs'

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
  type AudioOutputPlayFilePayload,
  type AudioOutputPlaybackVolumePayload,
  type AudioOutputSettings,
  type AudioOutputStatus,
  type AudioOutputTestTonePayload
} from '@shared/audioOutput/protocol'
import { resolveAudioOutputHelperPath } from './audioOutputNativePaths'

type AudioOutputLogger = Pick<Console, 'info' | 'warn' | 'error'> & Partial<Pick<Console, 'debug'>>

type SpawnHelper = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams

export type AudioOutputServiceDeps = {
  appPath?: string
  exists?: (filePath: string) => boolean
  isPackaged?: boolean
  logger?: AudioOutputLogger
  onStatusChange?: (status: AudioOutputStatus) => void
  platform?: NodeJS.Platform
  resourcesPath?: string
  spawnHelper?: SpawnHelper
}

export class AudioOutputService {
  private readonly appPath: string
  private readonly exists: (filePath: string) => boolean
  private readonly isPackaged: boolean
  private readonly logger: AudioOutputLogger
  private readonly onStatusChange: (status: AudioOutputStatus) => void
  private readonly platform: NodeJS.Platform
  private readonly resourcesPath: string
  private readonly spawnHelper: SpawnHelper

  private enabled = false
  private settings = sanitizeAudioOutputSettings(undefined)
  private helper: ChildProcessWithoutNullStreams | null = null
  private helperPath: string | null = null
  private stdoutBuffer = ''
  private devices: AudioOutputDevice[] = []
  private reason: string | null = null
  private lastStatus: AudioOutputStatus | null = null
  private testToneRunning = false
  private nativePlaybackRunning = false
  private nativePlaybackPaused = false
  private nativePlaybackSource: string | null = null
  private nativePlaybackState: NonNullable<AudioOutputStatus['nativePlaybackState']> = 'idle'

  constructor(deps: AudioOutputServiceDeps = {}) {
    this.appPath = deps.appPath ?? process.cwd()
    this.exists = deps.exists ?? existsSync
    this.isPackaged = deps.isPackaged ?? false
    this.logger = deps.logger ?? console
    this.onStatusChange = deps.onStatusChange ?? (() => {})
    this.platform = deps.platform ?? process.platform
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
      this.testToneRunning = false
      this.nativePlaybackRunning = false
      this.nativePlaybackPaused = false
      this.nativePlaybackSource = null
      this.nativePlaybackState = 'idle'
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

    if (this.platform !== 'win32') {
      this.reason = 'Native audio output is only available on Windows.'
      return this.publishStatus(this.createStatus('unavailable'))
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

  updateSettings(settings: AudioOutputSettings): AudioOutputStatus {
    this.settings = sanitizeAudioOutputSettings(settings)

    if (!this.enabled) {
      return this.publishStatus(this.createStatus('disabled'))
    }

    if (!this.helper) {
      return this.setEnabled(true, this.settings)
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
    this.reason = 'Native audio output test tone is playing.'
    const status = this.publishStatus(this.createStatusFromLastStatus('native'))
    this.sendCommand({
      type: 'playTestTone',
      payload: sanitizedPayload
    })
    return status
  }

  playFile(payload: AudioOutputPlayFilePayload): AudioOutputStatus {
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
    if (!sanitizedPayload.path) {
      this.reason = 'Native audio output playback requires a local file path.'
      return this.publishStatus(this.createStatusFromLastStatus('unavailable'))
    }

    this.nativePlaybackRunning = true
    this.nativePlaybackPaused = false
    this.nativePlaybackSource = sanitizedPayload.path
    this.nativePlaybackState = 'starting'
    this.reason = 'Native audio output playback is starting.'
    const status = this.publishStatus(this.createStatusFromLastStatus('native'))
    this.sendCommand({
      type: 'playFile',
      payload: sanitizedPayload
    })
    return status
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
    this.nativePlaybackRunning = false
    this.nativePlaybackPaused = false
    this.nativePlaybackSource = null
    this.nativePlaybackState = 'stopped'
    this.sendCommand({ type: 'stopPlayback' })

    if (!this.enabled) {
      return this.publishStatus(this.createStatus('disabled'))
    }

    this.reason = this.lastStatus?.reason ?? this.reason
    return this.publishStatus(this.createStatusFromLastStatus('native'))
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

  dispose(): void {
    this.enabled = false
    this.sendCommand({ type: 'shutdown' })
    this.stopHelper()
  }

  private createStatus(backend: AudioOutputStatus['backend']): AudioOutputStatus {
    const disabled = backend === 'disabled'
    return {
      ...createDefaultAudioOutputStatus(),
      enabled: this.enabled,
      backend,
      backendAvailable: backend === 'native',
      requestedMode: this.settings.mode,
      activeMode: backend === 'native' ? this.settings.mode : undefined,
      deviceId: this.settings.deviceId || undefined,
      devices: [...this.devices],
      helperPath: this.helperPath ?? undefined,
      helperRunning: Boolean(this.helper),
      testToneRunning: this.testToneRunning,
      nativePlaybackRunning: this.nativePlaybackRunning,
      nativePlaybackPaused: this.nativePlaybackPaused,
      nativePlaybackSource: this.nativePlaybackSource ?? undefined,
      nativePlaybackState: this.nativePlaybackState,
      reason: disabled ? undefined : (this.reason ?? undefined)
    }
  }

  private createStatusFromLastStatus(
    fallbackBackend: AudioOutputStatus['backend']
  ): AudioOutputStatus {
    const fallbackStatus = this.createStatus(fallbackBackend)
    return {
      ...(this.lastStatus ?? fallbackStatus),
      helperPath: this.helperPath ?? undefined,
      helperRunning: Boolean(this.helper),
      testToneRunning: this.testToneRunning,
      nativePlaybackRunning: this.nativePlaybackRunning,
      nativePlaybackPaused: this.nativePlaybackPaused,
      nativePlaybackSource: this.nativePlaybackSource ?? undefined,
      nativePlaybackState: this.nativePlaybackState,
      reason: this.reason ?? this.lastStatus?.reason ?? fallbackStatus.reason
    }
  }

  private ensureHelper(helperPath: string): void {
    if (this.helper) {
      return
    }

    this.helperPath = helperPath
    const helper = this.spawnHelper(helperPath, [], {
      env: process.env,
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
        this.logger.warn(`[AudioOutput] ${message}`)
      }
    })
    helper.on('error', error => {
      this.reason = `Rust audio output helper error: ${formatError(error)}`
      this.logger.warn('[AudioOutput] Helper process error', error)
      this.helper = null
      this.lastStatus = null
      this.nativePlaybackRunning = false
      this.nativePlaybackPaused = false
      this.nativePlaybackSource = null
      this.nativePlaybackState = 'error'
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
      this.nativePlaybackState = 'error'
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
        this.logger.info('[AudioOutput] Helper ready')
        break
      case 'devices':
        this.devices = event.payload.devices
        this.publishStatus(this.createStatusFromLastStatus('unavailable'))
        break
      case 'status':
        this.testToneRunning = false
        this.reason = event.payload.reason ?? null
        this.devices = event.payload.devices
        this.nativePlaybackRunning =
          event.payload.nativePlaybackRunning ?? this.nativePlaybackRunning
        this.nativePlaybackPaused = event.payload.nativePlaybackPaused ?? this.nativePlaybackPaused
        this.nativePlaybackSource = event.payload.nativePlaybackSource ?? this.nativePlaybackSource
        this.nativePlaybackState = event.payload.nativePlaybackState ?? this.nativePlaybackState
        this.lastStatus = {
          ...event.payload,
          helperPath: this.helperPath ?? undefined,
          helperRunning: Boolean(this.helper),
          testToneRunning: this.testToneRunning,
          nativePlaybackRunning: this.nativePlaybackRunning,
          nativePlaybackPaused: this.nativePlaybackPaused,
          nativePlaybackSource: this.nativePlaybackSource ?? undefined,
          nativePlaybackState: this.nativePlaybackState
        }
        this.publishStatus(this.lastStatus)
        break
      case 'playback':
        this.nativePlaybackRunning = event.payload.running
        this.nativePlaybackPaused = Boolean(event.payload.paused)
        this.nativePlaybackSource = event.payload.source ?? null
        this.nativePlaybackState = event.payload.state
        this.reason = event.payload.reason ?? this.reason
        this.publishStatus(this.createStatusFromLastStatus('native'))
        break
      case 'log':
        this.logger[event.level]?.(`[AudioOutput] ${event.message}`)
        break
      case 'error':
        this.testToneRunning = false
        this.nativePlaybackRunning = false
        this.nativePlaybackPaused = false
        this.nativePlaybackSource = null
        this.nativePlaybackState = 'error'
        this.reason = event.message
        this.lastStatus = null
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
    this.nativePlaybackState = 'idle'

    if (!helper || helper.killed) {
      return
    }

    helper.kill()
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
    this.onStatusChange(status)
    return status
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
