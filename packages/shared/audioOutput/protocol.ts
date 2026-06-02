export const AUDIO_OUTPUT_STORAGE_KEY = 'audioOutput'
export const AUDIO_OUTPUT_PROTOCOL_VERSION = 1

export type AudioOutputMode = 'shared' | 'exclusive' | 'voicemeeter'
export type AudioOutputBackend = 'disabled' | 'native' | 'unavailable'
export type AudioOutputNativePlaybackState =
  | 'idle'
  | 'starting'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'ended'
  | 'error'

export type AudioOutputSettings = {
  mode: AudioOutputMode
  sharedDeviceId: string
  deviceId: string
  bufferFrames: number
  fallbackToShared: boolean
  diagnosticsEnabled: boolean
}

export type AudioOutputState = {
  enabled: boolean
  settings: AudioOutputSettings
}

export type AudioOutputDevice = {
  id: string
  name: string
  isDefault: boolean
  backend: 'wasapi' | 'voicemeeter'
}

export type AudioOutputStatus = {
  enabled: boolean
  backend: AudioOutputBackend
  backendAvailable: boolean
  requestedMode: AudioOutputMode
  activeMode?: AudioOutputMode
  deviceId?: string
  devices: AudioOutputDevice[]
  helperPath?: string
  helperRunning?: boolean
  testToneRunning?: boolean
  nativePlaybackRunning?: boolean
  nativePlaybackPaused?: boolean
  nativePlaybackSource?: string
  nativePlaybackState?: AudioOutputNativePlaybackState
  reason?: string
}

export type AudioOutputReadyPayload = {
  protocolVersion: number
}

export type AudioOutputConfigurePayload = {
  enabled: boolean
  settings: AudioOutputSettings
}

export type AudioOutputCommand =
  | { type: 'initialize'; payload: { protocolVersion: number } }
  | { type: 'configure'; payload: AudioOutputConfigurePayload }
  | { type: 'playTestTone'; payload: AudioOutputTestTonePayload }
  | { type: 'playFile'; payload: AudioOutputPlayFilePayload }
  | { type: 'pausePlayback' }
  | { type: 'resumePlayback' }
  | { type: 'stopPlayback' }
  | { type: 'setPlaybackVolume'; payload: AudioOutputPlaybackVolumePayload }
  | { type: 'enumerateDevices' }
  | { type: 'shutdown' }

export type AudioOutputTestTonePayload = {
  durationMs?: number
  frequencyHz?: number
}

export type AudioOutputPlayFilePayload = {
  path: string
  startSeconds?: number
  volume?: number
}

export type AudioOutputPlaybackVolumePayload = {
  volume?: number
}

export type AudioOutputPlaybackEventPayload = {
  state: AudioOutputNativePlaybackState
  running: boolean
  paused?: boolean
  source?: string
  reason?: string
}

export type AudioOutputEvent =
  | { type: 'ready'; payload: AudioOutputReadyPayload }
  | { type: 'status'; payload: AudioOutputStatus }
  | { type: 'devices'; payload: { devices: AudioOutputDevice[] } }
  | { type: 'playback'; payload: AudioOutputPlaybackEventPayload }
  | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; message: string }
  | { type: 'error'; message: string }

export const DEFAULT_AUDIO_OUTPUT_SETTINGS: AudioOutputSettings = {
  mode: 'shared',
  sharedDeviceId: '',
  deviceId: '',
  bufferFrames: 960,
  fallbackToShared: true,
  diagnosticsEnabled: false
}

export const DEFAULT_AUDIO_OUTPUT_STATE: AudioOutputState = {
  enabled: false,
  settings: DEFAULT_AUDIO_OUTPUT_SETTINGS
}

const AUDIO_OUTPUT_MODES = new Set<AudioOutputMode>(['shared', 'exclusive', 'voicemeeter'])
const MIN_BUFFER_FRAMES = 128
const MAX_BUFFER_FRAMES = 8192
const DEFAULT_TEST_TONE_DURATION_MS = 500
const MIN_TEST_TONE_DURATION_MS = 120
const MAX_TEST_TONE_DURATION_MS = 2000
const DEFAULT_TEST_TONE_FREQUENCY_HZ = 440
const MIN_TEST_TONE_FREQUENCY_HZ = 120
const MAX_TEST_TONE_FREQUENCY_HZ = 2000

