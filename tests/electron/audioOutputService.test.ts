import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

import { AudioOutputService } from '../../electron/main/audioOutputService'
import type { AudioOutputStatus } from '@shared/audioOutput/protocol'

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
      diagnosticsEnabled: false
    })

    expect(spawnHelper).toHaveBeenCalledWith(
      'D:\\app\\native\\audio-output-helper\\target\\debug\\audio-output-helper.exe',
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
      { type: 'initialize', payload: { protocolVersion: 1 } },
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
            diagnosticsEnabled: false
          }
        }
      }
    ])
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
      diagnosticsEnabled: true
    })

    expect(service.getSettings()).toMatchObject({
      mode: 'voicemeeter',
      deviceId: 'voice',
      bufferFrames: 128
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
          diagnosticsEnabled: true
        }
      }
    })
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
    expect(fake.commands().at(-1)).toEqual({
      type: 'playFile',
      payload: {
        path: 'D:\\Music\\track.wav',
        startSeconds: 0,
        volume: 1
      }
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
})
