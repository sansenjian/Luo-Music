export const SMTC_PROTOCOL_VERSION = 1

export type SmtcPlaybackState = 'playing' | 'paused' | 'stopped'
export type SmtcRepeatMode = 'none' | 'track' | 'list'
export type SmtcBackend = 'disabled' | 'native' | 'chromium'
export type SmtcLogLevel = 'debug' | 'info' | 'warn' | 'error'
export type SmtcReadyPayload = {
  protocolVersion: number
}

export type SmtcNativeStatus = {
  enabled: boolean
  backend: SmtcBackend
  nativeAvailable: boolean
  helperRunning: boolean
  restartRequired: boolean
  helperPath?: string
  reason?: string
}

export type SmtcMetadataPayload = {
  title: string
  artist?: string
  album?: string
  artworkUrl?: string
  sourceId?: string | number
  durationMs?: number
}

export type SmtcTimelinePayload = {
  positionMs: number
  durationMs: number
}

export type SmtcPlayModePayload = {
  shuffle: boolean
  repeat: SmtcRepeatMode
}

export type SmtcCommand =
  | { type: 'initialize'; payload: { appName: string; protocolVersion: number } }
  | { type: 'enable' }
  | { type: 'disable' }
  | { type: 'metadata'; payload: SmtcMetadataPayload }
  | { type: 'playbackState'; payload: { state: SmtcPlaybackState } }
  | { type: 'timeline'; payload: SmtcTimelinePayload }
  | { type: 'playMode'; payload: SmtcPlayModePayload }
  | { type: 'shutdown' }

export type SmtcEvent =
  | { type: 'ready'; payload: SmtcReadyPayload }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'nextTrack' }
  | { type: 'previousTrack' }
  | { type: 'seek'; positionMs: number }
  | { type: 'toggleShuffle' }
  | { type: 'toggleRepeat' }
  | { type: 'log'; level: SmtcLogLevel; message: string }
  | { type: 'error'; message: string }

export function serializeSmtcCommand(command: SmtcCommand): string {
  return `${JSON.stringify(command)}\n`
}

export function createDefaultSmtcNativeStatus(): SmtcNativeStatus {
  return {
    enabled: false,
    backend: 'disabled',
    nativeAvailable: false,
    helperRunning: false,
    restartRequired: false
  }
}

export function isSmtcNativeStatus(value: unknown): value is SmtcNativeStatus {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.enabled === 'boolean' &&
    isSmtcBackend(value.backend) &&
    typeof value.nativeAvailable === 'boolean' &&
    typeof value.helperRunning === 'boolean' &&
    typeof value.restartRequired === 'boolean'
  )
}

export function parseSmtcEventLine(line: string): SmtcEvent | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  try {
    const value = JSON.parse(trimmed) as unknown
    return isSmtcEvent(value) ? value : null
  } catch {
    return null
  }
}

function isSmtcEvent(value: unknown): value is SmtcEvent {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false
  }

  switch (value.type) {
    case 'ready':
      return isSmtcReadyPayload(value.payload)
    case 'play':
    case 'pause':
    case 'stop':
    case 'nextTrack':
    case 'previousTrack':
    case 'toggleShuffle':
    case 'toggleRepeat':
      return true
    case 'seek':
      return typeof value.positionMs === 'number' && Number.isFinite(value.positionMs)
    case 'log':
      return isSmtcLogLevel(value.level) && typeof value.message === 'string'
    case 'error':
      return typeof value.message === 'string'
    default:
      return false
  }
}

function isSmtcBackend(value: unknown): value is SmtcBackend {
  return value === 'disabled' || value === 'native' || value === 'chromium'
}

function isSmtcLogLevel(value: unknown): value is SmtcLogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error'
}

function isSmtcReadyPayload(value: unknown): value is SmtcReadyPayload {
  return (
    isRecord(value) &&
    typeof value.protocolVersion === 'number' &&
    Number.isFinite(value.protocolVersion)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
