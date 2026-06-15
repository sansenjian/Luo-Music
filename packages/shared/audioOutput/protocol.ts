export const AUDIO_OUTPUT_STORAGE_KEY = 'audioOutput'
export const AUDIO_OUTPUT_PROTOCOL_VERSION = 2
export const AUDIO_OUTPUT_HELPER_CAPABILITIES = [
  'streaming-pcm-buffer',
  'raw-pcm-passthrough',
  'bit-perfect-diagnostics',
  'symphonia-decode',
  'growing-file-source',
  'opus-decode',
  'ffmpeg-decode',
  'ffmpeg-fallback-decode',
  'cpal-shared-output',
  'wasapi-exclusive-output',
  'voicemeeter-route'
] as const

export type AudioOutputMode = 'shared' | 'exclusive' | 'voicemeeter'
export type AudioOutputHelperCapability = (typeof AUDIO_OUTPUT_HELPER_CAPABILITIES)[number]
export type AudioOutputBackend = 'disabled' | 'native' | 'unavailable'
export type AudioOutputNativePlaybackState =
  | 'idle'
  | 'starting'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'ended'
  | 'error'
export type AudioOutputExclusiveProbeStatus = 'passed' | 'failed'
export type AudioOutputExclusiveProbeSecondOpen =
  | 'deviceInUse'
  | 'unexpectedSuccess'
  | 'unexpectedError'

export type AudioOutputExclusiveProbeResult = {
  status: AudioOutputExclusiveProbeStatus
  deviceName?: string
  format?: string
  bufferFrames?: number
  bufferDurationHns?: number
  source?: string
  secondOpen?: AudioOutputExclusiveProbeSecondOpen
  errorCode?: string
  reason?: string
}

export type AudioOutputFormatDiagnostics = {
  sampleRate: number
  channels: number
  sampleFormat: string
  bitDepth?: number
  source?: string
}

export type AudioOutputBitPerfectStatus = 'candidate' | 'notCandidate' | 'unverified'

export type AudioOutputBitPerfectDiagnostics = {
  status: AudioOutputBitPerfectStatus
  sourceFormat?: AudioOutputFormatDiagnostics
  outputFormat?: AudioOutputFormatDiagnostics
  volume?: number
  reason: string
}

export type AudioOutputNativePlaybackSession = {
  id: string
  token: string
  source: string
  requestedMode: AudioOutputMode
  activeMode?: AudioOutputMode
  startedAt: number
}

export type AudioOutputNativePlaybackDiagnostics = {
  requestedMode: AudioOutputMode
  activeMode?: AudioOutputMode
  sourceFormat?: AudioOutputFormatDiagnostics
  outputFormat?: AudioOutputFormatDiagnostics
  sourceSampleRate?: number
  outputSampleRate?: number
  sampleRateMismatch?: boolean
  sourceChannels?: number
  outputChannels?: number
  channelMismatch?: boolean
  bitDepthMismatch?: boolean
  bitPerfectStatus?: AudioOutputBitPerfectStatus
  reason?: string
}

export type AudioOutputVoicemeeterRemoteKind = 'standard' | 'banana' | 'potato' | 'unknown'
export type AudioOutputVoicemeeterBus = 'A1' | 'A2' | 'A3' | 'B1' | 'B2' | 'B3'
export type AudioOutputVoicemeeterHardwareOutBus = 'A1' | 'A2' | 'A3'
export type AudioOutputVoicemeeterHardwareOutDriver = 'wdm' | 'mme' | 'ks' | 'asio'
export type AudioOutputVoicemeeterLevelProbeTarget = 'outputBus' | 'virtualInput'

export type AudioOutputVoicemeeterLevelProbe = {
  active: boolean
  target?: AudioOutputVoicemeeterLevelProbeTarget
  bus: AudioOutputVoicemeeterBus
  strip?: number
  levelType?: number
  channelStart: number
  channels: number
  samples: number
  activeSamples: number
  maxLevel: number
  threshold: number
  reason?: string
}

export type AudioOutputVoicemeeterRemoteStatus = {
  available: boolean
  connected: boolean
  routeApplied?: boolean
  routeManaged?: boolean
  routeBus?: AudioOutputVoicemeeterBus
  hardwareOutApplied?: boolean
  hardwareOutBus?: AudioOutputVoicemeeterHardwareOutBus
  hardwareOutDriver?: AudioOutputVoicemeeterHardwareOutDriver
  hardwareOutDevice?: string
  kind?: AudioOutputVoicemeeterRemoteKind
  version?: string
  virtualInputStrip?: number
  dllPath?: string
  levelProbe?: AudioOutputVoicemeeterLevelProbe
  reason?: string
}

