import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createDefaultAudioOutputStatus,
  type AudioOutputStatus
} from '@shared/audioOutput/protocol'

const registerInvokeMock = vi.hoisted(() => vi.fn())

function createAudioOutputStatus(overrides: Partial<AudioOutputStatus> = {}): AudioOutputStatus {
  return {
    ...createDefaultAudioOutputStatus(),
    ...overrides
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return {
    promise,
    resolve,
    reject
  }
}

describe('audioOutput.handler', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doMock('../../electron/ipc/IpcService', () => ({
      ipcService: {
        registerInvoke: registerInvokeMock
      }
    }))
  })

  it('registers native audio output invoke channels against the runtime service', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )
    const nativeService = {
      getStatus: vi.fn(() => createAudioOutputStatus()),
      setEnabled: vi.fn(() =>
        createAudioOutputStatus({
          enabled: true,
          backend: 'unavailable',
          backendAvailable: false,
          requestedMode: 'exclusive',
          devices: []
        })
      ),
      updateSettings: vi.fn(() =>
        createAudioOutputStatus({
          enabled: true,
          backend: 'unavailable',
          backendAvailable: false,
          requestedMode: 'voicemeeter',
          devices: []
        })
      ),
      playTestTone: vi.fn(() =>
        createAudioOutputStatus({
          enabled: true,
          backend: 'native',
          backendAvailable: true,
          requestedMode: 'shared',
          activeMode: 'shared',
          devices: [],
          testToneRunning: true
        })
      ),
      probeExclusiveLock: vi.fn(() =>
        createAudioOutputStatus({
          enabled: true,
          backend: 'native',
          backendAvailable: true,
          requestedMode: 'exclusive',
          activeMode: 'exclusive',
          devices: [],
          reason: 'WASAPI exclusive lock probe passed.'
        })
      ),
      playFile: vi.fn(() =>
        createAudioOutputStatus({
          enabled: true,
          backend: 'native',
          backendAvailable: true,
          requestedMode: 'shared',
          activeMode: 'shared',
          devices: [],
          nativePlaybackRunning: true,
          nativePlaybackState: 'starting'
        })
      ),
      pausePlayback: vi.fn(() =>
        createAudioOutputStatus({
          enabled: true,
          backend: 'native',
          backendAvailable: true,
          requestedMode: 'shared',
          activeMode: 'shared',
          devices: [],
          nativePlaybackPaused: true,
          nativePlaybackState: 'paused'
        })
      ),
      resumePlayback: vi.fn(() =>
        createAudioOutputStatus({
          enabled: true,
          backend: 'native',
          backendAvailable: true,
          requestedMode: 'shared',
          activeMode: 'shared',
          devices: [],
          nativePlaybackRunning: true,
          nativePlaybackState: 'playing'
        })
      ),
      stopPlayback: vi.fn(() =>
        createAudioOutputStatus({
          enabled: true,
          backend: 'native',
          backendAvailable: true,
          requestedMode: 'shared',
          activeMode: 'shared',
          devices: [],
          nativePlaybackRunning: false,
          nativePlaybackState: 'stopped'
        })
      ),
      stopPlaybackSettled: vi.fn().mockResolvedValue(
        createAudioOutputStatus({
          enabled: true,
          backend: 'native',
          backendAvailable: true,
          requestedMode: 'shared',
          activeMode: 'shared',
          devices: [],
          nativePlaybackRunning: false,
          nativePlaybackState: 'stopped'
        })
      ),
      setPlaybackVolume: vi.fn(() =>
        createAudioOutputStatus({
          enabled: true,
          backend: 'native',
          backendAvailable: true,
          requestedMode: 'shared',
          activeMode: 'shared',
          devices: []
        })
      )
    }

    const { registerAudioOutputHandlers } =
      await import('../../electron/ipc/handlers/audioOutput.handler')

    registerAudioOutputHandlers(nativeService)

    expect(await invokeHandlers.get('audio-output:get-status')?.()).toMatchObject({
      backend: 'disabled'
    })
    expect(
      await invokeHandlers.get('audio-output:set-enabled')?.(true, {
        mode: 'exclusive',
        deviceId: '',
        bufferFrames: '512',
        fallbackToShared: true,
        bitPerfectRequired: true,
        diagnosticsEnabled: false
      })
    ).toMatchObject({
      requestedMode: 'exclusive'
    })
    expect(nativeService.setEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        mode: 'exclusive',
        bufferFrames: 512,
        bitPerfectRequired: true
      })
    )
    expect(
      await invokeHandlers.get('audio-output:play-test-tone')?.({
        durationMs: 50,
        frequencyHz: 4000
      })
    ).toMatchObject({
      testToneRunning: true
    })
    expect(nativeService.playTestTone).toHaveBeenCalledWith({
      durationMs: 120,
      frequencyHz: 2000
    })
    expect(await invokeHandlers.get('audio-output:probe-exclusive-lock')?.()).toMatchObject({
      activeMode: 'exclusive',
      reason: 'WASAPI exclusive lock probe passed.'
    })
    expect(nativeService.probeExclusiveLock).toHaveBeenCalled()
    expect(
      await invokeHandlers.get('audio-output:play-file')?.({
        path: '  D:\\Music\\track.wav  ',
        url: '  https://song.test/track.mp3  ',
        startSeconds: '-5',
        volume: '1.5'
      })
    ).toMatchObject({
      nativePlaybackState: 'starting'
    })
    expect(nativeService.playFile).toHaveBeenCalledWith({
      path: 'D:\\Music\\track.wav',
      url: 'https://song.test/track.mp3',
      startSeconds: 0,
      volume: 1
    })
    expect(await invokeHandlers.get('audio-output:pause-playback')?.()).toMatchObject({
      nativePlaybackState: 'paused'
    })
    expect(await invokeHandlers.get('audio-output:resume-playback')?.()).toMatchObject({
      nativePlaybackState: 'playing'
    })
    expect(
      await invokeHandlers.get('audio-output:set-playback-volume')?.({ volume: -2 })
    ).toMatchObject({
      backend: 'native'
    })
    expect(nativeService.setPlaybackVolume).toHaveBeenCalledWith({
      volume: 0
    })
    expect(await invokeHandlers.get('audio-output:stop-playback')?.()).toMatchObject({
      nativePlaybackState: 'stopped'
    })
    expect(nativeService.stopPlaybackSettled).toHaveBeenCalled()
    expect(nativeService.stopPlayback).not.toHaveBeenCalled()
  })

  it('serializes native audio output commands while output settings are settling', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )
    const settingsDeferred = createDeferred<AudioOutputStatus>()
    const nativeService = {
      getStatus: vi.fn(() => createAudioOutputStatus()),
      setEnabled: vi.fn(() => createAudioOutputStatus()),
      updateSettings: vi.fn(() => settingsDeferred.promise),
      playTestTone: vi.fn(() => createAudioOutputStatus()),
      probeExclusiveLock: vi.fn(() => createAudioOutputStatus()),
      playFile: vi.fn(() =>
        createAudioOutputStatus({
          enabled: true,
          backend: 'native',
          nativePlaybackRunning: true,
          nativePlaybackState: 'starting'
        })
      ),
      pausePlayback: vi.fn(() => createAudioOutputStatus()),
      resumePlayback: vi.fn(() => createAudioOutputStatus()),
      stopPlayback: vi.fn(() => createAudioOutputStatus()),
      stopPlaybackSettled: vi.fn().mockResolvedValue(createAudioOutputStatus()),
      setPlaybackVolume: vi.fn(() => createAudioOutputStatus())
    }
    const { registerAudioOutputHandlers } =
      await import('../../electron/ipc/handlers/audioOutput.handler')

    registerAudioOutputHandlers(nativeService)
    const settingsResult = invokeHandlers.get('audio-output:update-settings')?.({
      mode: 'exclusive',
      deviceId: '0:Speakers',
      fallbackToShared: false,
      bitPerfectRequired: true
    })
    const playbackResult = invokeHandlers.get('audio-output:play-file')?.({
      path: 'D:\\Music\\queued.wav'
    })

    await Promise.resolve()

    expect(nativeService.updateSettings).toHaveBeenCalled()
    expect(nativeService.playFile).not.toHaveBeenCalled()

    settingsDeferred.resolve(
      createAudioOutputStatus({
        enabled: true,
        backend: 'unavailable',
        requestedMode: 'exclusive'
      })
    )

    await expect(settingsResult).resolves.toMatchObject({
      requestedMode: 'exclusive'
    })
    await expect(playbackResult).resolves.toMatchObject({
      nativePlaybackState: 'starting'
    })
    expect(nativeService.playFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'D:\\Music\\queued.wav'
      })
    )
  })

  it('continues processing queued native audio output commands after a command rejects', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )
    const nativeService = {
      getStatus: vi.fn(() => createAudioOutputStatus()),
      setEnabled: vi.fn(() => createAudioOutputStatus()),
      updateSettings: vi.fn().mockRejectedValue(new Error('configure failed')),
      playTestTone: vi.fn(() => createAudioOutputStatus()),
      probeExclusiveLock: vi.fn(() => createAudioOutputStatus()),
      playFile: vi.fn(() =>
        createAudioOutputStatus({
          enabled: true,
          backend: 'native',
          nativePlaybackRunning: true,
          nativePlaybackState: 'starting'
        })
      ),
      pausePlayback: vi.fn(() => createAudioOutputStatus()),
      resumePlayback: vi.fn(() => createAudioOutputStatus()),
      stopPlayback: vi.fn(() => createAudioOutputStatus()),
      stopPlaybackSettled: vi.fn().mockResolvedValue(createAudioOutputStatus()),
      setPlaybackVolume: vi.fn(() => createAudioOutputStatus())
    }
    const { registerAudioOutputHandlers } =
      await import('../../electron/ipc/handlers/audioOutput.handler')

    registerAudioOutputHandlers(nativeService)

    await expect(
      invokeHandlers.get('audio-output:update-settings')?.({
        mode: 'exclusive',
        deviceId: '0:Speakers',
        fallbackToShared: false
      })
    ).rejects.toThrow('configure failed')
    await expect(
      invokeHandlers.get('audio-output:play-file')?.({
        path: 'D:\\Music\\after-error.wav'
      })
    ).resolves.toMatchObject({
      nativePlaybackState: 'starting'
    })
    expect(nativeService.playFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'D:\\Music\\after-error.wav'
      })
    )
  })
})
