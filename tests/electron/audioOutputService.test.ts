import { EventEmitter } from 'node:events'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

import { AudioOutputService } from '../../electron/main/audioOutputService'
import {
  createDefaultAudioOutputStatus,
  type AudioOutputStatus
} from '@shared/audioOutput/protocol'

function createFakeHelper() {
  const helper = new EventEmitter() as ChildProcessWithoutNullStreams
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const stdin = new PassThrough()
  const writes: string[] = []

  stdin.on('data', chunk => {
    writes.push(String(chunk))
  })

  Object.assign(helper, {
    stdout,
    stderr,
    stdin,
    killed: false,
    kill: vi.fn(() => {
      Object.assign(helper, { killed: true })
      helper.emit('exit', 0, null)
      return true
    })
  })

  return {
    helper,
    stdout,
    commands: () =>
      writes
        .join('')
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line) as { type: string; payload?: unknown })
  }
}

function createLoggerMock() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}

function createStatus(overrides: Partial<AudioOutputStatus> = {}): AudioOutputStatus {
  return {
    ...createDefaultAudioOutputStatus(),
    enabled: true,
    backend: 'native',
    backendAvailable: true,
    requestedMode: 'shared',
    activeMode: 'shared',
    devices: [
      {
        id: '0:Speakers',
        name: 'Speakers',
        isDefault: true,
        backend: 'wasapi'
      }
    ],
    ...overrides
  }
}

function getPlaybackToken(command: { payload?: unknown } | undefined): string {
  const token =
    typeof command?.payload === 'object' &&
    command.payload !== null &&
    'playbackToken' in command.payload
      ? (command.payload as { playbackToken?: unknown }).playbackToken
      : undefined

  expect(token).toEqual(expect.stringMatching(/^native-playback-\d+$/))
  return String(token)
}

async function waitForCommand(
  fake: ReturnType<typeof createFakeHelper>,
  type: string
): Promise<{ type: string; payload?: unknown }> {
  let command: { type: string; payload?: unknown } | undefined
  await vi.waitFor(() => {
    command = fake.commands().find(candidate => candidate.type === type)
    expect(command).toBeTruthy()
  })
  return command!
}

async function waitForRemotePlayCommand(
  fake: ReturnType<typeof createFakeHelper>
): Promise<{ type: string; payload?: unknown }> {
  return waitForCommand(fake, 'playFile')
}

function expectRemoteCachingStartup(status: AudioOutputStatus, source: string): void {
  expect(status).toMatchObject({
    backend: 'native',
    nativePlaybackRunning: true,
    nativePlaybackSource: source,
    nativePlaybackState: 'starting',
    nativePlaybackDownload: {
      state: 'downloading',
      bytesReceived: 0
    },
    reason: 'Native audio output is caching remote media before playback.'
  })
}

