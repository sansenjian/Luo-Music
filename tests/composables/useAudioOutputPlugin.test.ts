import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioOutputStatus } from '@shared/audioOutput/protocol'

function createStorageServiceMock(initialEntries: Record<string, unknown> = {}) {
  const store = new Map(
    Object.entries(initialEntries).map(([key, value]) => [key, JSON.stringify(value)])
  )

  return {
    store,
    storageService: {
      getJSON: vi.fn(<T>(key: string): T | null => {
        const value = store.get(key)
        return value ? (JSON.parse(value) as T) : null
      }) as <T>(key: string) => T | null,
      setJSON: vi.fn(<T>(key: string, value: T): void => {
        store.set(key, JSON.stringify(value))
      }) as <T>(key: string, value: T) => void
    }
  }
}

describe('useAudioOutputPlugin', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('defaults native audio output to disabled', async () => {
    const { useAudioOutputPlugin } = await import('@/composables/useAudioOutputPlugin')
    const { storageService } = createStorageServiceMock()

    const { audioOutputEnabled, audioOutputSettings, audioOutputStatus } = useAudioOutputPlugin({
      storageService,
      audioOutputMainBridge: null
    })

    expect(audioOutputEnabled.value).toBe(false)
    expect(audioOutputSettings.value).toMatchObject({
      mode: 'shared',
      sharedDeviceId: '',
      bufferFrames: 960,
      fallbackToShared: true
    })
    expect(audioOutputStatus.value).toMatchObject({
      enabled: false,
      backend: 'disabled',
      requestedMode: 'shared'
    })
  })

  it('restores persisted state and syncs it to the main process', async () => {
    const { useAudioOutputPlugin } = await import('@/composables/useAudioOutputPlugin')
    const { storageService } = createStorageServiceMock({
      audioOutput: {
        enabled: true,
        settings: {
          mode: 'exclusive',
          sharedDeviceId: 'chromium-usb',
          deviceId: 'dac',
          bufferFrames: 512,
          fallbackToShared: true,
          diagnosticsEnabled: false
        }
      }
    })
    const audioOutputMainBridge = {
      getStatus: vi.fn(),
      setEnabled: vi.fn().mockResolvedValue({
        enabled: true,
        backend: 'unavailable',
        backendAvailable: false,
        requestedMode: 'exclusive',
        deviceId: 'dac',
        devices: [],
        reason: 'Native audio output backend is not bundled yet.'
      }),
      updateSettings: vi.fn()
    }

    const { audioOutputEnabled, audioOutputStatus } = useAudioOutputPlugin({
      storageService,
      audioOutputMainBridge
    })

    expect(audioOutputEnabled.value).toBe(true)
    expect(audioOutputMainBridge.setEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        mode: 'exclusive',
        sharedDeviceId: 'chromium-usb',
        deviceId: 'dac'
      })
    )

    await Promise.resolve()

    expect(audioOutputStatus.value).toMatchObject({
      enabled: true,
      backend: 'unavailable',
      requestedMode: 'exclusive',
      reason: 'Native audio output backend is not bundled yet.'
    })
  })

  it('keeps the latest enabled status when an earlier status request resolves later', async () => {
    const { useAudioOutputPlugin } = await import('@/composables/useAudioOutputPlugin')
    const { storageService } = createStorageServiceMock()
    let resolveInitialStatus: ((status: AudioOutputStatus) => void) | undefined
    const audioOutputMainBridge = {
      getStatus: vi.fn(
        () =>
          new Promise<AudioOutputStatus>(resolve => {
            resolveInitialStatus = resolve
          })
      ),
      setEnabled: vi.fn().mockResolvedValue({
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'shared',
        activeMode: 'shared',
        helperRunning: true,
        devices: []
      }),
      updateSettings: vi.fn()
    }

    const { audioOutputStatus, setAudioOutputEnabled } = useAudioOutputPlugin({
      storageService,
      audioOutputMainBridge
    })

    await expect(setAudioOutputEnabled(true)).resolves.toMatchObject({
      enabled: true,
      backend: 'native',
      helperRunning: true
    })

    resolveInitialStatus?.({
      enabled: false,
      backend: 'disabled',
      backendAvailable: false,
      requestedMode: 'shared',
      devices: []
    })
    await Promise.resolve()

    expect(audioOutputStatus.value).toMatchObject({
      enabled: true,
      backend: 'native',
      helperRunning: true
    })
  })

  it('persists sanitized settings and syncs updates', async () => {
    const { useAudioOutputPlugin } = await import('@/composables/useAudioOutputPlugin')
    const { store, storageService } = createStorageServiceMock()
    const audioOutputMainBridge = {
      setEnabled: vi.fn(),
      updateSettings: vi.fn().mockResolvedValue({
        enabled: false,
        backend: 'disabled',
        backendAvailable: false,
        requestedMode: 'voicemeeter',
        devices: []
      })
    }

    const { updateAudioOutputSettings } = useAudioOutputPlugin({
      storageService,
      audioOutputMainBridge
    })

    const settings = await updateAudioOutputSettings({
      mode: 'voicemeeter',
      sharedDeviceId: ' chromium-voice ',
      bufferFrames: '64'
    })

    expect(settings).toMatchObject({
      mode: 'voicemeeter',
      bufferFrames: 128
    })
    expect(audioOutputMainBridge.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-voice',
        bufferFrames: 128
      })
    )
    expect(JSON.parse(store.get('audioOutput') ?? 'null')).toMatchObject({
      enabled: false,
      settings: {
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-voice',
        bufferFrames: 128
      }
    })
  })

  it('plays a native output test tone through the main bridge and stores returned status', async () => {
    const { useAudioOutputPlugin } = await import('@/composables/useAudioOutputPlugin')
    const { storageService } = createStorageServiceMock({
      audioOutput: {
        enabled: true,
        settings: {
          mode: 'shared',
          sharedDeviceId: '',
          deviceId: '',
          bufferFrames: 960,
          fallbackToShared: true,
          diagnosticsEnabled: false
        }
      }
    })
    const audioOutputMainBridge = {
      getStatus: vi.fn(),
      setEnabled: vi.fn(),
      updateSettings: vi.fn(),
      playTestTone: vi.fn().mockResolvedValue({
        enabled: true,
        backend: 'native',
        backendAvailable: true,
        requestedMode: 'shared',
        activeMode: 'shared',
        devices: [],
        testToneRunning: true,
        reason: 'Native audio output test tone is playing.'
      })
    }

    const { audioOutputStatus, playAudioOutputTestTone } = useAudioOutputPlugin({
      storageService,
      audioOutputMainBridge
    })

    await expect(playAudioOutputTestTone({ durationMs: 300 })).resolves.toMatchObject({
      testToneRunning: true
    })
    expect(audioOutputMainBridge.playTestTone).toHaveBeenCalledWith({ durationMs: 300 })
    expect(audioOutputStatus.value).toMatchObject({
      backend: 'native',
      testToneRunning: true,
      reason: 'Native audio output test tone is playing.'
    })
  })

  it('enumerates Chromium shared audio output devices with stable fallback labels', async () => {
    const { useAudioOutputPlugin } = await import('@/composables/useAudioOutputPlugin')
    const { storageService } = createStorageServiceMock()
    const mediaDevices = {
      enumerateDevices: vi.fn().mockResolvedValue([
        {
          kind: 'audioinput',
          deviceId: 'mic',
          label: 'Mic'
        },
        {
          kind: 'audiooutput',
          deviceId: 'default',
          label: 'Default'
        },
        {
          kind: 'audiooutput',
          deviceId: 'speakers',
          label: 'Speakers'
        },
        {
          kind: 'audiooutput',
          deviceId: 'usb',
          label: ''
        }
      ])
    }

    const { refreshSharedOutputDevices, sharedOutputDevices } = useAudioOutputPlugin({
      storageService,
      audioOutputMainBridge: null,
      mediaDevices
    })

    await expect(refreshSharedOutputDevices()).resolves.toEqual([
      { id: 'speakers', label: 'Speakers' },
      { id: 'usb', label: '输出设备 1' }
    ])
    expect(sharedOutputDevices.value).toEqual([
      { id: 'speakers', label: 'Speakers' },
      { id: 'usb', label: '输出设备 1' }
    ])
  })

  it('refreshes shared output devices when Chromium reports device changes', async () => {
    const { useAudioOutputPlugin } = await import('@/composables/useAudioOutputPlugin')
    const { storageService } = createStorageServiceMock()
    let deviceChangeListener: (() => void) | undefined
    const mediaDevices = {
      enumerateDevices: vi.fn().mockResolvedValue([
        {
          kind: 'audiooutput',
          deviceId: 'speakers',
          label: 'Speakers'
        }
      ]),
      addEventListener: vi.fn((eventName: string, listener: EventListenerOrEventListenerObject) => {
        if (eventName === 'devicechange' && typeof listener === 'function') {
          deviceChangeListener = listener as () => void
        }
      })
    }

    useAudioOutputPlugin({
      storageService,
      audioOutputMainBridge: null,
      mediaDevices
    })

    deviceChangeListener?.()
    await Promise.resolve()

    expect(mediaDevices.addEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function))
    expect(mediaDevices.enumerateDevices).toHaveBeenCalled()
  })
})
