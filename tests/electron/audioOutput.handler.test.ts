import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerInvokeMock = vi.hoisted(() => vi.fn())

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
      getStatus: vi.fn(() => ({
        enabled: false,
        backend: 'disabled' as const,
        backendAvailable: false,
        requestedMode: 'shared' as const,
        devices: []
      })),
      setEnabled: vi.fn(() => ({
        enabled: true,
        backend: 'unavailable' as const,
        backendAvailable: false,
        requestedMode: 'exclusive' as const,
        devices: []
      })),
      updateSettings: vi.fn(() => ({
        enabled: true,
        backend: 'unavailable' as const,
        backendAvailable: false,
        requestedMode: 'voicemeeter' as const,
        devices: []
      })),
      playTestTone: vi.fn(() => ({
        enabled: true,
        backend: 'native' as const,
        backendAvailable: true,
        requestedMode: 'shared' as const,
        activeMode: 'shared' as const,
        devices: [],
        testToneRunning: true
      })),
      playFile: vi.fn(() => ({
        enabled: true,
        backend: 'native' as const,
        backendAvailable: true,
        requestedMode: 'shared' as const,
        activeMode: 'shared' as const,
        devices: [],
        nativePlaybackRunning: true,
        nativePlaybackState: 'starting' as const
      })),
      pausePlayback: vi.fn(() => ({
        enabled: true,
        backend: 'native' as const,
        backendAvailable: true,
        requestedMode: 'shared' as const,
        activeMode: 'shared' as const,
        devices: [],
        nativePlaybackPaused: true,
        nativePlaybackState: 'paused' as const
      })),
      resumePlayback: vi.fn(() => ({
        enabled: true,
        backend: 'native' as const,
        backendAvailable: true,
        requestedMode: 'shared' as const,
        activeMode: 'shared' as const,
        devices: [],
        nativePlaybackRunning: true,
        nativePlaybackState: 'playing' as const
      })),
      stopPlayback: vi.fn(() => ({
        enabled: true,
        backend: 'native' as const,
        backendAvailable: true,
        requestedMode: 'shared' as const,
        activeMode: 'shared' as const,
        devices: [],
        nativePlaybackRunning: false,
        nativePlaybackState: 'stopped' as const
      })),
      setPlaybackVolume: vi.fn(() => ({
        enabled: true,
        backend: 'native' as const,
        backendAvailable: true,
        requestedMode: 'shared' as const,
        activeMode: 'shared' as const,
        devices: []
      }))
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
        diagnosticsEnabled: false
      })
    ).toMatchObject({
      requestedMode: 'exclusive'
    })
    expect(nativeService.setEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        mode: 'exclusive',
        bufferFrames: 512
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
    expect(
      await invokeHandlers.get('audio-output:play-file')?.({
        path: '  D:\\Music\\track.wav  ',
        startSeconds: '-5',
        volume: '1.5'
      })
    ).toMatchObject({
      nativePlaybackState: 'starting'
    })
    expect(nativeService.playFile).toHaveBeenCalledWith({
      path: 'D:\\Music\\track.wav',
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
  })
})