describe('AudioOutputService', () => {
  it('reports a disabled status by default', () => {
    const service = new AudioOutputService({
      logger: createLoggerMock(),
      platform: 'win32'
    })

    expect(service.getStatus()).toMatchObject({
      enabled: false,
      backend: 'disabled',
      backendAvailable: false,
      requestedMode: 'shared'
    })
  })

  it('reports unavailable without spawning when the helper binary is missing', () => {
    const spawnHelper = vi.fn()
    const onStatusChange = vi.fn()
    const service = new AudioOutputService({
      exists: () => false,
      logger: createLoggerMock(),
      onStatusChange,
      platform: 'win32',
      spawnHelper
    })

    const status = service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: 'dac-1',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })

    expect(status).toMatchObject({
      enabled: true,
      backend: 'unavailable',
      backendAvailable: false,
      requestedMode: 'exclusive',
      deviceId: 'dac-1',
      helperRunning: false,
      reason: 'Rust audio output helper binary was not found.'
    })
    expect(onStatusChange).toHaveBeenCalledWith(status)
    expect(spawnHelper).not.toHaveBeenCalled()
  })

  it('starts the Rust helper and sends initialize/configure commands', () => {
    const fake = createFakeHelper()
    const spawnHelper = vi.fn(() => fake.helper)
    const service = new AudioOutputService({
      appPath: 'D:\\app',
      exists: filePath => filePath.includes('\\target\\debug\\'),
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper
    })

    const status = service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: '  dac-1  ',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })

    expect(spawnHelper).toHaveBeenCalledWith(
      'D:\\app\\native\\audio-engine\\target\\debug\\audio-output-helper.exe',
      [],
      expect.objectContaining({
        stdio: 'pipe',
        windowsHide: true
      })
    )
    expect(status).toMatchObject({
      enabled: true,
      backend: 'unavailable',
      helperRunning: true,
      requestedMode: 'exclusive',
      activeMode: undefined,
      deviceId: 'dac-1',
      reason: 'Native audio output helper is starting.'
    })
    expect(fake.commands()).toEqual([
      { type: 'initialize', payload: { protocolVersion: 2 } },
      {
        type: 'configure',
        payload: {
          enabled: true,
          settings: {
            mode: 'exclusive',
            sharedDeviceId: '',
            deviceId: 'dac-1',
            bufferFrames: 512,
            fallbackToShared: true,
            bitPerfectRequired: false,
            voicemeeterBus: 'A1',
            voicemeeterHardwareOutBus: 'A1',
            voicemeeterHardwareOutDriver: 'wdm',
            voicemeeterHardwareOutDevice: '',
            diagnosticsEnabled: false
          }
        }
      }
    ])
  })

  it('hydrates helper-supported formats and modes from the ready event', async () => {
    const fake = createFakeHelper()
    const spawnHelper = vi.fn(() => fake.helper)
    const service = new AudioOutputService({
      appPath: 'D:\\app',
      exists: filePath => filePath.includes('\\target\\debug\\'),
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper
    })

    service.setEnabled(true)
    fake.stdout.write(
      JSON.stringify({
        type: 'ready',
        payload: {
          protocolVersion: 2,
          capabilities: ['symphonia-decode', 'cpal-shared-output'],
          supportedExtensions: ['.mp3', '.flac'],
          supportedModes: ['shared']
        }
      }) + '\n'
    )

    await vi.waitFor(() => {
      expect(service.getStatus()).toMatchObject({
        supportedExtensions: ['.mp3', '.flac'],
        supportedModes: ['shared']
      })
    })
  })

  it('falls back to platform defaults when ready event omits helper-supported formats and modes', async () => {
    const fake = createFakeHelper()
    const spawnHelper = vi.fn(() => fake.helper)
    const logger = createLoggerMock()
    const service = new AudioOutputService({
      appPath: 'D:\\app',
      exists: filePath => filePath.includes('\\target\\debug\\'),
      logger,
      platform: 'win32',
      spawnHelper
    })

    service.setEnabled(true)
    fake.stdout.write(
      JSON.stringify({
        type: 'ready',
        payload: {
          protocolVersion: 2,
          capabilities: ['symphonia-decode', 'cpal-shared-output'],
          supportedExtensions: ['.mp3', '.flac'],
          supportedModes: ['shared']
        }
      }) + '\n'
    )

    await vi.waitFor(() => {
      expect(service.getStatus()).toMatchObject({
        supportedExtensions: ['.mp3', '.flac'],
        supportedModes: ['shared']
      })
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'ready',
        payload: {
          protocolVersion: 2,
          capabilities: ['symphonia-decode', 'cpal-shared-output']
        }
      }) + '\n'
    )

    await vi.waitFor(() => {
      expect(logger.info).toHaveBeenCalledTimes(2)
      expect(service.getStatus()).toMatchObject({
        supportedExtensions: [],
        supportedModes: ['shared', 'exclusive', 'voicemeeter']
      })
    })
  })

  it('replaces helper-supported formats and modes on subsequent ready events', async () => {
    const fake = createFakeHelper()
    const spawnHelper = vi.fn(() => fake.helper)
    const service = new AudioOutputService({
      appPath: 'D:\\app',
      exists: filePath => filePath.includes('\\target\\debug\\'),
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper
    })

    service.setEnabled(true)
    fake.stdout.write(
      JSON.stringify({
        type: 'ready',
        payload: {
          protocolVersion: 2,
          capabilities: ['symphonia-decode', 'cpal-shared-output'],
          supportedExtensions: ['.mp3', '.flac'],
          supportedModes: ['shared']
        }
      }) + '\n'
    )

    await vi.waitFor(() => {
      expect(service.getStatus()).toMatchObject({
        supportedExtensions: ['.mp3', '.flac'],
        supportedModes: ['shared']
      })
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'ready',
        payload: {
          protocolVersion: 2,
          capabilities: ['symphonia-decode', 'cpal-shared-output'],
          supportedExtensions: ['.ogg'],
          supportedModes: ['exclusive']
        }
      }) + '\n'
    )

    await vi.waitFor(() => {
      expect(service.getStatus()).toMatchObject({
        supportedExtensions: ['.ogg'],
        supportedModes: ['exclusive']
      })
    })
  })

  it('starts the platform audio helper without an exe suffix on non-Windows desktop builds', () => {
    const fake = createFakeHelper()
    const spawnHelper = vi.fn(() => fake.helper)
    const service = new AudioOutputService({
      appPath: 'D:\\app',
      exists: filePath => filePath.endsWith('\\target\\debug\\audio-output-helper'),
      logger: createLoggerMock(),
      platform: 'linux',
      spawnHelper
    })

    const status = service.setEnabled(true, {
      mode: 'shared',
      sharedDeviceId: '',
      deviceId: '',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })

    expect(spawnHelper).toHaveBeenCalledWith(
      'D:\\app\\native\\audio-engine\\target\\debug\\audio-output-helper',
      [],
      expect.objectContaining({
        stdio: 'pipe',
        windowsHide: false
      })
    )
    expect(status).toMatchObject({
      enabled: true,
      backend: 'unavailable',
      helperRunning: true,
      requestedMode: 'shared',
      supportedModes: ['shared'],
      reason: 'Native audio output helper is starting.'
    })
  })

  it('logs helper stdin errors without rethrowing', () => {
    const fake = createFakeHelper()
    const logger = createLoggerMock()
    const service = new AudioOutputService({
      appPath: 'D:\\app',
      exists: () => true,
      logger,
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    fake.helper.stdin.emit('error', new Error('EPIPE'))

    expect(logger.warn).toHaveBeenCalledWith(
      '[AudioOutput] Helper stdin error',
      expect.objectContaining({
        message: 'EPIPE'
      })
    )
  })

  it('publishes helper status events with devices and helper metadata', () => {
    const fake = createFakeHelper()
    const onStatusChange = vi.fn()
    const service = new AudioOutputService({
      appPath: 'D:\\app',
      exists: () => true,
      logger: createLoggerMock(),
      onStatusChange,
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    onStatusChange.mockClear()

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          deviceId: '0:Speakers'
        })
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      requestedMode: 'shared',
      activeMode: 'shared',
      deviceId: '0:Speakers',
      helperPath: expect.stringContaining('audio-output-helper.exe'),
      helperRunning: true,
      devices: [expect.objectContaining({ id: '0:Speakers', backend: 'wasapi' })]
    })
    expect(onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'native',
        helperRunning: true,
        devices: [expect.objectContaining({ name: 'Speakers' })]
      })
    )
  })

  it('ignores stale helper status events from a previous output mode', () => {
    const fake = createFakeHelper()
    const onStatusChange = vi.fn()
    const service = new AudioOutputService({
      appPath: 'D:\\app',
      exists: () => true,
      logger: createLoggerMock(),
      onStatusChange,
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'voicemeeter',
      sharedDeviceId: '',
      deviceId: 'voice-meeter-input',
      bufferFrames: 512,
      fallbackToShared: false,
      bitPerfectRequired: true,
      voicemeeterBus: 'B2',
      diagnosticsEnabled: true
    })
    onStatusChange.mockClear()
    const statusBeforeStaleEvent = service.getStatus()

    const staleHelperStatus: Partial<AudioOutputStatus> = createStatus({
      requestedMode: 'shared',
      activeMode: 'shared',
      deviceId: 'stale-shared-device',
      reason: 'Helper reported an older shared-mode status.'
    })
    delete staleHelperStatus.settings

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: staleHelperStatus
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      ...statusBeforeStaleEvent,
      devices: [expect.objectContaining({ name: 'Speakers' })]
    })
    expect(service.getStatus()).not.toMatchObject({
      activeMode: 'shared',
      reason: 'Helper reported an older shared-mode status.'
    })
    expect(onStatusChange).not.toHaveBeenCalled()
  })

  it('reflects exclusive fallback as requested exclusive but active shared', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: '',
      bufferFrames: 256,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'exclusive',
          activeMode: 'shared',
          reason: 'WASAPI exclusive initialization is pending; using shared fallback.'
        })
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      requestedMode: 'exclusive',
      activeMode: 'shared',
      reason: 'WASAPI exclusive initialization is pending; using shared fallback.'
    })
  })

  it('preserves helper-reported exclusive pending status without shared fallback', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: '',
      bufferFrames: 256,
      fallbackToShared: false,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'exclusive',
          activeMode: undefined,
          reason: 'WASAPI exclusive initialization is pending.'
        })
      }) + '\n'
    )

    const status = service.getStatus()

    expect(status).toMatchObject({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      requestedMode: 'exclusive',
      reason: 'WASAPI exclusive initialization is pending.'
    })
    expect(status).not.toHaveProperty('activeMode')
  })

  it('preserves helper-reported exclusive native file playback status', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'exclusive',
          activeMode: 'exclusive',
          deviceId: '0:Speakers',
          nativePlaybackRunning: true,
          nativePlaybackPaused: false,
          nativePlaybackSource: 'D:\\Music\\track.wav',
          nativePlaybackState: 'playing',
          reason: 'WASAPI exclusive native file playback is running.'
        })
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      requestedMode: 'exclusive',
      activeMode: 'exclusive',
      deviceId: '0:Speakers',
      nativePlaybackRunning: true,
      nativePlaybackPaused: false,
      nativePlaybackSource: 'D:\\Music\\track.wav',
      nativePlaybackState: 'playing',
      reason: 'WASAPI exclusive native file playback is running.'
    })
  })

  it('does not carry stale active mode into playback after output mode changes', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'shared',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'shared',
          activeMode: 'shared',
          deviceId: '0:Speakers',
          reason: 'Shared output stream initialized with silent native probe.'
        })
      }) + '\n'
    )

    service.updateSettings({
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: false,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })
    const status = service.playFile({
      path: 'D:\\Music\\exclusive.wav',
      startSeconds: 0,
      volume: 1
    }) as AudioOutputStatus

    expect(status).toMatchObject({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      requestedMode: 'exclusive',
      nativePlaybackRunning: true,
      nativePlaybackSource: 'D:\\Music\\exclusive.wav',
      nativePlaybackState: 'starting',
      nativePlaybackSession: {
        token: expect.stringMatching(/^native-playback-\d+$/),
        source: 'D:\\Music\\exclusive.wav',
        requestedMode: 'exclusive',
        activeMode: 'exclusive'
      },
      reason: 'Native audio output playback is starting.'
    })
    expect(status).not.toHaveProperty('activeMode')
    expect(status).not.toHaveProperty('voicemeeterRemote')
    expect(status).not.toHaveProperty('exclusiveProbe')
  })

  it('tracks native playback sessions and clears them after terminal helper events', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus()
      }) + '\n'
    )

    const status = service.playFile({
      path: 'D:\\Music\\track.wav',
      startSeconds: 0,
      volume: 1
    }) as AudioOutputStatus
    const playbackToken = getPlaybackToken(fake.commands().at(-1))

    expect(status.nativePlaybackSession).toMatchObject({
      id: expect.stringMatching(/^native-session-\d+$/),
      token: playbackToken,
      source: 'D:\\Music\\track.wav',
      requestedMode: 'shared',
      activeMode: 'shared'
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'ended',
          running: false,
          source: 'D:\\Music\\track.wav',
          playbackToken
        }
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      nativePlaybackRunning: false,
      nativePlaybackState: 'ended'
    })
    expect(service.getStatus().nativePlaybackSession).toBeUndefined()
  })

  it('derives native playback diagnostics from helper bit-perfect formats', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: false,
      bitPerfectRequired: true,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: true
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'exclusive',
          activeMode: 'exclusive',
          bitPerfect: {
            status: 'notCandidate',
            sourceFormat: {
              sampleRate: 44100,
              channels: 2,
              sampleFormat: 'pcm',
              bitDepth: 16
            },
            outputFormat: {
              sampleRate: 48000,
              channels: 2,
              sampleFormat: 'pcm',
              bitDepth: 24
            },
            volume: 1,
            reason: 'Source and output formats differ.'
          }
        })
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      nativePlaybackDiagnostics: {
        requestedMode: 'exclusive',
        activeMode: 'exclusive',
        sourceSampleRate: 44100,
        outputSampleRate: 48000,
        sampleRateMismatch: true,
        channelMismatch: false,
        bitDepthMismatch: true,
        bitPerfectStatus: 'notCandidate',
        reason: 'Source and output formats differ.'
      }
    })
  })

  it('sanitizes setting updates and sends them to a running helper', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    fake.commands()

    const status = service.updateSettings({
      mode: 'voicemeeter',
      sharedDeviceId: '',
      deviceId: ' voice ',
      bufferFrames: 64,
      fallbackToShared: false,
      bitPerfectRequired: true,
      voicemeeterBus: 'B2',
      diagnosticsEnabled: true
    })

    expect(service.getSettings()).toMatchObject({
      mode: 'voicemeeter',
      deviceId: 'voice',
      bufferFrames: 128,
      bitPerfectRequired: false,
      voicemeeterBus: 'B2'
    })
    expect(status).toMatchObject({
      enabled: true,
      backend: 'unavailable',
      requestedMode: 'voicemeeter',
      reason: 'Native audio output helper is starting.'
    })
    expect(fake.commands().at(-1)).toMatchObject({
      type: 'configure',
      payload: {
        enabled: true,
        settings: {
          mode: 'voicemeeter',
          sharedDeviceId: '',
          deviceId: 'voice',
          bufferFrames: 128,
          fallbackToShared: false,
          bitPerfectRequired: false,
          voicemeeterBus: 'B2',
          diagnosticsEnabled: true
        }
      }
    })
  })

  it('waits for helper playback to stop before applying playback-affecting setting updates', async () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })
    service.playFile({
      path: 'D:\\Music\\track.wav',
      startSeconds: 12,
      volume: 0.8
    })
    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'playing',
          running: true,
          paused: false,
          source: 'D:\\Music\\track.wav',
          reason: 'Native file playback is running.'
        }
      }) + '\n'
    )
    const commandCountBeforeSettingsUpdate = fake.commands().length

    const statusPromise = service.updateSettings({
      mode: 'voicemeeter',
      sharedDeviceId: '',
      deviceId: 'VoiceMeeter Input',
      bufferFrames: 512,
      fallbackToShared: false,
      bitPerfectRequired: false,
      voicemeeterBus: 'B1',
      diagnosticsEnabled: false
    })

    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toEqual([
      { type: 'stopPlayback' }
    ])

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'stopped',
          running: false,
          paused: false,
          source: 'D:\\Music\\track.wav',
          reason: 'Native playback stopped.'
        }
      }) + '\n'
    )

    const status = await statusPromise

    expect(status).toMatchObject({
      enabled: true,
      backend: 'unavailable',
      requestedMode: 'voicemeeter',
      nativePlaybackRunning: false,
      nativePlaybackPaused: false,
      nativePlaybackState: 'stopped',
      reason: 'Native audio output playback stopped because output settings changed.'
    })
    expect(status.nativePlaybackSource).toBeUndefined()
    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toMatchObject([
      { type: 'stopPlayback' },
      {
        type: 'configure',
        payload: {
          enabled: true,
          settings: {
            mode: 'voicemeeter',
            deviceId: 'VoiceMeeter Input',
            voicemeeterBus: 'B1'
          }
        }
      }
    ])
  })

  it('settles output setting stops from stale-token terminal playback events', async () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })
    service.playFile({
      path: 'D:\\Music\\track.wav',
      startSeconds: 12,
      volume: 0.8
    })
    const playbackToken = getPlaybackToken(fake.commands().at(-1))
    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'playing',
          running: true,
          paused: false,
          source: 'D:\\Music\\track.wav',
          playbackToken,
          reason: 'Native file playback is running.'
        }
      }) + '\n'
    )
    const commandCountBeforeSettingsUpdate = fake.commands().length

    const statusPromise = service.updateSettings({
      mode: 'voicemeeter',
      sharedDeviceId: '',
      deviceId: 'VoiceMeeter Input',
      bufferFrames: 512,
      fallbackToShared: false,
      bitPerfectRequired: false,
      voicemeeterBus: 'B1',
      diagnosticsEnabled: false
    })

    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toEqual([
      { type: 'stopPlayback' }
    ])

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'stopped',
          running: false,
          paused: false,
          source: 'D:\\Music\\track.wav',
          playbackToken,
          reason: 'Old native playback stopped after the output mode changed.'
        }
      }) + '\n'
    )

    await expect(statusPromise).resolves.toMatchObject({
      requestedMode: 'voicemeeter',
      nativePlaybackRunning: false,
      nativePlaybackState: 'stopped',
      reason: 'Native audio output playback stopped because output settings changed.'
    })
    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toMatchObject([
      { type: 'stopPlayback' },
      {
        type: 'configure',
        payload: {
          settings: {
            mode: 'voicemeeter',
            deviceId: 'VoiceMeeter Input',
            voicemeeterBus: 'B1'
          }
        }
      }
    ])
  })

  it('only applies the latest output settings after a pending playback-affecting stop settles', async () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'shared',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })
    service.playFile({
      path: 'D:\\Music\\track.wav',
      startSeconds: 7,
      volume: 0.8
    })
    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'playing',
          running: true,
          paused: false,
          source: 'D:\\Music\\track.wav',
          reason: 'Native file playback is running.'
        }
      }) + '\n'
    )
    const commandCountBeforeSettingsUpdate = fake.commands().length

    const exclusiveStatus = Promise.resolve(
      service.updateSettings({
        mode: 'exclusive',
        sharedDeviceId: '',
        deviceId: '0:Speakers',
        bufferFrames: 512,
        fallbackToShared: false,
        bitPerfectRequired: false,
        voicemeeterBus: 'A1',
        diagnosticsEnabled: false
      })
    )
    const voicemeeterStatus = Promise.resolve(
      service.updateSettings({
        mode: 'voicemeeter',
        sharedDeviceId: '',
        deviceId: 'VoiceMeeter Input',
        bufferFrames: 512,
        fallbackToShared: false,
        bitPerfectRequired: false,
        voicemeeterBus: 'B2',
        diagnosticsEnabled: false
      })
    )

    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toEqual([
      { type: 'stopPlayback' }
    ])

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'stopped',
          running: false,
          paused: false,
          source: 'D:\\Music\\track.wav',
          reason: 'Native playback stopped.'
        }
      }) + '\n'
    )

    await expect(exclusiveStatus).resolves.toMatchObject({
      requestedMode: 'voicemeeter'
    })
    await expect(voicemeeterStatus).resolves.toMatchObject({
      requestedMode: 'voicemeeter'
    })
    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toMatchObject([
      { type: 'stopPlayback' },
      {
        type: 'configure',
        payload: {
          settings: {
            mode: 'voicemeeter',
            deviceId: 'VoiceMeeter Input',
            voicemeeterBus: 'B2'
          }
        }
      }
    ])
  })

  it('queues native file playback until pending output settings settle', async () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'shared',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })
    service.playFile({
      path: 'D:\\Music\\track.wav',
      startSeconds: 7,
      volume: 0.8
    })
    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'playing',
          running: true,
          paused: false,
          source: 'D:\\Music\\track.wav',
          reason: 'Native file playback is running.'
        }
      }) + '\n'
    )
    const commandCountBeforeSettingsUpdate = fake.commands().length

    const settingsStatus = Promise.resolve(
      service.updateSettings({
        mode: 'exclusive',
        sharedDeviceId: '',
        deviceId: '0:Speakers',
        bufferFrames: 512,
        fallbackToShared: false,
        bitPerfectRequired: true,
        voicemeeterBus: 'A1',
        diagnosticsEnabled: false
      })
    )
    const playbackStatus = Promise.resolve(
      service.playFile({
        path: 'D:\\Music\\next.wav',
        startSeconds: 3,
        volume: 0.7
      })
    )

    await Promise.resolve()
    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toEqual([
      { type: 'stopPlayback' }
    ])

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'stopped',
          running: false,
          paused: false,
          source: 'D:\\Music\\track.wav',
          reason: 'Native playback stopped.'
        }
      }) + '\n'
    )

    await expect(settingsStatus).resolves.toMatchObject({
      requestedMode: 'exclusive'
    })
    await expect(playbackStatus).resolves.toMatchObject({
      requestedMode: 'exclusive',
      nativePlaybackRunning: true,
      nativePlaybackSource: 'D:\\Music\\next.wav',
      nativePlaybackState: 'starting'
    })
    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toMatchObject([
      { type: 'stopPlayback' },
      {
        type: 'configure',
        payload: {
          settings: {
            mode: 'exclusive',
            deviceId: '0:Speakers',
            bitPerfectRequired: true
          }
        }
      },
      { type: 'stopPlayback' },
      {
        type: 'playFile',
        payload: {
          path: 'D:\\Music\\next.wav',
          startSeconds: 3,
          volume: 0.7
        }
      }
    ])
  })

  it('uses stale helper status only to settle pending output setting stops', async () => {
    const fake = createFakeHelper()
    const onStatusChange = vi.fn()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      onStatusChange,
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'shared',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })
    service.playFile({
      path: 'D:\\Music\\track.wav',
      startSeconds: 7,
      volume: 0.8
    })
    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'playing',
          running: true,
          paused: false,
          source: 'D:\\Music\\track.wav',
          reason: 'Native file playback is running.'
        }
      }) + '\n'
    )
    const commandCountBeforeSettingsUpdate = fake.commands().length

    const statusPromise = Promise.resolve(
      service.updateSettings({
        mode: 'exclusive',
        sharedDeviceId: '',
        deviceId: '0:Speakers',
        bufferFrames: 512,
        fallbackToShared: false,
        bitPerfectRequired: true,
        voicemeeterBus: 'A1',
        diagnosticsEnabled: false
      })
    )

    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toEqual([
      { type: 'stopPlayback' }
    ])
    onStatusChange.mockClear()

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'shared',
          activeMode: 'shared',
          nativePlaybackRunning: false,
          nativePlaybackPaused: false,
          nativePlaybackSource: 'D:\\Music\\track.wav',
          nativePlaybackState: 'stopped',
          reason: 'Old shared-mode helper status stopped.'
        })
      }) + '\n'
    )

    await expect(statusPromise).resolves.toMatchObject({
      requestedMode: 'exclusive',
      nativePlaybackRunning: false,
      nativePlaybackState: 'stopped',
      reason: 'Native audio output playback stopped because output settings changed.'
    })
    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toMatchObject([
      { type: 'stopPlayback' },
      {
        type: 'configure',
        payload: {
          settings: {
            mode: 'exclusive',
            deviceId: '0:Speakers',
            bitPerfectRequired: true
          }
        }
      }
    ])
    expect(onStatusChange).not.toHaveBeenCalledWith(
      expect.objectContaining({
        requestedMode: 'shared',
        activeMode: 'shared',
        reason: 'Old shared-mode helper status stopped.'
      })
    )
  })

  it('plays only after the latest rapid output settings change is configured', async () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'shared',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })
    service.playFile({
      path: 'D:\\Music\\track.wav',
      startSeconds: 7,
      volume: 0.8
    })
    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'playing',
          running: true,
          paused: false,
          source: 'D:\\Music\\track.wav',
          reason: 'Native file playback is running.'
        }
      }) + '\n'
    )
    const commandCountBeforeSettingsUpdate = fake.commands().length

    const exclusiveStatus = Promise.resolve(
      service.updateSettings({
        mode: 'exclusive',
        sharedDeviceId: '',
        deviceId: '0:Speakers',
        bufferFrames: 512,
        fallbackToShared: false,
        bitPerfectRequired: false,
        voicemeeterBus: 'A1',
        diagnosticsEnabled: false
      })
    )
    const voicemeeterStatus = Promise.resolve(
      service.updateSettings({
        mode: 'voicemeeter',
        sharedDeviceId: '',
        deviceId: 'VoiceMeeter Input',
        bufferFrames: 512,
        fallbackToShared: false,
        bitPerfectRequired: false,
        voicemeeterBus: 'B2',
        diagnosticsEnabled: false
      })
    )
    const playbackStatus = Promise.resolve(
      service.playFile({
        path: 'D:\\Music\\next.wav',
        startSeconds: 0,
        volume: 1
      })
    )

    await Promise.resolve()
    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toEqual([
      { type: 'stopPlayback' }
    ])

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'stopped',
          running: false,
          paused: false,
          source: 'D:\\Music\\track.wav',
          reason: 'Native playback stopped.'
        }
      }) + '\n'
    )

    await expect(exclusiveStatus).resolves.toMatchObject({
      requestedMode: 'voicemeeter'
    })
    await expect(voicemeeterStatus).resolves.toMatchObject({
      requestedMode: 'voicemeeter'
    })
    await expect(playbackStatus).resolves.toMatchObject({
      requestedMode: 'voicemeeter',
      nativePlaybackRunning: true,
      nativePlaybackSource: 'D:\\Music\\next.wav',
      nativePlaybackState: 'starting'
    })
    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toMatchObject([
      { type: 'stopPlayback' },
      {
        type: 'configure',
        payload: {
          settings: {
            mode: 'voicemeeter',
            deviceId: 'VoiceMeeter Input',
            voicemeeterBus: 'B2'
          }
        }
      },
      { type: 'stopPlaybackOnly' }
    ])
    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'playFile' })])
    )

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'voicemeeter',
          activeMode: 'voicemeeter',
          deviceId: 'VoiceMeeter Input',
          voicemeeterRemote: {
            available: true,
            connected: true,
            routeApplied: true,
            routeManaged: true,
            routeBus: 'B2',
            kind: 'banana',
            virtualInputStrip: 3
          }
        })
      }) + '\n'
    )

    await vi.waitFor(() => {
      expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toMatchObject([
        { type: 'stopPlayback' },
        {
          type: 'configure',
          payload: {
            settings: {
              mode: 'voicemeeter',
              deviceId: 'VoiceMeeter Input',
              voicemeeterBus: 'B2'
            }
          }
        },
        { type: 'stopPlaybackOnly' },
        {
          type: 'playFile',
          payload: {
            path: 'D:\\Music\\next.wav',
            startSeconds: 0,
            volume: 1
          }
        }
      ])
    })
  })

  it('cancels stale Voicemeeter route waits when a newer playback request starts', async () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'voicemeeter',
      sharedDeviceId: '',
      deviceId: 'VoiceMeeter Input',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })

    service.playFile({
      path: 'D:\\Music\\old.wav',
      startSeconds: 1,
      volume: 0.5
    })
    service.playFile({
      path: 'D:\\Music\\new.wav',
      startSeconds: 2,
      volume: 0.6
    })

    expect(fake.commands()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'playFile' })])
    )

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'voicemeeter',
          activeMode: 'voicemeeter',
          deviceId: 'VoiceMeeter Input',
          voicemeeterRemote: {
            available: true,
            connected: true,
            routeApplied: true,
            routeManaged: true,
            routeBus: 'A1',
            kind: 'banana',
            virtualInputStrip: 3
          }
        })
      }) + '\n'
    )

    await vi.waitFor(() => {
      const playCommands = fake.commands().filter(command => command.type === 'playFile')
      expect(playCommands).toEqual([
        {
          type: 'playFile',
          payload: expect.objectContaining({
            path: 'D:\\Music\\new.wav',
            startSeconds: 2,
            volume: 0.6
          })
        }
      ])
    })
  })

  it('preserves the managed Voicemeeter route when terminal playback is released', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'voicemeeter',
      sharedDeviceId: '',
      deviceId: 'VoiceMeeter Input',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'voicemeeter',
          activeMode: 'voicemeeter',
          deviceId: 'VoiceMeeter Input',
          voicemeeterRemote: {
            available: true,
            connected: true,
            routeApplied: true,
            routeManaged: true,
            routeBus: 'A1',
            kind: 'banana',
            virtualInputStrip: 3
          }
        })
      }) + '\n'
    )

    service.playFile({
      path: 'D:\\Music\\voicemeeter-ended.wav',
      startSeconds: 0,
      volume: 1
    })
    const playbackToken = getPlaybackToken(fake.commands().at(-1))
    const commandCountBeforeEnded = fake.commands().length

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'ended',
          running: false,
          paused: false,
          source: 'D:\\Music\\voicemeeter-ended.wav',
          playbackToken,
          reason: 'Voicemeeter native file playback completed.'
        }
      }) + '\n'
    )

    expect(fake.commands().slice(commandCountBeforeEnded)).toEqual([{ type: 'stopPlaybackOnly' }])
    expect(service.getStatus()).toMatchObject({
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      voicemeeterRemote: {
        routeApplied: true,
        routeManaged: true,
        routeBus: 'A1'
      },
      nativePlaybackState: 'ended'
    })
  })

  it('keeps Voicemeeter route-ready status when ignored stale playback fields are present', async () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'exclusive',
          activeMode: 'exclusive',
          deviceId: '0:Speakers',
          nativePlaybackRunning: true,
          nativePlaybackSource: 'D:\\Music\\old-exclusive.wav',
          nativePlaybackState: 'playing'
        })
      }) + '\n'
    )

    const statusPromise = service.updateSettings({
      mode: 'voicemeeter',
      sharedDeviceId: '',
      deviceId: 'VoiceMeeter Input',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'B2',
      diagnosticsEnabled: false
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'stopped',
          running: false,
          paused: false,
          source: 'D:\\Music\\old-exclusive.wav',
          reason: 'Old exclusive playback stopped before Voicemeeter configure.'
        }
      }) + '\n'
    )
    await statusPromise

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'voicemeeter',
          activeMode: 'voicemeeter',
          deviceId: 'VoiceMeeter Input',
          nativePlaybackRunning: false,
          nativePlaybackSource: 'D:\\Music\\old-exclusive.wav',
          nativePlaybackState: 'stopped',
          voicemeeterRemote: {
            available: true,
            connected: true,
            routeApplied: true,
            routeManaged: true,
            routeBus: 'B2',
            kind: 'banana',
            virtualInputStrip: 3
          },
          reason: 'Voicemeeter virtual input route is available.'
        })
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      nativePlaybackRunning: false,
      nativePlaybackState: 'stopped',
      voicemeeterRemote: {
        routeApplied: true,
        routeManaged: true,
        routeBus: 'B2'
      },
      reason: 'Voicemeeter virtual input route is available.'
    })
    expect(service.getStatus().nativePlaybackSource).toBeUndefined()
  })

  it('waits for Voicemeeter HARDWARE OUT route proof before local playback', async () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'voicemeeter',
      sharedDeviceId: '',
      deviceId: 'VoiceMeeter Input',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      voicemeeterHardwareOutBus: 'A2',
      voicemeeterHardwareOutDriver: 'ks',
      voicemeeterHardwareOutDevice: 'USB DAC',
      diagnosticsEnabled: false
    })

    service.playFile({
      path: 'D:\\Music\\hardware-out.wav',
      startSeconds: 0,
      volume: 0.7
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'voicemeeter',
          activeMode: 'voicemeeter',
          deviceId: 'VoiceMeeter Input',
          voicemeeterRemote: {
            available: true,
            connected: true,
            routeApplied: true,
            routeManaged: true,
            routeBus: 'A1',
            hardwareOutApplied: false,
            hardwareOutBus: 'A2',
            hardwareOutDriver: 'ks',
            hardwareOutDevice: 'USB DAC',
            kind: 'banana',
            virtualInputStrip: 3
          }
        })
      }) + '\n'
    )

    await Promise.resolve()
    expect(fake.commands()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'playFile' })])
    )

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'voicemeeter',
          activeMode: 'voicemeeter',
          deviceId: 'VoiceMeeter Input',
          voicemeeterRemote: {
            available: true,
            connected: true,
            routeApplied: true,
            routeManaged: true,
            routeBus: 'A1',
            hardwareOutApplied: true,
            hardwareOutBus: 'A2',
            hardwareOutDriver: 'ks',
            hardwareOutDevice: 'USB DAC',
            kind: 'banana',
            virtualInputStrip: 3
          }
        })
      }) + '\n'
    )

    await vi.waitFor(() => {
      expect(fake.commands()).toEqual(
        expect.arrayContaining([
          {
            type: 'playFile',
            payload: expect.objectContaining({
              path: 'D:\\Music\\hardware-out.wav',
              startSeconds: 0,
              volume: 0.7
            })
          }
        ])
      )
    })
  })

  it('keeps native playback running when only the Chromium fallback device changes', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: 'chromium-a',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })
    service.playFile({
      path: 'D:\\Music\\track.wav',
      startSeconds: 12,
      volume: 0.8
    })
    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'playing',
          running: true,
          paused: false,
          source: 'D:\\Music\\track.wav',
          reason: 'Native file playback is running.'
        }
      }) + '\n'
    )
    const commandCountBeforeSettingsUpdate = fake.commands().length

    const status = service.updateSettings({
      mode: 'exclusive',
      sharedDeviceId: 'chromium-b',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })

    expect(status).toMatchObject({
      requestedMode: 'exclusive',
      nativePlaybackRunning: true,
      nativePlaybackSource: 'D:\\Music\\track.wav',
      nativePlaybackState: 'playing'
    })
    expect(fake.commands().slice(commandCountBeforeSettingsUpdate)).toEqual([
      {
        type: 'configure',
        payload: {
          enabled: true,
          settings: expect.objectContaining({
            sharedDeviceId: 'chromium-b'
          })
        }
      }
    ])
  })

  it('sends sanitized native test tone commands and clears running state after helper status', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus()
      }) + '\n'
    )

    const status = service.playTestTone({
      durationMs: 20,
      frequencyHz: 5000
    })

    expect(status).toMatchObject({
      enabled: true,
      backend: 'native',
      testToneRunning: true,
      reason: 'Native audio output test tone is playing.'
    })
    expect(fake.commands().at(-1)).toEqual({
      type: 'playTestTone',
      payload: {
        durationMs: 120,
        frequencyHz: 2000
      }
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          reason: 'Shared output stream initialized with silent native probe.'
        })
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      testToneRunning: false,
      reason: 'Shared output stream initialized with silent native probe.'
    })
  })

  it('sends native exclusive lock probe commands and reflects helper result', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'exclusive',
          activeMode: 'shared',
          deviceId: '0:Speakers'
        })
      }) + '\n'
    )

    const status = service.probeExclusiveLock()

    expect(status).toMatchObject({
      enabled: true,
      backend: 'native',
      requestedMode: 'exclusive',
      reason: 'WASAPI exclusive lock probe is running.'
    })
    expect(fake.commands().at(-1)).toEqual({ type: 'probeExclusiveLock' })

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'exclusive',
          activeMode: 'exclusive',
          deviceId: '0:Speakers',
          exclusiveProbe: {
            status: 'passed',
            deviceName: 'Speakers',
            format: '48000 Hz/2ch/24-bit pcm',
            bufferFrames: 2048,
            bufferDurationHns: 426667,
            source: 'PCM fallback',
            secondOpen: 'deviceInUse',
            errorCode: 'AUDCLNT_E_DEVICE_IN_USE'
          },
          reason: 'WASAPI exclusive lock probe passed. secondOpen=AUDCLNT_E_DEVICE_IN_USE.'
        })
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      activeMode: 'exclusive',
      exclusiveProbe: {
        status: 'passed',
        secondOpen: 'deviceInUse'
      },
      reason: 'WASAPI exclusive lock probe passed. secondOpen=AUDCLNT_E_DEVICE_IN_USE.'
    })
  })

  it('sends sanitized native file playback commands and tracks playback events', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus()
      }) + '\n'
    )

    const status = service.playFile({
      path: '  D:\\Music\\track.wav  ',
      startSeconds: -1,
      volume: 2
    })

    expect(status).toMatchObject({
      backend: 'native',
      nativePlaybackRunning: true,
      nativePlaybackPaused: false,
      nativePlaybackSource: 'D:\\Music\\track.wav',
      nativePlaybackState: 'starting',
      reason: 'Native audio output playback is starting.'
    })
    expect(fake.commands().slice(-2)).toMatchObject([
      { type: 'stopPlayback' },
      {
        type: 'playFile',
        payload: {
          path: 'D:\\Music\\track.wav',
          startSeconds: 0,
          volume: 1,
          playbackToken: expect.stringMatching(/^native-playback-\d+$/)
        }
      }
    ])
    const playbackToken = getPlaybackToken(fake.commands().at(-1))

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'playing',
          running: true,
          paused: false,
          source: 'D:\\Music\\track.wav',
          playbackToken,
          reason: 'Native file playback is running.'
        }
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      nativePlaybackRunning: true,
      nativePlaybackPaused: false,
      nativePlaybackSource: 'D:\\Music\\track.wav',
      nativePlaybackState: 'playing',
      reason: 'Native file playback is running.'
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'ended',
          running: false,
          paused: false,
          source: 'D:\\Music\\track.wav',
          playbackToken,
          reason: 'Native file playback completed.'
        }
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      nativePlaybackRunning: false,
      nativePlaybackPaused: false,
      nativePlaybackSource: 'D:\\Music\\track.wav',
      nativePlaybackState: 'ended',
      reason: 'Native file playback completed.'
    })
    expect(fake.commands().at(-1)).toEqual({ type: 'stopPlayback' })
  })

  it('preserves caller-supplied native playback tokens when sending file commands', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus()
      }) + '\n'
    )

    service.playFile({
      path: 'D:\\Music\\renderer-token.wav',
      startSeconds: 2,
      volume: 0.75,
      playbackToken: 'native-playback-renderer-42'
    })

    expect(fake.commands().at(-1)).toMatchObject({
      type: 'playFile',
      payload: {
        path: 'D:\\Music\\renderer-token.wav',
        startSeconds: 2,
        volume: 0.75,
        playbackToken: 'native-playback-renderer-42'
      }
    })
    expect(service.getStatus()).toMatchObject({
      nativePlaybackToken: 'native-playback-renderer-42'
    })
  })

  it('keeps exclusive native playback in starting state until WASAPI reports it is running', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: false,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'exclusive',
          activeMode: undefined,
          deviceId: '0:Speakers'
        })
      }) + '\n'
    )

    service.playFile({
      path: 'D:\\Music\\exclusive-start.wav',
      startSeconds: 4,
      volume: 1
    })
    const playbackToken = getPlaybackToken(fake.commands().at(-1))

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'starting',
          running: true,
          paused: false,
          source: 'D:\\Music\\exclusive-start.wav',
          positionSeconds: 4,
          playbackToken,
          reason: 'Native WASAPI exclusive file playback is starting on device: Speakers'
        }
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      nativePlaybackRunning: true,
      nativePlaybackSource: 'D:\\Music\\exclusive-start.wav',
      nativePlaybackState: 'starting',
      nativePlaybackPositionSeconds: 4,
      reason: 'Native WASAPI exclusive file playback is starting on device: Speakers'
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'playing',
          running: true,
          paused: false,
          source: 'D:\\Music\\exclusive-start.wav',
          positionSeconds: 4,
          playbackToken,
          reason: 'Native WASAPI exclusive file playback is running on device: Speakers'
        }
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      nativePlaybackRunning: true,
      nativePlaybackSource: 'D:\\Music\\exclusive-start.wav',
      nativePlaybackState: 'playing',
      nativePlaybackPositionSeconds: 4,
      reason: 'Native WASAPI exclusive file playback is running on device: Speakers'
    })
  })

  it('ignores stale helper playback events after a new native file request starts', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus()
      }) + '\n'
    )

    service.playFile({
      path: 'D:\\Music\\old.wav',
      startSeconds: 0,
      volume: 1
    })
    const firstPlaybackToken = getPlaybackToken(fake.commands().at(-1))
    service.playFile({
      path: 'D:\\Music\\new.wav',
      startSeconds: 0,
      volume: 1
    })
    const secondPlaybackToken = getPlaybackToken(fake.commands().at(-1))

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'playing',
          running: true,
          paused: false,
          source: 'D:\\Music\\old.wav',
          playbackToken: firstPlaybackToken,
          reason: 'Old native file playback is still reporting.'
        }
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      nativePlaybackRunning: true,
      nativePlaybackSource: 'D:\\Music\\new.wav',
      nativePlaybackState: 'starting',
      reason: 'Native audio output playback is starting.'
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'playing',
          running: true,
          paused: false,
          source: 'D:\\Music\\new.wav',
          playbackToken: secondPlaybackToken,
          reason: 'New native file playback is running.'
        }
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      nativePlaybackRunning: true,
      nativePlaybackSource: 'D:\\Music\\new.wav',
      nativePlaybackState: 'playing',
      reason: 'New native file playback is running.'
    })
  })

  it('ignores stale same-source helper playback events after replaying a native file', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus()
      }) + '\n'
    )

    service.playFile({
      path: 'D:\\Music\\same.wav',
      startSeconds: 0,
      volume: 1
    })
    const firstPlaybackToken = getPlaybackToken(fake.commands().at(-1))
    service.playFile({
      path: 'D:\\Music\\same.wav',
      startSeconds: 3,
      volume: 1
    })
    const secondPlaybackToken = getPlaybackToken(fake.commands().at(-1))

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'error',
          running: false,
          paused: false,
          source: 'D:\\Music\\same.wav',
          playbackToken: firstPlaybackToken,
          reason: 'Old native exclusive playback failed late.'
        }
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      nativePlaybackRunning: true,
      nativePlaybackSource: 'D:\\Music\\same.wav',
      nativePlaybackState: 'starting',
      reason: 'Native audio output playback is starting.'
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'playing',
          running: true,
          paused: false,
          source: 'D:\\Music\\same.wav',
          playbackToken: secondPlaybackToken,
          reason: 'Current native file playback is running.'
        }
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      nativePlaybackRunning: true,
      nativePlaybackSource: 'D:\\Music\\same.wav',
      nativePlaybackState: 'playing',
      reason: 'Current native file playback is running.'
    })
  })

  it('ignores late helper playback events after playback has been stopped', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus()
      }) + '\n'
    )

    service.playFile({
      path: 'D:\\Music\\old.wav',
      startSeconds: 0,
      volume: 1
    })
    service.stopPlayback()

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'playing',
          running: true,
          paused: false,
          source: 'D:\\Music\\old.wav',
          reason: 'Old native file playback is still reporting.'
        }
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      nativePlaybackRunning: false,
      nativePlaybackPaused: false,
      nativePlaybackState: 'stopped'
    })
    expect(service.getStatus().nativePlaybackSource).toBeUndefined()
  })

  it('caches remote media before sending native file playback commands', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-'))
    const onStatusChange = vi.fn()
    const fetchRemoteMedia = vi.fn().mockResolvedValue(
      new Response('native audio bytes', {
        status: 200,
        headers: {
          'Content-Length': '18',
          'Content-Type': 'audio/mpeg'
        }
      })
    )
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      onStatusChange,
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      const status = await service.playFile({
        url: 'https://song.test/path/native.mp3?token=abc',
        startSeconds: 3,
        volume: 0.5
      })

      expectRemoteCachingStartup(status, 'https://song.test/path/native.mp3?token=abc')
      await vi.waitFor(() => {
        expect(fetchRemoteMedia).toHaveBeenCalledWith(
          'https://song.test/path/native.mp3?token=abc',
          expect.objectContaining({
            method: 'GET'
          })
        )
      })
      expect(fetchRemoteMedia).toHaveBeenCalledWith(
        'https://song.test/path/native.mp3?token=abc',
        expect.objectContaining({
          method: 'GET'
        })
      )
      expect(new Headers(fetchRemoteMedia.mock.calls[0]?.[1]?.headers).get('Range')).toBe(
        'bytes=0-1048575'
      )
      await vi.waitFor(() => {
        expect(service.getStatus()).toMatchObject({
          nativePlaybackDownload: {
            state: 'cached',
            bytesReceived: 18,
            totalBytes: 18,
            rangeSupported: false,
            strategy: 'single-response'
          },
          reason: 'Native audio output playback is starting.'
        })
      })
      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          nativePlaybackDownload: expect.objectContaining({
            state: 'downloading',
            bytesReceived: 0
          })
        })
      )
      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          nativePlaybackDownload: expect.objectContaining({
            state: 'downloading',
            bytesReceived: 18,
            totalBytes: 18,
            rangeSupported: false,
            strategy: 'single-response'
          })
        })
      )

      const playCommand = await waitForRemotePlayCommand(fake)
      expect(playCommand).toMatchObject({
        type: 'playFile',
        payload: {
          startSeconds: 3,
          volume: 0.5
        }
      })
      const cachedPath = (playCommand?.payload as { path?: string } | undefined)?.path
      expect(cachedPath).toEqual(expect.stringMatching(/\.mp3$/))
      await expect(readFile(String(cachedPath), 'utf8')).resolves.toBe('native audio bytes')

      fake.stdout.write(
        JSON.stringify({
          type: 'playback',
          payload: {
            state: 'playing',
            running: true,
            paused: false,
            source: cachedPath,
            positionSeconds: 3.5,
            reason: 'Native file playback is running.'
          }
        }) + '\n'
      )

      expect(service.getStatus()).toMatchObject({
        nativePlaybackRunning: true,
        nativePlaybackSource: 'https://song.test/path/native.mp3?token=abc',
        nativePlaybackState: 'playing',
        nativePlaybackPositionSeconds: 3.5
      })

      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus({
            nativePlaybackRunning: false,
            nativePlaybackPaused: false,
            nativePlaybackSource: cachedPath,
            nativePlaybackState: 'ended',
            reason: 'Native file playback completed.'
          })
        }) + '\n'
      )

      const terminalStatus = service.getStatus()
      expect(terminalStatus).toMatchObject({
        nativePlaybackRunning: false,
        nativePlaybackSource: 'https://song.test/path/native.mp3?token=abc',
        nativePlaybackState: 'ended',
        reason: 'Native file playback completed.'
      })
      expect(terminalStatus.nativePlaybackDownload).toBeUndefined()
      expect(fake.commands().at(-1)).toEqual({ type: 'stopPlayback' })
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('keeps remote playback status visible as the original URL when helper status reports the cache file', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-visible-source-'))
    const fetchRemoteMedia = vi.fn().mockResolvedValue(
      new Response('native audio bytes', {
        status: 200,
        headers: {
          'Content-Length': '18',
          'Content-Type': 'audio/mpeg'
        }
      })
    )
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      await service.playFile({
        url: 'https://song.test/path/visible-source.mp3?token=abc',
        startSeconds: 9,
        volume: 0.5
      })

      const playCommand = await waitForRemotePlayCommand(fake)
      const playPayload = playCommand.payload as
        | { path?: string; playbackToken?: string }
        | undefined
      const cachedPath = playPayload?.path
      const playbackToken = playPayload?.playbackToken

      expect(cachedPath).toEqual(expect.stringMatching(/\.mp3$/))
      expect(playbackToken).toEqual(expect.stringMatching(/^native-playback-\d+$/))

      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus({
            nativePlaybackRunning: true,
            nativePlaybackPaused: false,
            nativePlaybackSource: cachedPath,
            nativePlaybackState: 'playing',
            nativePlaybackPositionSeconds: 9.25,
            nativePlaybackToken: playbackToken,
            reason: 'Shared native file playback is running.'
          })
        }) + '\n'
      )

      expect(service.getStatus()).toMatchObject({
        nativePlaybackRunning: true,
        nativePlaybackSource: 'https://song.test/path/visible-source.mp3?token=abc',
        nativePlaybackState: 'playing',
        nativePlaybackPositionSeconds: 9.25,
        nativePlaybackToken: playbackToken
      })

      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus({
            nativePlaybackRunning: false,
            nativePlaybackPaused: false,
            nativePlaybackSource: cachedPath,
            nativePlaybackState: 'ended',
            nativePlaybackPositionSeconds: 12,
            nativePlaybackToken: playbackToken,
            reason: 'Native file playback completed.'
          })
        }) + '\n'
      )

      const terminalStatus = service.getStatus()
      expect(terminalStatus).toMatchObject({
        nativePlaybackRunning: false,
        nativePlaybackSource: 'https://song.test/path/visible-source.mp3?token=abc',
        nativePlaybackState: 'ended',
        reason: 'Native file playback completed.'
      })
      expect(terminalStatus.nativePlaybackToken).toBeUndefined()
      expect(terminalStatus.nativePlaybackPositionSeconds).toBeUndefined()
      expect(terminalStatus.nativePlaybackDownload).toBeUndefined()
      expect(fake.commands().at(-1)).toEqual({ type: 'stopPlayback' })
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('passes sanitized remote request headers while caching native playback media', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-headers-'))
    const fetchRemoteMedia = vi.fn().mockResolvedValue(
      new Response('native audio bytes', {
        status: 200,
        headers: {
          'Content-Length': '18',
          'Content-Type': 'audio/mpeg'
        }
      })
    )
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      await service.playFile({
        url: 'https://song.test/path/native-auth.mp3',
        requestHeaders: {
          cookie: 'MUSIC_U=token',
          referer: 'https://music.example.test/',
          'user-agent': 'LUO Music Test',
          range: 'bytes=999-1000',
          host: 'evil.example.test'
        },
        startSeconds: 0,
        volume: 0.7
      })

      await vi.waitFor(() => {
        expect(fetchRemoteMedia).toHaveBeenCalled()
      })
      const headers = new Headers(fetchRemoteMedia.mock.calls[0]?.[1]?.headers)
      expect(headers.get('Cookie')).toBe('MUSIC_U=token')
      expect(headers.get('Referer')).toBe('https://music.example.test/')
      expect(headers.get('User-Agent')).toBe('LUO Music Test')
      expect(headers.get('Range')).toBe('bytes=0-1048575')
      expect(headers.get('Host')).toBeNull()
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('marks remote authorization failures as retryable native playback errors', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-auth-failed-'))
    const fetchRemoteMedia = vi.fn().mockResolvedValue(
      new Response('expired', {
        status: 403,
        headers: {
          'Content-Type': 'text/plain'
        }
      })
    )
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      const status = await service.playFile({
        url: 'https://song.test/path/expired.mp3',
        requestHeaders: {
          cookie: 'MUSIC_U=expired'
        }
      })

      expectRemoteCachingStartup(status, 'https://song.test/path/expired.mp3')
      await vi.waitFor(() => {
        expect(service.getStatus()).toMatchObject({
          backend: 'native',
          nativePlaybackRunning: false,
          nativePlaybackSource: 'https://song.test/path/expired.mp3',
          nativePlaybackState: 'error',
          nativePlaybackError: {
            code: 'remote-auth-expired',
            httpStatus: 403,
            retryable: true
          },
          reason:
            'Native audio output remote media authorization expired; refreshing the playback URL is required. HTTP 403.'
        })
      })
      expect(fake.commands().some(command => command.type === 'playFile')).toBe(false)
      await expect(readdir(cacheDir)).resolves.toEqual([])
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it.each([
    ['text/html', '<html>login</html>'],
    ['application/json; charset=utf-8', '{"error":"login required"}']
  ])(
    'rejects non-audio remote media content type %s before native playback',
    async (contentType, body) => {
      const fake = createFakeHelper()
      const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-content-type-'))
      const fetchRemoteMedia = vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: {
            'Content-Length': String(body.length),
            'Content-Type': contentType
          }
        })
      )
      const service = new AudioOutputService({
        cacheDir,
        exists: () => true,
        fetchRemoteMedia,
        logger: createLoggerMock(),
        platform: 'win32',
        spawnHelper: vi.fn(() => fake.helper)
      })

      try {
        service.setEnabled(true)
        fake.stdout.write(
          JSON.stringify({
            type: 'status',
            payload: createStatus()
          }) + '\n'
        )

        const status = await service.playFile({
          url: 'https://song.test/path/native.mp3'
        })

        expectRemoteCachingStartup(status, 'https://song.test/path/native.mp3')
        await vi.waitFor(() => {
          expect(service.getStatus()).toMatchObject({
            backend: 'native',
            nativePlaybackRunning: false,
            nativePlaybackSource: 'https://song.test/path/native.mp3',
            nativePlaybackState: 'error',
            nativePlaybackError: {
              code: 'remote-cache-failed',
              nativeMessage: expect.stringContaining(
                'remote media response content type is not audio'
              ),
              retryable: false
            },
            reason: expect.stringContaining('remote media response content type is not audio')
          })
        })
        expect(fake.commands().some(command => command.type === 'playFile')).toBe(false)
        await expect(readdir(cacheDir)).resolves.toEqual([])
      } finally {
        await rm(cacheDir, { recursive: true, force: true })
      }
    }
  )

  it('defaults remote media caching to Electron net.fetch when available', async () => {
    const netFetch = vi.fn().mockResolvedValue(
      new Response('electron net bytes', {
        status: 200,
        headers: {
          'Content-Length': '18',
          'Content-Type': 'audio/mpeg'
        }
      })
    )
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-electron-net-cache-'))
    const service = new AudioOutputService({
      cacheDir,
      electronNet: {
        fetch: netFetch
      },
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      await service.playFile({
        url: 'https://song.test/path/electron-net.mp3'
      })

      await vi.waitFor(() => {
        expect(netFetch).toHaveBeenCalledWith('https://song.test/path/electron-net.mp3', {
          headers: expect.any(Headers),
          method: 'GET',
          redirect: 'follow',
          signal: expect.any(AbortSignal)
        })
      })
      expect(netFetch).toHaveBeenCalledWith('https://song.test/path/electron-net.mp3', {
        headers: expect.any(Headers),
        method: 'GET',
        redirect: 'follow',
        signal: expect.any(AbortSignal)
      })
      expect(new Headers(netFetch.mock.calls[0]?.[1]?.headers).get('Range')).toBe('bytes=0-1048575')
      const playCommand = await waitForRemotePlayCommand(fake)
      const cachedPath = (playCommand?.payload as { path?: string } | undefined)?.path
      await expect(readFile(String(cachedPath), 'utf8')).resolves.toBe('electron net bytes')
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('preserves helper-covered cache extensions from remote URL paths', async () => {
    for (const extension of ['.ape', '.m2a', '.oga']) {
      const fake = createFakeHelper()
      const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-'))
      const fetchRemoteMedia = vi.fn().mockResolvedValue(
        new Response(`remote ${extension} bytes`, {
          status: 200,
          headers: {
            'Content-Length': String(`remote ${extension} bytes`.length),
            'Content-Type': 'application/octet-stream'
          }
        })
      )
      const service = new AudioOutputService({
        cacheDir,
        exists: () => true,
        fetchRemoteMedia,
        logger: createLoggerMock(),
        platform: 'win32',
        spawnHelper: vi.fn(() => fake.helper)
      })

      try {
        service.setEnabled(true)
        fake.stdout.write(
          JSON.stringify({
            type: 'status',
            payload: createStatus()
          }) + '\n'
        )

        await service.playFile({
          url: `https://song.test/path/native-track${extension}?token=abc`
        })

        const playCommand = await waitForRemotePlayCommand(fake)
        const cachedPath = (playCommand?.payload as { path?: string } | undefined)?.path

        expect(cachedPath).toEqual(expect.stringMatching(new RegExp(`\\${extension}$`)))
        await expect(readFile(String(cachedPath), 'utf8')).resolves.toBe(
          `remote ${extension} bytes`
        )
      } finally {
        await rm(cacheDir, { recursive: true, force: true })
      }
    }
  })

  it('cleans stale remote cache files when a new playback request starts', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-'))
    const fetchRemoteMedia = vi.fn().mockResolvedValue(
      new Response('first remote bytes', {
        status: 200,
        headers: {
          'Content-Length': '18',
          'Content-Type': 'audio/mpeg'
        }
      })
    )
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      await service.playFile({
        url: 'https://song.test/path/first.mp3'
      })

      const remotePlayCommand = await waitForRemotePlayCommand(fake)
      const cachedPath = (remotePlayCommand?.payload as { path?: string } | undefined)?.path
      expect(cachedPath).toEqual(expect.stringMatching(/\.mp3$/))
      await expect(readdir(cacheDir)).resolves.toHaveLength(1)

      service.playFile({
        path: 'D:\\Music\\next.wav'
      })

      expect(fake.commands().at(-1)).toMatchObject({
        type: 'playFile',
        payload: {
          path: 'D:\\Music\\next.wav'
        }
      })
      await vi.waitFor(async () => {
        await expect(readdir(cacheDir)).resolves.toEqual([])
      })
      await expect(readFile(String(cachedPath), 'utf8')).rejects.toThrow(/ENOENT/)
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('removes untracked stale remote cache files before caching new media', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-'))
    await writeFile(join(cacheDir, 'stale-crash-cache.mp3'), 'stale bytes')
    const fetchRemoteMedia = vi.fn().mockResolvedValue(
      new Response('fresh remote bytes', {
        status: 200,
        headers: {
          'Content-Length': '18',
          'Content-Type': 'audio/mpeg'
        }
      })
    )
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      await service.playFile({
        url: 'https://song.test/path/fresh.mp3'
      })

      const playCommand = await waitForRemotePlayCommand(fake)
      const cachedPath = (playCommand?.payload as { path?: string } | undefined)?.path
      let cacheEntries: string[] = []
      await vi.waitFor(async () => {
        cacheEntries = await readdir(cacheDir)
        expect(cacheEntries).toHaveLength(1)
      })

      expect(cacheEntries).toHaveLength(1)
      expect(cacheEntries).not.toContain('stale-crash-cache.mp3')
      await expect(readFile(String(cachedPath), 'utf8')).resolves.toBe('fresh remote bytes')
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('records remote range support from content-range responses', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-'))
    const fetchRemoteMedia = vi.fn().mockResolvedValue(
      new Response('partial bytes', {
        status: 206,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': '13',
          'Content-Range': 'bytes 0-12/13',
          'Content-Type': 'audio/flac'
        }
      })
    )
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      const status = await service.playFile({
        url: 'https://song.test/path/range.flac'
      })

      expectRemoteCachingStartup(status, 'https://song.test/path/range.flac')
      await vi.waitFor(() => {
        expect(fetchRemoteMedia).toHaveBeenCalled()
      })
      expect(new Headers(fetchRemoteMedia.mock.calls[0]?.[1]?.headers).get('Range')).toBe(
        'bytes=0-1048575'
      )
      await vi.waitFor(() => {
        expect(service.getStatus()).toMatchObject({
          nativePlaybackDownload: {
            state: 'cached',
            bytesReceived: 13,
            totalBytes: 13,
            rangeSupported: true,
            strategy: 'range-chunk'
          }
        })
      })

      const playCommand = await waitForRemotePlayCommand(fake)
      const cachedPath = (playCommand?.payload as { path?: string } | undefined)?.path
      await expect(readFile(String(cachedPath), 'utf8')).resolves.toBe('partial bytes')
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('falls back to a complete remote fetch when range responses hide total size', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-unknown-range-'))
    const fetchRemoteMedia = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('part', {
          status: 206,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': '4',
            'Content-Range': 'bytes 0-3/*',
            'Content-Type': 'audio/mpeg'
          }
        })
      )
      .mockResolvedValueOnce(
        new Response('complete audio bytes', {
          status: 200,
          headers: {
            'Content-Length': '20',
            'Content-Type': 'audio/mpeg'
          }
        })
      )
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      remoteRangeChunkBytes: 4,
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      const status = await service.playFile({
        url: 'https://song.test/path/unknown-total.mp3'
      })

      expectRemoteCachingStartup(status, 'https://song.test/path/unknown-total.mp3')
      const playCommand = await waitForRemotePlayCommand(fake)

      expect(fetchRemoteMedia).toHaveBeenCalledTimes(2)
      expect(new Headers(fetchRemoteMedia.mock.calls[0]?.[1]?.headers).get('Range')).toBe(
        'bytes=0-3'
      )
      expect(new Headers(fetchRemoteMedia.mock.calls[1]?.[1]?.headers).get('Range')).toBeNull()
      expect(service.getStatus()).toMatchObject({
        nativePlaybackDownload: {
          state: 'cached',
          bytesReceived: 20,
          totalBytes: 20,
          rangeSupported: false,
          strategy: 'single-response'
        }
      })

      const cachedPath = (playCommand?.payload as { path?: string } | undefined)?.path
      await expect(readFile(String(cachedPath), 'utf8')).resolves.toBe('complete audio bytes')
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('starts range-supported remote playback after the first cache chunk', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-'))
    const media = 'abcdefghijkl'
    const fetchRemoteMedia = vi.fn((_url: string, init?: RequestInit) => {
      const range = new Headers(init?.headers).get('Range')
      const matched = /^bytes=(\d+)-(\d+)$/.exec(range ?? '')
      if (!matched) {
        return Promise.resolve(new Response('missing range', { status: 400 }))
      }

      const start = Number.parseInt(matched[1] ?? '0', 10)
      const end = Math.min(Number.parseInt(matched[2] ?? '0', 10), media.length - 1)
      if (start > 0) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'))
          })
        })
      }

      const body = media.slice(start, end + 1)
      return Promise.resolve(
        new Response(body, {
          status: 206,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(body.length),
            'Content-Range': `bytes ${start}-${end}/${media.length}`,
            'Content-Type': 'audio/mpeg'
          }
        })
      )
    })
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      remoteRangeChunkBytes: 4,
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      const status = await service.playFile({
        url: 'https://song.test/path/progressive.mp3',
        startSeconds: 1,
        volume: 0.75
      })

      expectRemoteCachingStartup(status, 'https://song.test/path/progressive.mp3')
      await vi.waitFor(() => {
        expect(fetchRemoteMedia).toHaveBeenCalledTimes(2)
      })
      expect(
        fetchRemoteMedia.mock.calls.map(([, init]) => new Headers(init?.headers).get('Range'))
      ).toEqual(['bytes=0-3', 'bytes=4-7'])
      await vi.waitFor(() => {
        expect(service.getStatus()).toMatchObject({
          nativePlaybackDownload: {
            state: 'downloading',
            bytesReceived: 4,
            totalBytes: media.length,
            rangeSupported: true,
            strategy: 'range-chunk'
          },
          reason: 'Native audio output playback is starting while remote media continues caching.'
        })
      })

      const playCommand = await waitForRemotePlayCommand(fake)
      expect(playCommand).toMatchObject({
        type: 'playFile',
        payload: {
          startSeconds: 1,
          volume: 0.75,
          growingExpectedBytes: media.length
        }
      })
      const cachedPath = (playCommand?.payload as { path?: string } | undefined)?.path
      await expect(readFile(String(cachedPath), 'utf8')).resolves.toBe('abcd')

      service.stopPlayback()
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('fully caches APE range responses before starting native playback', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-ape-'))
    const media = 'abcdefghijkl'
    const fetchRemoteMedia = vi.fn((_url: string, init?: RequestInit) => {
      const range = new Headers(init?.headers).get('Range')
      const matched = /^bytes=(\d+)-(\d+)$/.exec(range ?? '')
      if (!matched) {
        return Promise.resolve(new Response('missing range', { status: 400 }))
      }

      const start = Number.parseInt(matched[1] ?? '0', 10)
      const end = Math.min(Number.parseInt(matched[2] ?? '0', 10), media.length - 1)
      const body = media.slice(start, end + 1)

      return Promise.resolve(
        new Response(body, {
          status: 206,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(body.length),
            'Content-Range': `bytes ${start}-${end}/${media.length}`,
            'Content-Type': 'audio/ape'
          }
        })
      )
    })
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      remoteRangeChunkBytes: 4,
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      const status = await service.playFile({
        url: 'https://song.test/path/native-stream',
        startSeconds: 1,
        volume: 0.75
      })

      expectRemoteCachingStartup(status, 'https://song.test/path/native-stream')
      await vi.waitFor(() => {
        expect(
          fetchRemoteMedia.mock.calls.map(([, init]) => new Headers(init?.headers).get('Range'))
        ).toEqual(['bytes=0-3', 'bytes=4-7', 'bytes=8-11'])
      })
      await vi.waitFor(() => {
        expect(service.getStatus()).toMatchObject({
          nativePlaybackDownload: {
            state: 'cached',
            bytesReceived: media.length,
            totalBytes: media.length,
            rangeSupported: true,
            strategy: 'range-chunk'
          },
          reason: 'Native audio output playback is starting.'
        })
      })

      const playCommand = await waitForRemotePlayCommand(fake)
      expect(playCommand).toMatchObject({
        type: 'playFile',
        payload: {
          startSeconds: 1,
          volume: 0.75
        }
      })
      expect(playCommand?.payload).not.toHaveProperty('growingExpectedBytes')
      const cachedPath = (playCommand?.payload as { path?: string } | undefined)?.path
      expect(cachedPath).toEqual(expect.stringMatching(/\.ape$/))
      await expect(readFile(String(cachedPath), 'utf8')).resolves.toBe(media)

      service.stopPlayback()
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('fully caches range responses before playback when bit-perfect output is required', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-bit-perfect-'))
    const media = 'abcdefghijkl'
    const fetchRemoteMedia = vi.fn((_url: string, init?: RequestInit) => {
      const range = new Headers(init?.headers).get('Range')
      const matched = /^bytes=(\d+)-(\d+)$/.exec(range ?? '')
      if (!matched) {
        return Promise.resolve(new Response('missing range', { status: 400 }))
      }

      const start = Number.parseInt(matched[1] ?? '0', 10)
      const end = Math.min(Number.parseInt(matched[2] ?? '0', 10), media.length - 1)
      const body = media.slice(start, end + 1)

      return Promise.resolve(
        new Response(body, {
          status: 206,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(body.length),
            'Content-Range': `bytes ${start}-${end}/${media.length}`,
            'Content-Type': 'audio/mpeg'
          }
        })
      )
    })
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      remoteRangeChunkBytes: 4,
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true, {
        mode: 'exclusive',
        sharedDeviceId: '',
        deviceId: '0:Speakers',
        bufferFrames: 512,
        fallbackToShared: false,
        bitPerfectRequired: true,
        voicemeeterBus: 'A1',
        diagnosticsEnabled: true
      })
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus({
            requestedMode: 'exclusive',
            activeMode: 'exclusive',
            deviceId: '0:Speakers'
          })
        }) + '\n'
      )

      const status = await service.playFile({
        url: 'https://song.test/path/native-bit-perfect.mp3',
        startSeconds: 1,
        volume: 1
      })

      expectRemoteCachingStartup(status, 'https://song.test/path/native-bit-perfect.mp3')
      await vi.waitFor(() => {
        expect(
          fetchRemoteMedia.mock.calls.map(([, init]) => new Headers(init?.headers).get('Range'))
        ).toEqual(['bytes=0-3', 'bytes=4-7', 'bytes=8-11'])
      })
      await vi.waitFor(() => {
        expect(service.getStatus()).toMatchObject({
          nativePlaybackDownload: {
            state: 'cached',
            bytesReceived: media.length,
            totalBytes: media.length,
            rangeSupported: true,
            strategy: 'range-chunk'
          },
          reason: 'Native audio output playback is starting.'
        })
      })

      const playCommand = await waitForRemotePlayCommand(fake)
      expect(playCommand).toMatchObject({
        type: 'playFile',
        payload: {
          startSeconds: 1,
          volume: 1
        }
      })
      expect(playCommand?.payload).not.toHaveProperty('growingExpectedBytes')
      const cachedPath = (playCommand?.payload as { path?: string } | undefined)?.path
      expect(cachedPath).toEqual(expect.stringMatching(/\.mp3$/))
      await expect(readFile(String(cachedPath), 'utf8')).resolves.toBe(media)

      service.stopPlayback()
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it.each(['exclusive', 'voicemeeter'] as const)(
    'fully caches range responses before remote playback in %s mode',
    async mode => {
      const fake = createFakeHelper()
      const cacheDir = await mkdtemp(join(tmpdir(), `luo-audio-output-cache-${mode}-`))
      const media = 'abcdefghijkl'
      const fetchRemoteMedia = vi.fn((_url: string, init?: RequestInit) => {
        const range = new Headers(init?.headers).get('Range')
        const matched = /^bytes=(\d+)-(\d+)$/.exec(range ?? '')
        if (!matched) {
          return Promise.resolve(new Response('missing range', { status: 400 }))
        }

        const start = Number.parseInt(matched[1] ?? '0', 10)
        const end = Math.min(Number.parseInt(matched[2] ?? '0', 10), media.length - 1)
        const body = media.slice(start, end + 1)

        return Promise.resolve(
          new Response(body, {
            status: 206,
            headers: {
              'Accept-Ranges': 'bytes',
              'Content-Length': String(body.length),
              'Content-Range': `bytes ${start}-${end}/${media.length}`,
              'Content-Type': 'audio/mpeg'
            }
          })
        )
      })
      const service = new AudioOutputService({
        cacheDir,
        exists: () => true,
        fetchRemoteMedia,
        logger: createLoggerMock(),
        platform: 'win32',
        remoteRangeChunkBytes: 4,
        spawnHelper: vi.fn(() => fake.helper)
      })

      try {
        service.setEnabled(true, {
          mode,
          sharedDeviceId: '',
          deviceId: mode === 'voicemeeter' ? 'VoiceMeeter Input' : '0:Speakers',
          bufferFrames: 512,
          fallbackToShared: true,
          bitPerfectRequired: false,
          voicemeeterBus: 'A1',
          diagnosticsEnabled: true
        })
        fake.stdout.write(
          JSON.stringify({
            type: 'status',
            payload: createStatus({
              requestedMode: mode,
              activeMode: mode,
              deviceId: mode === 'voicemeeter' ? 'VoiceMeeter Input' : '0:Speakers'
            })
          }) + '\n'
        )

        const status = await service.playFile({
          url: `https://song.test/path/native-${mode}.mp3`,
          startSeconds: 1,
          volume: 0.75
        })

        expectRemoteCachingStartup(status, `https://song.test/path/native-${mode}.mp3`)
        await vi.waitFor(() => {
          expect(
            fetchRemoteMedia.mock.calls.map(([, init]) => new Headers(init?.headers).get('Range'))
          ).toEqual(['bytes=0-3', 'bytes=4-7', 'bytes=8-11'])
        })
        await vi.waitFor(() => {
          expect(service.getStatus()).toMatchObject({
            nativePlaybackDownload: {
              state: 'cached',
              bytesReceived: media.length,
              totalBytes: media.length,
              rangeSupported: true,
              strategy: 'range-chunk'
            },
            reason:
              mode === 'voicemeeter'
                ? 'Native audio output is waiting for Voicemeeter route before playback.'
                : 'Native audio output playback is starting.'
          })
        })
        const playCommandCountBeforeRouteReady = fake
          .commands()
          .filter(command => command.type === 'playFile').length
        expect(playCommandCountBeforeRouteReady).toBe(mode === 'voicemeeter' ? 0 : 1)
        if (mode === 'voicemeeter') {
          fake.stdout.write(
            JSON.stringify({
              type: 'status',
              payload: createStatus({
                requestedMode: 'voicemeeter',
                activeMode: 'voicemeeter',
                deviceId: 'VoiceMeeter Input',
                voicemeeterRemote: {
                  available: true,
                  connected: true,
                  routeApplied: true,
                  routeManaged: true,
                  routeBus: 'A1',
                  kind: 'banana',
                  virtualInputStrip: 3
                }
              })
            }) + '\n'
          )
        }

        const playCommand = await waitForRemotePlayCommand(fake)
        expect(playCommand).toMatchObject({
          type: 'playFile',
          payload: {
            startSeconds: 1,
            volume: 0.75
          }
        })
        expect(playCommand?.payload).not.toHaveProperty('growingExpectedBytes')
        const cachedPath = (playCommand?.payload as { path?: string } | undefined)?.path
        expect(cachedPath).toEqual(expect.stringMatching(/\.mp3$/))
        await expect(readFile(String(cachedPath), 'utf8')).resolves.toBe(media)

        service.stopPlayback()
      } finally {
        await rm(cacheDir, { recursive: true, force: true })
      }
    }
  )

  it('marks background range authorization failures as retryable native playback errors', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-range-auth-'))
    const media = 'abcdefgh'
    const fetchRemoteMedia = vi.fn((_url: string, init?: RequestInit) => {
      const range = new Headers(init?.headers).get('Range')
      const matched = /^bytes=(\d+)-(\d+)$/.exec(range ?? '')
      if (!matched) {
        return Promise.resolve(new Response('missing range', { status: 400 }))
      }

      const start = Number.parseInt(matched[1] ?? '0', 10)
      const end = Math.min(Number.parseInt(matched[2] ?? '0', 10), media.length - 1)
      if (start > 0) {
        return Promise.resolve(
          new Response('expired', {
            status: 403,
            headers: {
              'Content-Type': 'text/plain'
            }
          })
        )
      }

      const body = media.slice(start, end + 1)
      return Promise.resolve(
        new Response(body, {
          status: 206,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(body.length),
            'Content-Range': `bytes ${start}-${end}/${media.length}`,
            'Content-Type': 'audio/mpeg'
          }
        })
      )
    })
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      remoteRangeChunkBytes: 4,
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      await service.playFile({
        url: 'https://song.test/path/range-expired.mp3'
      })

      await vi.waitFor(() => {
        expect(service.getStatus()).toMatchObject({
          nativePlaybackRunning: false,
          nativePlaybackSource: 'https://song.test/path/range-expired.mp3',
          nativePlaybackState: 'error',
          nativePlaybackError: {
            code: 'remote-auth-expired',
            httpStatus: 403,
            retryable: true
          },
          reason:
            'Native audio output remote media authorization expired; refreshing the playback URL is required. HTTP 403.'
        })
      })
      expect(fake.commands().at(-1)).toEqual({ type: 'stopPlayback' })
      await vi.waitFor(async () => {
        await expect(readdir(cacheDir)).resolves.toEqual([])
      })
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('rejects non-audio background range chunks before appending them to cache', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-range-content-type-'))
    const media = 'abcdefgh'
    const fetchRemoteMedia = vi.fn((_url: string, init?: RequestInit) => {
      const range = new Headers(init?.headers).get('Range')
      const matched = /^bytes=(\d+)-(\d+)$/.exec(range ?? '')
      if (!matched) {
        return Promise.resolve(new Response('missing range', { status: 400 }))
      }

      const start = Number.parseInt(matched[1] ?? '0', 10)
      const end = Math.min(Number.parseInt(matched[2] ?? '0', 10), media.length - 1)
      if (start > 0) {
        return Promise.resolve(
          new Response('<html>login</html>', {
            status: 206,
            headers: {
              'Accept-Ranges': 'bytes',
              'Content-Length': '18',
              'Content-Range': `bytes ${start}-${end}/${media.length}`,
              'Content-Type': 'text/html'
            }
          })
        )
      }

      const body = media.slice(start, end + 1)
      return Promise.resolve(
        new Response(body, {
          status: 206,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(body.length),
            'Content-Range': `bytes ${start}-${end}/${media.length}`,
            'Content-Type': 'audio/mpeg'
          }
        })
      )
    })
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      remoteRangeChunkBytes: 4,
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      await service.playFile({
        url: 'https://song.test/path/range-login-page.mp3'
      })

      await vi.waitFor(() => {
        expect(service.getStatus()).toMatchObject({
          nativePlaybackRunning: false,
          nativePlaybackSource: 'https://song.test/path/range-login-page.mp3',
          nativePlaybackState: 'error',
          nativePlaybackError: {
            code: 'remote-cache-failed',
            nativeMessage: expect.stringContaining(
              'remote media range response content type is not audio'
            ),
            retryable: false
          },
          reason: expect.stringContaining('remote media range response content type is not audio')
        })
      })
      expect(fake.commands().at(-1)).toEqual({ type: 'stopPlayback' })
      await vi.waitFor(async () => {
        await expect(readdir(cacheDir)).resolves.toEqual([])
      })
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('downloads range-supported remote media in multiple chunks', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-'))
    const media = 'native-range-bytes!'
    const fetchRemoteMedia = vi.fn((_url: string, init?: RequestInit) => {
      const range = new Headers(init?.headers).get('Range')
      const matched = /^bytes=(\d+)-(\d+)$/.exec(range ?? '')
      if (!matched) {
        return Promise.resolve(new Response('missing range', { status: 400 }))
      }

      const start = Number.parseInt(matched[1] ?? '0', 10)
      const end = Math.min(Number.parseInt(matched[2] ?? '0', 10), media.length - 1)
      const body = media.slice(start, end + 1)
      return Promise.resolve(
        new Response(body, {
          status: 206,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(body.length),
            'Content-Range': `bytes ${start}-${end}/${media.length}`,
            'Content-Type': 'audio/mpeg'
          }
        })
      )
    })
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      remoteRangeChunkBytes: 6,
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      const status = await service.playFile({
        url: 'https://song.test/path/chunked.mp3'
      })

      expectRemoteCachingStartup(status, 'https://song.test/path/chunked.mp3')
      await waitForRemotePlayCommand(fake)

      await vi.waitFor(() => {
        expect(fetchRemoteMedia).toHaveBeenCalledTimes(4)
      })
      expect(
        fetchRemoteMedia.mock.calls.map(([, init]) => new Headers(init?.headers).get('Range'))
      ).toEqual(['bytes=0-5', 'bytes=6-11', 'bytes=12-17', 'bytes=18-18'])

      await vi.waitFor(() => {
        expect(service.getStatus()).toMatchObject({
          nativePlaybackDownload: {
            state: 'cached',
            bytesReceived: media.length,
            totalBytes: media.length,
            rangeSupported: true,
            strategy: 'range-chunk'
          }
        })
      })
      expect(service.getStatus()).toMatchObject({
        nativePlaybackDownload: {
          state: 'cached',
          bytesReceived: media.length,
          totalBytes: media.length,
          rangeSupported: true,
          strategy: 'range-chunk'
        }
      })

      const playCommand = await waitForRemotePlayCommand(fake)
      const cachedPath = (playCommand?.payload as { path?: string } | undefined)?.path
      await expect(readFile(String(cachedPath), 'utf8')).resolves.toBe(media)
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('aborts remote media caching when playback stops before download completes', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-'))
    let capturedInit: RequestInit | undefined
    let resolveFetch!: (response: Response) => void
    let resolveFetchStarted!: () => void
    const fetchStarted = new Promise<void>(resolve => {
      resolveFetchStarted = resolve
    })
    const fetchRemoteMedia = vi.fn((_url: string, init?: RequestInit) => {
      capturedInit = init
      resolveFetchStarted()
      return new Promise<Response>(resolve => {
        resolveFetch = resolve
      })
    })
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      const status = service.playFile({
        url: 'https://song.test/path/slow.flac'
      }) as AudioOutputStatus

      expectRemoteCachingStartup(status, 'https://song.test/path/slow.flac')
      await fetchStarted
      expect(fetchRemoteMedia).toHaveBeenCalledOnce()
      expect(capturedInit?.signal?.aborted).toBe(false)

      const stopStatus = service.stopPlayback()

      expect(capturedInit?.signal?.aborted).toBe(true)
      expect(stopStatus).toMatchObject({
        nativePlaybackRunning: false,
        nativePlaybackState: 'stopped',
        nativePlaybackSource: undefined
      })

      resolveFetch(
        new Response('late native bytes', {
          status: 200,
          headers: {
            'Content-Length': '17',
            'Content-Type': 'audio/flac'
          }
        })
      )

      await vi.waitFor(() => {
        expect(service.getStatus()).toMatchObject({
          nativePlaybackRunning: false,
          nativePlaybackState: 'stopped',
          nativePlaybackSource: undefined
        })
      })
      expect(service.getStatus()).toMatchObject({
        nativePlaybackRunning: false,
        nativePlaybackState: 'stopped',
        nativePlaybackSource: undefined
      })
      expect(fake.commands().some(command => command.type === 'playFile')).toBe(false)
      await expect(readdir(cacheDir)).resolves.toEqual([])
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('rejects content-type-inferred optional remote codecs until the helper reports support', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-'))
    const fetchRemoteMedia = vi.fn().mockResolvedValue(
      new Response('opus bytes', {
        status: 200,
        headers: {
          'Content-Length': '10',
          'Content-Type': 'audio/opus'
        }
      })
    )
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus()
        }) + '\n'
      )

      const status = await service.playFile({
        url: 'https://song.test/native-stream?format=opus'
      })

      expectRemoteCachingStartup(status, 'https://song.test/native-stream?format=opus')
      await vi.waitFor(() => {
        expect(service.getStatus()).toMatchObject({
          backend: 'native',
          nativePlaybackRunning: false,
          nativePlaybackSource: 'https://song.test/native-stream?format=opus',
          nativePlaybackState: 'error',
          nativePlaybackError: {
            code: 'remote-unsupported-codec',
            nativeMessage: expect.stringContaining('helper did not report support'),
            retryable: false
          },
          reason: expect.stringContaining('helper did not report support')
        })
      })
      expect(fake.commands().some(command => command.type === 'playFile')).toBe(false)
      await expect(readdir(cacheDir)).resolves.toEqual([])
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('infers opus cache extension from remote media content type after helper support is reported', async () => {
    const fake = createFakeHelper()
    const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-'))
    const fetchRemoteMedia = vi.fn().mockResolvedValue(
      new Response('opus bytes', {
        status: 200,
        headers: {
          'Content-Length': '10',
          'Content-Type': 'audio/opus'
        }
      })
    )
    const service = new AudioOutputService({
      cacheDir,
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    try {
      service.setEnabled(true)
      fake.stdout.write(
        JSON.stringify({
          type: 'status',
          payload: createStatus({
            supportedExtensions: ['.opus']
          })
        }) + '\n'
      )

      await service.playFile({
        url: 'https://song.test/native-stream?format=opus'
      })

      const playCommand = await waitForRemotePlayCommand(fake)
      const cachedPath = (playCommand?.payload as { path?: string } | undefined)?.path

      expect(cachedPath).toEqual(expect.stringMatching(/\.opus$/))
      await expect(readFile(String(cachedPath), 'utf8')).resolves.toBe('opus bytes')
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('infers extended Symphonia cache extensions from remote media content types', async () => {
    const cases = [
      { contentType: 'audio/aiff', expectedExtension: '.aiff' },
      { contentType: 'audio/x-ape', expectedExtension: '.ape' },
      { contentType: 'audio/x-caf', expectedExtension: '.caf' },
      { contentType: 'audio/x-matroska', expectedExtension: '.mka' },
      { contentType: 'audio/mp2', expectedExtension: '.mp2' },
      { contentType: 'audio/x-mpa', expectedExtension: '.mpa' },
      { contentType: 'audio/oga', expectedExtension: '.oga' }
    ]

    for (const { contentType, expectedExtension } of cases) {
      const fake = createFakeHelper()
      const cacheDir = await mkdtemp(join(tmpdir(), 'luo-audio-output-cache-'))
      const fetchRemoteMedia = vi.fn().mockResolvedValue(
        new Response(`bytes:${contentType}`, {
          status: 200,
          headers: {
            'Content-Length': String(`bytes:${contentType}`.length),
            'Content-Type': contentType
          }
        })
      )
      const service = new AudioOutputService({
        cacheDir,
        exists: () => true,
        fetchRemoteMedia,
        logger: createLoggerMock(),
        platform: 'win32',
        spawnHelper: vi.fn(() => fake.helper)
      })

      try {
        service.setEnabled(true)
        fake.stdout.write(
          JSON.stringify({
            type: 'status',
            payload: createStatus()
          }) + '\n'
        )

        await service.playFile({
          url: `https://song.test/native-stream?format=${encodeURIComponent(contentType)}`
        })

        const playCommand = await waitForRemotePlayCommand(fake)
        const cachedPath = (playCommand?.payload as { path?: string } | undefined)?.path

        expect(cachedPath).toEqual(expect.stringMatching(new RegExp(`\\${expectedExtension}$`)))
        await expect(readFile(String(cachedPath), 'utf8')).resolves.toBe(`bytes:${contentType}`)
      } finally {
        await rm(cacheDir, { recursive: true, force: true })
      }
    }
  })

  it('rejects remote native playback requests to blocked local network hosts', async () => {
    const fake = createFakeHelper()
    const fetchRemoteMedia = vi.fn()
    const service = new AudioOutputService({
      exists: () => true,
      fetchRemoteMedia,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)

    const status = await service.playFile({
      url: 'http://127.0.0.1/song.mp3'
    })

    expect(fetchRemoteMedia).not.toHaveBeenCalled()
    expect(status).toMatchObject({
      backend: 'unavailable',
      nativePlaybackRunning: false,
      nativePlaybackSource: 'http://127.0.0.1/song.mp3',
      nativePlaybackState: 'error',
      reason: 'Native audio output remote URL is unsupported or blocked.'
    })
  })

  it('sends native playback control and volume commands', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus()
      }) + '\n'
    )
    service.playFile({
      path: 'D:\\Music\\track.wav',
      startSeconds: 4,
      volume: 0.4
    })

    expect(service.pausePlayback()).toMatchObject({
      nativePlaybackRunning: true,
      nativePlaybackPaused: true,
      nativePlaybackState: 'paused'
    })
    expect(service.resumePlayback()).toMatchObject({
      nativePlaybackRunning: true,
      nativePlaybackPaused: false,
      nativePlaybackState: 'playing'
    })
    expect(service.setPlaybackVolume({ volume: '-1' } as never)).toMatchObject({
      backend: 'native'
    })
    expect(service.stopPlayback()).toMatchObject({
      nativePlaybackRunning: false,
      nativePlaybackPaused: false,
      nativePlaybackSource: undefined,
      nativePlaybackState: 'stopped'
    })
    expect(fake.commands().slice(-4)).toEqual([
      { type: 'pausePlayback' },
      { type: 'resumePlayback' },
      { type: 'setPlaybackVolume', payload: { volume: 0 } },
      { type: 'stopPlayback' }
    ])
  })

  it('waits for helper playback stop before resolving settled stop', async () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus()
      }) + '\n'
    )
    service.playFile({
      path: 'D:\\Music\\track.wav',
      startSeconds: 0,
      volume: 1
    })

    let resolved = false
    const settledStop = service.stopPlaybackSettled().then(status => {
      resolved = true
      return status
    })

    await Promise.resolve()

    expect(resolved).toBe(false)
    expect(fake.commands().at(-1)).toEqual({ type: 'stopPlayback' })

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          nativePlaybackRunning: false,
          nativePlaybackState: 'stopped',
          reason: 'Native playback stopped.'
        })
      }) + '\n'
    )

    await expect(settledStop).resolves.toMatchObject({
      nativePlaybackRunning: false,
      nativePlaybackState: 'stopped'
    })
    expect(resolved).toBe(true)
  })

  it('stops playback and waits for graceful helper shutdown during dispose', async () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus()
      }) + '\n'
    )
    service.playFile({
      path: 'D:\\Music\\track.wav',
      startSeconds: 0,
      volume: 1
    })

    const disposePromise = service.dispose()

    expect(fake.commands().slice(-2)).toEqual([{ type: 'stopPlayback' }, { type: 'shutdown' }])
    expect(fake.helper.kill).not.toHaveBeenCalled()

    fake.helper.emit('exit', 0, null)
    await disposePromise

    expect(fake.helper.kill).not.toHaveBeenCalled()
    expect(service.getStatus()).toMatchObject({
      enabled: false,
      backend: 'disabled'
    })
  })

  it('clears stale active exclusive mode after native playback reports an error', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'exclusive',
          activeMode: 'exclusive',
          deviceId: '0:Speakers',
          nativePlaybackRunning: true,
          nativePlaybackState: 'playing',
          reason: 'WASAPI exclusive native file playback is running.'
        })
      }) + '\n'
    )

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'error',
          running: false,
          paused: false,
          source: 'D:\\Music\\track.wav',
          nativePlaybackError: {
            code: 'wasapi-exclusive-failed',
            nativeErrorCode: 'AUDCLNT_E_DEVICE_IN_USE',
            retryable: false
          },
          reason:
            'Native WASAPI exclusive file playback failed: AUDCLNT_E_DEVICE_IN_USE: device busy'
        }
      }) + '\n'
    )

    const status = service.getStatus()
    expect(status).toMatchObject({
      enabled: true,
      backend: 'native',
      requestedMode: 'exclusive',
      nativePlaybackRunning: false,
      nativePlaybackState: 'error',
      nativePlaybackError: {
        code: 'wasapi-exclusive-failed',
        nativeErrorCode: 'AUDCLNT_E_DEVICE_IN_USE',
        retryable: false
      },
      reason: 'Native WASAPI exclusive file playback failed: AUDCLNT_E_DEVICE_IN_USE: device busy'
    })
    expect(status).not.toHaveProperty('activeMode')
    expect(fake.commands().at(-1)).toEqual({ type: 'stopPlayback' })

    fake.stdout.write(
      JSON.stringify({
        type: 'status',
        payload: createStatus({
          requestedMode: 'exclusive',
          activeMode: undefined,
          deviceId: '0:Speakers',
          nativePlaybackRunning: false,
          nativePlaybackState: 'stopped',
          reason: 'Native WASAPI exclusive file playback stopped.'
        })
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      requestedMode: 'exclusive',
      nativePlaybackState: 'error',
      nativePlaybackError: {
        code: 'wasapi-exclusive-failed',
        nativeErrorCode: 'AUDCLNT_E_DEVICE_IN_USE',
        retryable: false
      },
      reason: 'Native WASAPI exclusive file playback failed: AUDCLNT_E_DEVICE_IN_USE: device busy'
    })
  })

  it('classifies legacy helper WASAPI exclusive playback reasons as structured native errors', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true, {
      mode: 'exclusive',
      sharedDeviceId: '',
      deviceId: '0:Speakers',
      bufferFrames: 512,
      fallbackToShared: true,
      bitPerfectRequired: false,
      voicemeeterBus: 'A1',
      diagnosticsEnabled: false
    })

    service.playFile({
      path: 'D:\\Music\\track.wav',
      startSeconds: 0,
      volume: 1
    })
    const playbackToken = getPlaybackToken(fake.commands().at(-1))

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'error',
          running: false,
          paused: false,
          source: 'D:\\Music\\track.wav',
          playbackToken,
          reason:
            'Native WASAPI exclusive file playback failed: AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED'
        }
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      nativePlaybackState: 'error',
      nativePlaybackError: {
        code: 'wasapi-exclusive-failed',
        nativeErrorCode: 'AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED',
        retryable: false
      }
    })
  })

  it('classifies legacy helper decode reasons as structured native errors', () => {
    const fake = createFakeHelper()
    const service = new AudioOutputService({
      exists: () => true,
      logger: createLoggerMock(),
      platform: 'win32',
      spawnHelper: vi.fn(() => fake.helper)
    })

    service.setEnabled(true)
    service.playFile({
      path: 'D:\\Music\\broken.flac',
      startSeconds: 0,
      volume: 1
    })
    const playbackToken = getPlaybackToken(fake.commands().at(-1))

    fake.stdout.write(
      JSON.stringify({
        type: 'playback',
        payload: {
          state: 'error',
          running: false,
          paused: false,
          source: 'D:\\Music\\broken.flac',
          playbackToken,
          reason: 'Failed to probe audio file: unsupported codec'
        }
      }) + '\n'
    )

    expect(service.getStatus()).toMatchObject({
      nativePlaybackState: 'error',
      nativePlaybackError: {
        code: 'native-decode-failed',
        nativeMessage: 'Failed to probe audio file: unsupported codec',
        retryable: false
      }
    })
  })
})