export function createDefaultAudioOutputStatus(): AudioOutputStatus {
  return {
    enabled: false,
    backend: 'disabled',
    backendAvailable: false,
    requestedMode: DEFAULT_AUDIO_OUTPUT_SETTINGS.mode,
    devices: []
  }
}

export function sanitizeAudioOutputSettings(value: unknown): AudioOutputSettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_AUDIO_OUTPUT_SETTINGS }
  }

  return {
    mode: isAudioOutputMode(value.mode) ? value.mode : DEFAULT_AUDIO_OUTPUT_SETTINGS.mode,
    sharedDeviceId: typeof value.sharedDeviceId === 'string' ? value.sharedDeviceId.trim() : '',
    deviceId: typeof value.deviceId === 'string' ? value.deviceId.trim() : '',
    bufferFrames: sanitizeBufferFrames(value.bufferFrames),
    fallbackToShared:
      typeof value.fallbackToShared === 'boolean'
        ? value.fallbackToShared
        : DEFAULT_AUDIO_OUTPUT_SETTINGS.fallbackToShared,
    diagnosticsEnabled:
      typeof value.diagnosticsEnabled === 'boolean'
        ? value.diagnosticsEnabled
        : DEFAULT_AUDIO_OUTPUT_SETTINGS.diagnosticsEnabled
  }
}

export function sanitizeAudioOutputState(value: unknown): AudioOutputState {
  if (!isRecord(value)) {
    return {
      enabled: DEFAULT_AUDIO_OUTPUT_STATE.enabled,
      settings: { ...DEFAULT_AUDIO_OUTPUT_SETTINGS }
    }
  }

  return {
    enabled:
      typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_AUDIO_OUTPUT_STATE.enabled,
    settings: sanitizeAudioOutputSettings(value.settings)
  }
}

export function sanitizeAudioOutputTestTonePayload(
  value: unknown
): Required<AudioOutputTestTonePayload> {
  const record = isRecord(value) ? value : {}

  return {
    durationMs: sanitizeRangedNumber(
      record.durationMs,
      DEFAULT_TEST_TONE_DURATION_MS,
      MIN_TEST_TONE_DURATION_MS,
      MAX_TEST_TONE_DURATION_MS
    ),
    frequencyHz: sanitizeRangedNumber(
      record.frequencyHz,
      DEFAULT_TEST_TONE_FREQUENCY_HZ,
      MIN_TEST_TONE_FREQUENCY_HZ,
      MAX_TEST_TONE_FREQUENCY_HZ
    )
  }
}

export function sanitizeAudioOutputPlayFilePayload(value: unknown): AudioOutputPlayFilePayload {
  const record = isRecord(value) ? value : {}
  const startSeconds =
    typeof record.startSeconds === 'number'
      ? record.startSeconds
      : typeof record.startSeconds === 'string'
        ? Number.parseFloat(record.startSeconds)
        : 0

  return {
    path: typeof record.path === 'string' ? record.path.trim() : '',
    startSeconds: Number.isFinite(startSeconds) ? Math.max(0, startSeconds) : 0,
    volume: sanitizePlaybackVolume(record.volume)
  }
}

export function sanitizeAudioOutputPlaybackVolumePayload(
  value: unknown
): Required<AudioOutputPlaybackVolumePayload> {
  const record = isRecord(value) ? value : {}

  return {
    volume: sanitizePlaybackVolume(record.volume)
  }
}