export type AudioOutputSettings = {
  mode: AudioOutputMode
  sharedDeviceId: string
  deviceId: string
  bufferFrames: number
  fallbackToShared: boolean
  bitPerfectRequired: boolean
  voicemeeterBus: AudioOutputVoicemeeterBus
  voicemeeterHardwareOutBus?: AudioOutputVoicemeeterHardwareOutBus
  voicemeeterHardwareOutDriver?: AudioOutputVoicemeeterHardwareOutDriver
  voicemeeterHardwareOutDevice?: string
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
  backend: 'cpal' | 'wasapi' | 'voicemeeter'
}

export type AudioOutputNativePlaybackDownloadState = 'downloading' | 'cached'
export type AudioOutputNativePlaybackDownloadStrategy = 'single-response' | 'range-chunk'

export type AudioOutputNativePlaybackDownloadStatus = {
  state: AudioOutputNativePlaybackDownloadState
  bytesReceived: number
  totalBytes?: number
  rangeSupported?: boolean
  strategy?: AudioOutputNativePlaybackDownloadStrategy
}

export type AudioOutputNativePlaybackErrorCode =
  | 'remote-auth-expired'
  | 'remote-network-failed'
  | 'remote-cache-failed'
  | 'remote-unsupported-codec'
  | 'native-decode-failed'
  | 'native-playback-failed'
  | 'wasapi-exclusive-failed'

export type AudioOutputNativePlaybackError = {
  code: AudioOutputNativePlaybackErrorCode
  httpStatus?: number
  nativeErrorCode?: string
  nativeMessage?: string
  retryable: boolean
}

export type AudioOutputStatus = {
  enabled: boolean
  backend: AudioOutputBackend
  backendAvailable: boolean
  settings: AudioOutputSettings
  requestedMode: AudioOutputMode
  activeMode?: AudioOutputMode
  deviceId?: string
  devices: AudioOutputDevice[]
  supportedExtensions?: string[]
  supportedModes?: AudioOutputMode[]
  helperPath?: string
  helperRunning?: boolean
  testToneRunning?: boolean
  nativePlaybackRunning?: boolean
  nativePlaybackPaused?: boolean
  nativePlaybackSource?: string
  nativePlaybackState?: AudioOutputNativePlaybackState
  nativePlaybackPositionSeconds?: number
  nativePlaybackToken?: string
  nativePlaybackDownload?: AudioOutputNativePlaybackDownloadStatus
  nativePlaybackError?: AudioOutputNativePlaybackError
  nativePlaybackSession?: AudioOutputNativePlaybackSession
  nativePlaybackDiagnostics?: AudioOutputNativePlaybackDiagnostics
  exclusiveProbe?: AudioOutputExclusiveProbeResult
  bitPerfect?: AudioOutputBitPerfectDiagnostics
  voicemeeterRemote?: AudioOutputVoicemeeterRemoteStatus
  reason?: string
}

export type AudioOutputHelperStatus = Omit<AudioOutputStatus, 'settings'> & {
  settings?: AudioOutputSettings
}

export type AudioOutputReadyPayload = {
  protocolVersion: number
  capabilities?: AudioOutputHelperCapability[]
  supportedExtensions?: string[]
  supportedModes?: AudioOutputMode[]
}

export type AudioOutputConfigurePayload = {
  enabled: boolean
  settings: AudioOutputSettings
}

export type AudioOutputCommand =
  | { type: 'initialize'; payload: { protocolVersion: number } }
  | { type: 'configure'; payload: AudioOutputConfigurePayload }
  | { type: 'playTestTone'; payload: AudioOutputTestTonePayload }
  | { type: 'probeExclusiveLock' }
  | { type: 'playFile'; payload: AudioOutputPlayFilePayload }
  | { type: 'pausePlayback' }
  | { type: 'resumePlayback' }
  | { type: 'stopPlaybackOnly' }
  | { type: 'stopPlayback' }
  | { type: 'setPlaybackVolume'; payload: AudioOutputPlaybackVolumePayload }
  | { type: 'enumerateDevices' }
  | { type: 'shutdown' }

export type AudioOutputTestTonePayload = {
  durationMs?: number
  frequencyHz?: number
}

export type AudioOutputPlayFilePayload = {
  path?: string
  url?: string
  requestHeaders?: Record<string, string>
  startSeconds?: number
  volume?: number
  growingExpectedBytes?: number
  playbackToken?: string
}

export type AudioOutputPlaybackVolumePayload = {
  volume?: number
}

export type AudioOutputPlaybackEventPayload = {
  state: AudioOutputNativePlaybackState
  running: boolean
  paused?: boolean
  source?: string
  positionSeconds?: number
  playbackToken?: string
  nativePlaybackError?: AudioOutputNativePlaybackError
  reason?: string
}

export type AudioOutputEvent =
  | { type: 'ready'; payload: AudioOutputReadyPayload }
  | { type: 'status'; payload: AudioOutputHelperStatus }
  | { type: 'devices'; payload: { devices: AudioOutputDevice[] } }
  | { type: 'playback'; payload: AudioOutputPlaybackEventPayload }
  | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; message: string }
  | { type: 'error'; message: string }

const DEFAULT_VOICEMEETER_HARDWARE_OUT_BUS: AudioOutputVoicemeeterHardwareOutBus = 'A1'
const DEFAULT_VOICEMEETER_HARDWARE_OUT_DRIVER: AudioOutputVoicemeeterHardwareOutDriver = 'wdm'

export const DEFAULT_AUDIO_OUTPUT_SETTINGS: AudioOutputSettings = {
  mode: 'shared',
  sharedDeviceId: '',
  deviceId: '',
  bufferFrames: 960,
  fallbackToShared: true,
  bitPerfectRequired: false,
  voicemeeterBus: 'A1',
  voicemeeterHardwareOutBus: DEFAULT_VOICEMEETER_HARDWARE_OUT_BUS,
  voicemeeterHardwareOutDriver: DEFAULT_VOICEMEETER_HARDWARE_OUT_DRIVER,
  voicemeeterHardwareOutDevice: '',
  diagnosticsEnabled: false
}

export const DEFAULT_AUDIO_OUTPUT_STATE: AudioOutputState = {
  enabled: false,
  settings: DEFAULT_AUDIO_OUTPUT_SETTINGS
}

const AUDIO_OUTPUT_MODES = new Set<AudioOutputMode>(['shared', 'exclusive', 'voicemeeter'])
const AUDIO_OUTPUT_HELPER_CAPABILITY_SET = new Set<string>(AUDIO_OUTPUT_HELPER_CAPABILITIES)
const AUDIO_OUTPUT_VOICEMEETER_REMOTE_KINDS = new Set<AudioOutputVoicemeeterRemoteKind>([
  'standard',
  'banana',
  'potato',
  'unknown'
])
const AUDIO_OUTPUT_VOICEMEETER_BUSES = new Set<AudioOutputVoicemeeterBus>([
  'A1',
  'A2',
  'A3',
  'B1',
  'B2',
  'B3'
])
const AUDIO_OUTPUT_VOICEMEETER_HARDWARE_OUT_BUSES = new Set<AudioOutputVoicemeeterHardwareOutBus>([
  'A1',
  'A2',
  'A3'
])
const AUDIO_OUTPUT_VOICEMEETER_HARDWARE_OUT_DRIVERS =
  new Set<AudioOutputVoicemeeterHardwareOutDriver>(['wdm', 'mme', 'ks', 'asio'])
const AUDIO_OUTPUT_VOICEMEETER_LEVEL_PROBE_TARGETS =
  new Set<AudioOutputVoicemeeterLevelProbeTarget>(['outputBus', 'virtualInput'])
const MIN_BUFFER_FRAMES = 128
const MAX_BUFFER_FRAMES = 8192
const DEFAULT_TEST_TONE_DURATION_MS = 500
const MIN_TEST_TONE_DURATION_MS = 120
const MAX_TEST_TONE_DURATION_MS = 2000
const DEFAULT_TEST_TONE_FREQUENCY_HZ = 440
const MIN_TEST_TONE_FREQUENCY_HZ = 120
const MAX_TEST_TONE_FREQUENCY_HZ = 2000
const AUDIO_OUTPUT_REMOTE_REQUEST_HEADER_ALLOWLIST = new Set([
  'accept',
  'accept-language',
  'authorization',
  'cookie',
  'origin',
  'referer',
  'user-agent'
])