export function isAudioOutputStatus(value: unknown): value is AudioOutputStatus {
  return (
    isRecord(value) &&
    typeof value.enabled === 'boolean' &&
    isAudioOutputBackend(value.backend) &&
    typeof value.backendAvailable === 'boolean' &&
    isAudioOutputMode(value.requestedMode) &&
    (value.activeMode === undefined || isAudioOutputMode(value.activeMode)) &&
    (value.deviceId === undefined || typeof value.deviceId === 'string') &&
    Array.isArray(value.devices) &&
    value.devices.every(isAudioOutputDevice) &&
    (value.helperPath === undefined || typeof value.helperPath === 'string') &&
    (value.helperRunning === undefined || typeof value.helperRunning === 'boolean') &&
    (value.testToneRunning === undefined || typeof value.testToneRunning === 'boolean') &&
    (value.nativePlaybackRunning === undefined ||
      typeof value.nativePlaybackRunning === 'boolean') &&
    (value.nativePlaybackPaused === undefined || typeof value.nativePlaybackPaused === 'boolean') &&
    (value.nativePlaybackSource === undefined || typeof value.nativePlaybackSource === 'string') &&
    (value.nativePlaybackState === undefined ||
      isAudioOutputNativePlaybackState(value.nativePlaybackState)) &&
    (value.reason === undefined || typeof value.reason === 'string')
  )
}

export function serializeAudioOutputCommand(command: AudioOutputCommand): string {
  return `${JSON.stringify(command)}\n`
}

export function parseAudioOutputEventLine(line: string): AudioOutputEvent | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  try {
    const value = JSON.parse(trimmed) as unknown
    return isAudioOutputEvent(value) ? value : null
  } catch {
    return null
  }
}

function sanitizeBufferFrames(value: unknown): number {
  return sanitizeRangedNumber(
    value,
    DEFAULT_AUDIO_OUTPUT_SETTINGS.bufferFrames,
    MIN_BUFFER_FRAMES,
    MAX_BUFFER_FRAMES
  )
}

function sanitizeRangedNumber(
  value: unknown,
  fallback: number,
  minValue: number,
  maxValue: number
): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : fallback

  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  return Math.min(maxValue, Math.max(minValue, Math.round(numericValue)))
}

function isAudioOutputMode(value: unknown): value is AudioOutputMode {
  return typeof value === 'string' && AUDIO_OUTPUT_MODES.has(value as AudioOutputMode)
}

function isAudioOutputBackend(value: unknown): value is AudioOutputBackend {
  return value === 'disabled' || value === 'native' || value === 'unavailable'
}

function isAudioOutputNativePlaybackState(value: unknown): value is AudioOutputNativePlaybackState {
  return (
    value === 'idle' ||
    value === 'starting' ||
    value === 'playing' ||
    value === 'paused' ||
    value === 'stopped' ||
    value === 'ended' ||
    value === 'error'
  )
}

function isAudioOutputEvent(value: unknown): value is AudioOutputEvent {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false
  }

  switch (value.type) {
    case 'ready':
      return (
        isRecord(value.payload) &&
        typeof value.payload.protocolVersion === 'number' &&
        Number.isFinite(value.payload.protocolVersion)
      )
    case 'status':
      return isAudioOutputStatus(value.payload)
    case 'devices':
      return (
        isRecord(value.payload) &&
        Array.isArray(value.payload.devices) &&
        value.payload.devices.every(isAudioOutputDevice)
      )
    case 'playback':
      return isAudioOutputPlaybackEventPayload(value.payload)
    case 'log':
      return (
        isAudioOutputLogLevel(value.level) &&
        typeof value.message === 'string' &&
        value.message.length > 0
      )
    case 'error':
      return typeof value.message === 'string'
    default:
      return false
  }
}

function isAudioOutputDevice(value: unknown): value is AudioOutputDevice {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.isDefault === 'boolean' &&
    (value.backend === 'wasapi' || value.backend === 'voicemeeter')
  )
}

function isAudioOutputPlaybackEventPayload(
  value: unknown
): value is AudioOutputPlaybackEventPayload {
  return (
    isRecord(value) &&
    isAudioOutputNativePlaybackState(value.state) &&
    typeof value.running === 'boolean' &&
    (value.paused === undefined || typeof value.paused === 'boolean') &&
    (value.source === undefined || typeof value.source === 'string') &&
    (value.reason === undefined || typeof value.reason === 'string')
  )
}

function isAudioOutputLogLevel(
  value: unknown
): value is Extract<AudioOutputEvent, { type: 'log' }>['level'] {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sanitizePlaybackVolume(value: unknown): number {
  const numericValue =
    typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : 1

  if (!Number.isFinite(numericValue)) {
    return 1
  }

  return Math.min(1, Math.max(0, numericValue))
}