export function createDefaultAudioOutputStatus(): AudioOutputStatus {
  return {
    enabled: false,
    backend: 'disabled',
    backendAvailable: false,
    settings: { ...DEFAULT_AUDIO_OUTPUT_SETTINGS },
    requestedMode: DEFAULT_AUDIO_OUTPUT_SETTINGS.mode,
    devices: []
  }
}

export function sanitizeAudioOutputSettings(value: unknown): AudioOutputSettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_AUDIO_OUTPUT_SETTINGS }
  }

  const mode = isAudioOutputMode(value.mode) ? value.mode : DEFAULT_AUDIO_OUTPUT_SETTINGS.mode

  return {
    mode,
    sharedDeviceId: typeof value.sharedDeviceId === 'string' ? value.sharedDeviceId.trim() : '',
    deviceId: typeof value.deviceId === 'string' ? value.deviceId.trim() : '',
    bufferFrames: sanitizeBufferFrames(value.bufferFrames),
    fallbackToShared:
      typeof value.fallbackToShared === 'boolean'
        ? value.fallbackToShared
        : DEFAULT_AUDIO_OUTPUT_SETTINGS.fallbackToShared,
    bitPerfectRequired:
      mode === 'exclusive' && typeof value.bitPerfectRequired === 'boolean'
        ? value.bitPerfectRequired
        : false,
    voicemeeterBus: sanitizeVoicemeeterBus(value.voicemeeterBus),
    voicemeeterHardwareOutBus: sanitizeVoicemeeterHardwareOutBus(value.voicemeeterHardwareOutBus),
    voicemeeterHardwareOutDriver: sanitizeVoicemeeterHardwareOutDriver(
      value.voicemeeterHardwareOutDriver
    ),
    voicemeeterHardwareOutDevice:
      typeof value.voicemeeterHardwareOutDevice === 'string'
        ? value.voicemeeterHardwareOutDevice.trim()
        : DEFAULT_AUDIO_OUTPUT_SETTINGS.voicemeeterHardwareOutDevice,
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

export function isAudioOutputSettings(value: unknown): value is AudioOutputSettings {
  return (
    isRecord(value) &&
    isAudioOutputMode(value.mode) &&
    typeof value.sharedDeviceId === 'string' &&
    typeof value.deviceId === 'string' &&
    isValidBufferFrames(value.bufferFrames) &&
    typeof value.fallbackToShared === 'boolean' &&
    typeof value.bitPerfectRequired === 'boolean' &&
    (value.mode === 'exclusive' || value.bitPerfectRequired === false) &&
    isAudioOutputVoicemeeterBus(value.voicemeeterBus) &&
    (value.voicemeeterHardwareOutBus === undefined ||
      isAudioOutputVoicemeeterHardwareOutBus(value.voicemeeterHardwareOutBus)) &&
    (value.voicemeeterHardwareOutDriver === undefined ||
      isAudioOutputVoicemeeterHardwareOutDriver(value.voicemeeterHardwareOutDriver)) &&
    (value.voicemeeterHardwareOutDevice === undefined ||
      typeof value.voicemeeterHardwareOutDevice === 'string') &&
    typeof value.diagnosticsEnabled === 'boolean'
  )
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
  const growingExpectedBytes = sanitizeOptionalPositiveInteger(record.growingExpectedBytes)

  const payload: AudioOutputPlayFilePayload = {
    path: typeof record.path === 'string' ? record.path.trim() : '',
    url: typeof record.url === 'string' ? record.url.trim() : '',
    startSeconds: Number.isFinite(startSeconds) ? Math.max(0, startSeconds) : 0,
    volume: sanitizePlaybackVolume(record.volume)
  }
  const requestHeaders = sanitizeAudioOutputRemoteRequestHeaders(record.requestHeaders)
  if (requestHeaders) {
    payload.requestHeaders = requestHeaders
  }
  if (growingExpectedBytes !== undefined) {
    payload.growingExpectedBytes = growingExpectedBytes
  }
  const playbackToken = sanitizePlaybackToken(record.playbackToken)
  if (playbackToken) {
    payload.playbackToken = playbackToken
  }

  return payload
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
  return isAudioOutputStatusPayload(value, true)
}

function isAudioOutputHelperStatus(value: unknown): value is AudioOutputHelperStatus {
  return isAudioOutputStatusPayload(value, false)
}

function isAudioOutputStatusPayload(value: unknown, requireSettings: boolean): boolean {
  return (
    isRecord(value) &&
    typeof value.enabled === 'boolean' &&
    isAudioOutputBackend(value.backend) &&
    typeof value.backendAvailable === 'boolean' &&
    (requireSettings
      ? isAudioOutputSettings(value.settings)
      : value.settings === undefined || isAudioOutputSettings(value.settings)) &&
    isAudioOutputMode(value.requestedMode) &&
    (value.activeMode === undefined || isAudioOutputMode(value.activeMode)) &&
    (value.deviceId === undefined || typeof value.deviceId === 'string') &&
    Array.isArray(value.devices) &&
    value.devices.every(isAudioOutputDevice) &&
    (value.supportedExtensions === undefined ||
      (Array.isArray(value.supportedExtensions) &&
        value.supportedExtensions.every(extension => typeof extension === 'string'))) &&
    (value.supportedModes === undefined ||
      (Array.isArray(value.supportedModes) && value.supportedModes.every(isAudioOutputMode))) &&
    (value.helperPath === undefined || typeof value.helperPath === 'string') &&
    (value.helperRunning === undefined || typeof value.helperRunning === 'boolean') &&
    (value.testToneRunning === undefined || typeof value.testToneRunning === 'boolean') &&
    (value.nativePlaybackRunning === undefined ||
      typeof value.nativePlaybackRunning === 'boolean') &&
    (value.nativePlaybackPaused === undefined || typeof value.nativePlaybackPaused === 'boolean') &&
    (value.nativePlaybackSource === undefined || typeof value.nativePlaybackSource === 'string') &&
    (value.nativePlaybackState === undefined ||
      isAudioOutputNativePlaybackState(value.nativePlaybackState)) &&
    (value.nativePlaybackPositionSeconds === undefined ||
      isNonNegativeFiniteNumber(value.nativePlaybackPositionSeconds)) &&
    (value.nativePlaybackToken === undefined || typeof value.nativePlaybackToken === 'string') &&
    (value.nativePlaybackDownload === undefined ||
      isAudioOutputNativePlaybackDownloadStatus(value.nativePlaybackDownload)) &&
    (value.nativePlaybackError === undefined ||
      isAudioOutputNativePlaybackError(value.nativePlaybackError)) &&
    (value.nativePlaybackSession === undefined ||
      isAudioOutputNativePlaybackSession(value.nativePlaybackSession)) &&
    (value.nativePlaybackDiagnostics === undefined ||
      isAudioOutputNativePlaybackDiagnostics(value.nativePlaybackDiagnostics)) &&
    (value.exclusiveProbe === undefined ||
      isAudioOutputExclusiveProbeResult(value.exclusiveProbe)) &&
    (value.bitPerfect === undefined || isAudioOutputBitPerfectDiagnostics(value.bitPerfect)) &&
    (value.voicemeeterRemote === undefined ||
      isAudioOutputVoicemeeterRemoteStatus(value.voicemeeterRemote)) &&
    (value.reason === undefined || typeof value.reason === 'string')
  )
}

function isAudioOutputNativePlaybackError(value: unknown): value is AudioOutputNativePlaybackError {
  return (
    isRecord(value) &&
    isAudioOutputNativePlaybackErrorCode(value.code) &&
    (value.httpStatus === undefined ||
      (typeof value.httpStatus === 'number' &&
        Number.isInteger(value.httpStatus) &&
        value.httpStatus >= 100 &&
        value.httpStatus <= 599)) &&
    (value.nativeErrorCode === undefined || typeof value.nativeErrorCode === 'string') &&
    (value.nativeMessage === undefined || typeof value.nativeMessage === 'string') &&
    typeof value.retryable === 'boolean'
  )
}

function isAudioOutputNativePlaybackErrorCode(
  value: unknown
): value is AudioOutputNativePlaybackErrorCode {
  return (
    value === 'remote-auth-expired' ||
    value === 'remote-network-failed' ||
    value === 'remote-cache-failed' ||
    value === 'remote-unsupported-codec' ||
    value === 'native-decode-failed' ||
    value === 'native-playback-failed' ||
    value === 'wasapi-exclusive-failed'
  )
}

function isAudioOutputNativePlaybackDownloadStatus(
  value: unknown
): value is AudioOutputNativePlaybackDownloadStatus {
  return (
    isRecord(value) &&
    (value.state === 'downloading' || value.state === 'cached') &&
    typeof value.bytesReceived === 'number' &&
    Number.isFinite(value.bytesReceived) &&
    value.bytesReceived >= 0 &&
    (value.totalBytes === undefined ||
      (typeof value.totalBytes === 'number' &&
        Number.isFinite(value.totalBytes) &&
        value.totalBytes >= 0)) &&
    (value.rangeSupported === undefined || typeof value.rangeSupported === 'boolean') &&
    (value.strategy === undefined ||
      value.strategy === 'single-response' ||
      value.strategy === 'range-chunk')
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

function isValidBufferFrames(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= MIN_BUFFER_FRAMES &&
    value <= MAX_BUFFER_FRAMES
  )
}

function sanitizeVoicemeeterBus(value: unknown): AudioOutputVoicemeeterBus {
  if (typeof value !== 'string') {
    return DEFAULT_AUDIO_OUTPUT_SETTINGS.voicemeeterBus
  }

  const normalized = value.trim().toUpperCase()
  return isAudioOutputVoicemeeterBus(normalized)
    ? normalized
    : DEFAULT_AUDIO_OUTPUT_SETTINGS.voicemeeterBus
}

function sanitizeVoicemeeterHardwareOutBus(value: unknown): AudioOutputVoicemeeterHardwareOutBus {
  if (typeof value !== 'string') {
    return DEFAULT_VOICEMEETER_HARDWARE_OUT_BUS
  }

  const normalized = value.trim().toUpperCase()
  return isAudioOutputVoicemeeterHardwareOutBus(normalized)
    ? normalized
    : DEFAULT_VOICEMEETER_HARDWARE_OUT_BUS
}

function sanitizeVoicemeeterHardwareOutDriver(
  value: unknown
): AudioOutputVoicemeeterHardwareOutDriver {
  if (typeof value !== 'string') {
    return DEFAULT_VOICEMEETER_HARDWARE_OUT_DRIVER
  }

  const normalized = value.trim().toLowerCase()
  return isAudioOutputVoicemeeterHardwareOutDriver(normalized)
    ? normalized
    : DEFAULT_VOICEMEETER_HARDWARE_OUT_DRIVER
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

function isAudioOutputHelperCapability(value: unknown): value is AudioOutputHelperCapability {
  return typeof value === 'string' && AUDIO_OUTPUT_HELPER_CAPABILITY_SET.has(value)
}

function isAudioOutputBackend(value: unknown): value is AudioOutputBackend {
  return value === 'disabled' || value === 'native' || value === 'unavailable'
}

function isAudioOutputVoicemeeterBus(value: unknown): value is AudioOutputVoicemeeterBus {
  return (
    typeof value === 'string' &&
    AUDIO_OUTPUT_VOICEMEETER_BUSES.has(value as AudioOutputVoicemeeterBus)
  )
}

function isAudioOutputVoicemeeterHardwareOutBus(
  value: unknown
): value is AudioOutputVoicemeeterHardwareOutBus {
  return (
    typeof value === 'string' &&
    AUDIO_OUTPUT_VOICEMEETER_HARDWARE_OUT_BUSES.has(value as AudioOutputVoicemeeterHardwareOutBus)
  )
}

function isAudioOutputVoicemeeterHardwareOutDriver(
  value: unknown
): value is AudioOutputVoicemeeterHardwareOutDriver {
  return (
    typeof value === 'string' &&
    AUDIO_OUTPUT_VOICEMEETER_HARDWARE_OUT_DRIVERS.has(
      value as AudioOutputVoicemeeterHardwareOutDriver
    )
  )
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

function isAudioOutputNativePlaybackSession(
  value: unknown
): value is AudioOutputNativePlaybackSession {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.token === 'string' &&
    value.token.length > 0 &&
    typeof value.source === 'string' &&
    value.source.length > 0 &&
    isAudioOutputMode(value.requestedMode) &&
    (value.activeMode === undefined || isAudioOutputMode(value.activeMode)) &&
    isNonNegativeFiniteNumber(value.startedAt)
  )
}

function isAudioOutputNativePlaybackDiagnostics(
  value: unknown
): value is AudioOutputNativePlaybackDiagnostics {
  return (
    isRecord(value) &&
    isAudioOutputMode(value.requestedMode) &&
    (value.activeMode === undefined || isAudioOutputMode(value.activeMode)) &&
    (value.sourceFormat === undefined || isAudioOutputFormatDiagnostics(value.sourceFormat)) &&
    (value.outputFormat === undefined || isAudioOutputFormatDiagnostics(value.outputFormat)) &&
    (value.sourceSampleRate === undefined || isNonNegativeFiniteNumber(value.sourceSampleRate)) &&
    (value.outputSampleRate === undefined || isNonNegativeFiniteNumber(value.outputSampleRate)) &&
    (value.sampleRateMismatch === undefined || typeof value.sampleRateMismatch === 'boolean') &&
    (value.sourceChannels === undefined || isNonNegativeFiniteNumber(value.sourceChannels)) &&
    (value.outputChannels === undefined || isNonNegativeFiniteNumber(value.outputChannels)) &&
    (value.channelMismatch === undefined || typeof value.channelMismatch === 'boolean') &&
    (value.bitDepthMismatch === undefined || typeof value.bitDepthMismatch === 'boolean') &&
    (value.bitPerfectStatus === undefined ||
      value.bitPerfectStatus === 'candidate' ||
      value.bitPerfectStatus === 'notCandidate' ||
      value.bitPerfectStatus === 'unverified') &&
    (value.reason === undefined || typeof value.reason === 'string')
  )
}

function isAudioOutputExclusiveProbeResult(
  value: unknown
): value is AudioOutputExclusiveProbeResult {
  return (
    isRecord(value) &&
    (value.status === 'passed' || value.status === 'failed') &&
    (value.deviceName === undefined || typeof value.deviceName === 'string') &&
    (value.format === undefined || typeof value.format === 'string') &&
    (value.bufferFrames === undefined ||
      (typeof value.bufferFrames === 'number' && Number.isFinite(value.bufferFrames))) &&
    (value.bufferDurationHns === undefined ||
      (typeof value.bufferDurationHns === 'number' && Number.isFinite(value.bufferDurationHns))) &&
    (value.source === undefined || typeof value.source === 'string') &&
    (value.secondOpen === undefined ||
      value.secondOpen === 'deviceInUse' ||
      value.secondOpen === 'unexpectedSuccess' ||
      value.secondOpen === 'unexpectedError') &&
    (value.errorCode === undefined || typeof value.errorCode === 'string') &&
    (value.reason === undefined || typeof value.reason === 'string')
  )
}

function isAudioOutputBitPerfectDiagnostics(
  value: unknown
): value is AudioOutputBitPerfectDiagnostics {
  return (
    isRecord(value) &&
    (value.status === 'candidate' ||
      value.status === 'notCandidate' ||
      value.status === 'unverified') &&
    (value.sourceFormat === undefined || isAudioOutputFormatDiagnostics(value.sourceFormat)) &&
    (value.outputFormat === undefined || isAudioOutputFormatDiagnostics(value.outputFormat)) &&
    (value.volume === undefined ||
      (typeof value.volume === 'number' && Number.isFinite(value.volume))) &&
    typeof value.reason === 'string'
  )
}

function isAudioOutputFormatDiagnostics(value: unknown): value is AudioOutputFormatDiagnostics {
  return (
    isRecord(value) &&
    typeof value.sampleRate === 'number' &&
    Number.isFinite(value.sampleRate) &&
    typeof value.channels === 'number' &&
    Number.isFinite(value.channels) &&
    typeof value.sampleFormat === 'string' &&
    (value.bitDepth === undefined ||
      (typeof value.bitDepth === 'number' && Number.isFinite(value.bitDepth))) &&
    (value.source === undefined || typeof value.source === 'string')
  )
}

function isAudioOutputVoicemeeterRemoteStatus(
  value: unknown
): value is AudioOutputVoicemeeterRemoteStatus {
  return (
    isRecord(value) &&
    typeof value.available === 'boolean' &&
    typeof value.connected === 'boolean' &&
    (value.routeApplied === undefined || typeof value.routeApplied === 'boolean') &&
    (value.routeManaged === undefined || typeof value.routeManaged === 'boolean') &&
    (value.routeBus === undefined || isAudioOutputVoicemeeterBus(value.routeBus)) &&
    (value.hardwareOutApplied === undefined || typeof value.hardwareOutApplied === 'boolean') &&
    (value.hardwareOutBus === undefined ||
      isAudioOutputVoicemeeterHardwareOutBus(value.hardwareOutBus)) &&
    (value.hardwareOutDriver === undefined ||
      isAudioOutputVoicemeeterHardwareOutDriver(value.hardwareOutDriver)) &&
    (value.hardwareOutDevice === undefined || typeof value.hardwareOutDevice === 'string') &&
    (value.kind === undefined ||
      AUDIO_OUTPUT_VOICEMEETER_REMOTE_KINDS.has(value.kind as AudioOutputVoicemeeterRemoteKind)) &&
    (value.version === undefined || typeof value.version === 'string') &&
    (value.virtualInputStrip === undefined ||
      (typeof value.virtualInputStrip === 'number' && Number.isFinite(value.virtualInputStrip))) &&
    (value.dllPath === undefined || typeof value.dllPath === 'string') &&
    (value.levelProbe === undefined || isAudioOutputVoicemeeterLevelProbe(value.levelProbe)) &&
    (value.reason === undefined || typeof value.reason === 'string')
  )
}

function isAudioOutputVoicemeeterLevelProbe(
  value: unknown
): value is AudioOutputVoicemeeterLevelProbe {
  return (
    isRecord(value) &&
    typeof value.active === 'boolean' &&
    (value.target === undefined ||
      AUDIO_OUTPUT_VOICEMEETER_LEVEL_PROBE_TARGETS.has(
        value.target as AudioOutputVoicemeeterLevelProbeTarget
      )) &&
    isAudioOutputVoicemeeterBus(value.bus) &&
    (value.strip === undefined ||
      (typeof value.strip === 'number' && Number.isFinite(value.strip))) &&
    (value.levelType === undefined ||
      (typeof value.levelType === 'number' && Number.isFinite(value.levelType))) &&
    typeof value.channelStart === 'number' &&
    Number.isFinite(value.channelStart) &&
    typeof value.channels === 'number' &&
    Number.isFinite(value.channels) &&
    typeof value.samples === 'number' &&
    Number.isFinite(value.samples) &&
    typeof value.activeSamples === 'number' &&
    Number.isFinite(value.activeSamples) &&
    typeof value.maxLevel === 'number' &&
    Number.isFinite(value.maxLevel) &&
    typeof value.threshold === 'number' &&
    Number.isFinite(value.threshold) &&
    (value.reason === undefined || typeof value.reason === 'string')
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
        Number.isFinite(value.payload.protocolVersion) &&
        (value.payload.capabilities === undefined ||
          (Array.isArray(value.payload.capabilities) &&
            value.payload.capabilities.every(isAudioOutputHelperCapability))) &&
        (value.payload.supportedExtensions === undefined ||
          isStringArray(value.payload.supportedExtensions)) &&
        (value.payload.supportedModes === undefined ||
          (Array.isArray(value.payload.supportedModes) &&
            value.payload.supportedModes.every(isAudioOutputMode)))
      )
    case 'status':
      return isAudioOutputHelperStatus(value.payload)
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
    (value.backend === 'cpal' || value.backend === 'wasapi' || value.backend === 'voicemeeter')
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
    (value.positionSeconds === undefined || isNonNegativeFiniteNumber(value.positionSeconds)) &&
    (value.playbackToken === undefined || typeof value.playbackToken === 'string') &&
    (value.nativePlaybackError === undefined ||
      isAudioOutputNativePlaybackError(value.nativePlaybackError)) &&
    (value.reason === undefined || typeof value.reason === 'string')
  )
}

function isAudioOutputLogLevel(
  value: unknown
): value is Extract<AudioOutputEvent, { type: 'log' }>['level'] {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error'
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
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

function sanitizeOptionalPositiveInteger(value: unknown): number | undefined {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : undefined

  if (
    numericValue === undefined ||
    !Number.isFinite(numericValue) ||
    numericValue <= 0 ||
    !Number.isSafeInteger(Math.floor(numericValue))
  ) {
    return undefined
  }

  return Math.floor(numericValue)
}

function sanitizePlaybackToken(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const token = value.trim()
  return token ? token : undefined
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function sanitizeAudioOutputRemoteRequestHeaders(
  value: unknown
): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const headers: Record<string, string> = {}
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = rawName.trim().toLocaleLowerCase()
    if (!AUDIO_OUTPUT_REMOTE_REQUEST_HEADER_ALLOWLIST.has(name) || typeof rawValue !== 'string') {
      continue
    }

    const headerValue = rawValue.trim()
    if (!headerValue) {
      continue
    }

    headers[name] = headerValue
  }

  return Object.keys(headers).length > 0 ? headers : undefined
}
