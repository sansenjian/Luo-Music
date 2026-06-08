import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isReactive } from 'vue'
import { INVOKE_CHANNELS } from '@shared/protocol/channels'
import {
  createDefaultAudioOutputStatus,
  type AudioOutputSettings,
  type AudioOutputStatus
} from '@shared/audioOutput/protocol'

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

function expectCloneableSettings(value: unknown): asserts value is AudioOutputSettings {
  expect(isReactive(value)).toBe(false)
  expect(() => structuredClone(value)).not.toThrow()
}

function createAudioOutputStatus(overrides: Partial<AudioOutputStatus> = {}): AudioOutputStatus {
  return {
    ...createDefaultAudioOutputStatus(),
    ...overrides
  }
}

function createVoicemeeterReadyStatus(
  overrides: Partial<AudioOutputStatus> = {}
): AudioOutputStatus {
  return createAudioOutputStatus({
    enabled: true,
    backend: 'native',
    backendAvailable: true,
    requestedMode: 'voicemeeter',
    activeMode: 'voicemeeter',
    deviceId: 'VoiceMeeter Input',
    devices: [],
    settings: {
      ...createDefaultAudioOutputStatus().settings,
      mode: 'voicemeeter',
      deviceId: 'VoiceMeeter Input',
      voicemeeterBus: 'B2'
    },
    voicemeeterRemote: {
      available: true,
      connected: true,
      routeApplied: true,
      routeManaged: true,
      routeBus: 'B2',
      kind: 'banana',
      virtualInputStrip: 3
    },
    reason: 'Voicemeeter virtual input route is available.',
    ...overrides
  })
}

describe('useAudioOutputPlugin', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    Reflect.deleteProperty(window, 'services')
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
      fallbackToShared: true,
      bitPerfectRequired: false
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
          bitPerfectRequired: true,
          diagnosticsEnabled: false
        }
      }
    })
    const audioOutputMainBridge = {
      getStatus: vi.fn(),
      setEnabled: vi.fn().mockResolvedValue(
        createAudioOutputStatus({
          enabled: true,
          backend: 'unavailable',
          backendAvailable: false,
          requestedMode: 'exclusive',
          deviceId: 'dac',
          devices: [],
          reason: 'Native audio output backend is not bundled yet.'
        })
      ),
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
    expectCloneableSettings(audioOutputMainBridge.setEnabled.mock.calls[0]?.[1])

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
      setEnabled: vi.fn().mockResolvedValue(
        createAudioOutputStatus({
          enabled: true,
          backend: 'native',
          backendAvailable: true,
          requestedMode: 'shared',
          activeMode: 'shared',
          helperRunning: true,
          devices: []
        })
      ),
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

    resolveInitialStatus?.(createAudioOutputStatus())
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
      updateSettings: vi.fn().mockResolvedValue(
        createAudioOutputStatus({
          requestedMode: 'voicemeeter'
        })
      )
    }

    const { updateAudioOutputSettings } = useAudioOutputPlugin({
      storageService,
      audioOutputMainBridge
    })

    const settings = await updateAudioOutputSettings({
      mode: 'voicemeeter',
      sharedDeviceId: ' chromium-voice ',
      bufferFrames: '64',
      voicemeeterBus: ' b3 '
    })

    expect(settings).toMatchObject({
      mode: 'voicemeeter',
      bufferFrames: 128,
      voicemeeterBus: 'B3'
    })
    expect(audioOutputMainBridge.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-voice',
        bufferFrames: 128,
        voicemeeterBus: 'B3'
      })
    )
    expectCloneableSettings(audioOutputMainBridge.updateSettings.mock.calls[0]?.[0])
    expect(JSON.parse(store.get('audioOutput') ?? 'null')).toMatchObject({
      enabled: false,
      settings: {
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-voice',
        bufferFrames: 128,
        voicemeeterBus: 'B3'
      }
    })
  })

  it('selects a Voicemeeter virtual input and clears exclusive-only flags when switching modes', async () => {
    const { useAudioOutputPlugin } = await import('@/composables/useAudioOutputPlugin')
    const { store, storageService } = createStorageServiceMock({
      audioOutput: {
        enabled: true,
        settings: {
          mode: 'exclusive',
          sharedDeviceId: '',
          deviceId: '0:Speakers',
          bufferFrames: 512,
          fallbackToShared: false,
          bitPerfectRequired: true,
          voicemeeterBus: 'A1',
          diagnosticsEnabled: false
        }
      }
    })
    const readyStatus = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      requestedMode: 'exclusive',
      activeMode: 'exclusive',
      devices: [
        {
          id: '0:Speakers',
          name: 'Speakers',
          isDefault: true,
          backend: 'wasapi'
        },
        {
          id: '1:Voicemeeter Input (VB-Audio Voicemeeter VAIO)',
          name: 'Voicemeeter Input (VB-Audio Voicemeeter VAIO)',
          isDefault: false,
          backend: 'voicemeeter'
        }
      ],
      settings: {
        ...createDefaultAudioOutputStatus().settings,
        mode: 'exclusive',
        deviceId: '0:Speakers',
        bitPerfectRequired: true
      }
    })
    const audioOutputMainBridge = {
      getStatus: vi.fn().mockResolvedValue(readyStatus),
      setEnabled: vi.fn().mockResolvedValue(readyStatus),
      updateSettings: vi.fn().mockResolvedValue(
        createVoicemeeterReadyStatus({
          deviceId: '1:Voicemeeter Input (VB-Audio Voicemeeter VAIO)'
        })
      )
    }

    const { updateAudioOutputSettings } = useAudioOutputPlugin({
      storageService,
      audioOutputMainBridge
    })
    await Promise.resolve()

    const settings = await updateAudioOutputSettings({
      mode: 'voicemeeter'
    })

    expect(settings).toMatchObject({
      mode: 'voicemeeter',
      deviceId: '1:Voicemeeter Input (VB-Audio Voicemeeter VAIO)',
      bitPerfectRequired: false
    })
    expect(audioOutputMainBridge.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'voicemeeter',
        deviceId: '1:Voicemeeter Input (VB-Audio Voicemeeter VAIO)',
        bitPerfectRequired: false
      })
    )
    expect(JSON.parse(store.get('audioOutput') ?? 'null')).toMatchObject({
      settings: {
        mode: 'voicemeeter',
        deviceId: '1:Voicemeeter Input (VB-Audio Voicemeeter VAIO)',
        bitPerfectRequired: false
      }
    })
  })

  it('does not carry a stale WASAPI device into Voicemeeter when devices are unavailable', async () => {
    const { useAudioOutputPlugin } = await import('@/composables/useAudioOutputPlugin')
    const { storageService } = createStorageServiceMock({
      audioOutput: {
        enabled: false,
        settings: {
          mode: 'shared',
          sharedDeviceId: '',
          deviceId: '0:Speakers',
          bufferFrames: 512,
          fallbackToShared: true,
          bitPerfectRequired: false,
          voicemeeterBus: 'A1',
          diagnosticsEnabled: false
        }
      }
    })
    const audioOutputMainBridge = {
      setEnabled: vi.fn(),
      updateSettings: vi.fn().mockResolvedValue(createVoicemeeterReadyStatus())
    }

    const { updateAudioOutputSettings } = useAudioOutputPlugin({
      storageService,
      audioOutputMainBridge
    })

    await expect(
      updateAudioOutputSettings({
        mode: 'voicemeeter',
        bitPerfectRequired: true
      })
    ).resolves.toMatchObject({
      mode: 'voicemeeter',
      deviceId: '',
      bitPerfectRequired: false
    })
    expect(audioOutputMainBridge.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'voicemeeter',
        deviceId: '',
        bitPerfectRequired: false
      })
    )
  })

  it('keeps a newer subscribed Voicemeeter route status when settings IPC resolves late', async () => {
    const { useAudioOutputPlugin } = await import('@/composables/useAudioOutputPlugin')
    const { storageService } = createStorageServiceMock({
      audioOutput: {
        enabled: true,
        settings: {
          mode: 'shared',
          sharedDeviceId: '',
          deviceId: '0:Speakers',
          bufferFrames: 512,
          fallbackToShared: true,
          bitPerfectRequired: false,
          voicemeeterBus: 'A1',
          diagnosticsEnabled: false
        }
      }
    })
    let statusListener: ((status: AudioOutputStatus) => void) | undefined
    let resolveSettingsSync: ((status: AudioOutputStatus) => void) | undefined
    const lateSettingsStatus = createAudioOutputStatus({
      enabled: true,
      backend: 'unavailable',
      backendAvailable: false,
      requestedMode: 'voicemeeter',
      deviceId: 'VoiceMeeter Input',
      devices: [],
      settings: {
        ...createDefaultAudioOutputStatus().settings,
        mode: 'voicemeeter',
        deviceId: 'VoiceMeeter Input',
        voicemeeterBus: 'B2'
      },
      reason: 'Native audio output playback stopped because output settings changed.'
    })
    const audioOutputMainBridge = {
      getStatus: vi.fn(),
      setEnabled: vi.fn().mockResolvedValue(createAudioOutputStatus()),
      updateSettings: vi.fn(
        () =>
          new Promise<AudioOutputStatus>(resolve => {
            resolveSettingsSync = resolve
          })
      ),
      subscribeStatus: vi.fn((listener: (status: AudioOutputStatus) => void) => {
        statusListener = listener
      })
    }

    const { audioOutputStatus, updateAudioOutputSettings } = useAudioOutputPlugin({
      storageService,
      audioOutputMainBridge
    })
    await Promise.resolve()

    const settingsSync = updateAudioOutputSettings({
      mode: 'voicemeeter',
      deviceId: 'VoiceMeeter Input',
      voicemeeterBus: 'B2'
    })
    const readyStatus = createVoicemeeterReadyStatus()

    statusListener?.(readyStatus)
    expect(audioOutputStatus.value).toMatchObject({
      backend: 'native',
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      voicemeeterRemote: {
        routeApplied: true,
        routeManaged: true,
        routeBus: 'B2'
      }
    })

    resolveSettingsSync?.(lateSettingsStatus)
    await expect(settingsSync).resolves.toMatchObject({
      mode: 'voicemeeter',
      voicemeeterBus: 'B2'
    })

    expect(audioOutputStatus.value).toMatchObject({
      backend: 'native',
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      voicemeeterRemote: {
        routeApplied: true,
        routeManaged: true,
        routeBus: 'B2'
      },
      reason: 'Voicemeeter virtual input route is available.'
    })
  })

  it('rejects settings updates when native sync fails', async () => {
    const { useAudioOutputPlugin } = await import('@/composables/useAudioOutputPlugin')
    const { store, storageService } = createStorageServiceMock()
    const audioOutputMainBridge = {
      setEnabled: vi.fn(),
      updateSettings: vi.fn().mockRejectedValue(new Error('helper unavailable'))
    }

    const { audioOutputStatus, updateAudioOutputSettings } = useAudioOutputPlugin({
      storageService,
      audioOutputMainBridge
    })

    await expect(updateAudioOutputSettings({ mode: 'exclusive' })).rejects.toThrow(
      'helper unavailable'
    )
    expect(JSON.parse(store.get('audioOutput') ?? 'null')).toMatchObject({
      settings: {
        mode: 'exclusive'
      }
    })
    expect(audioOutputStatus.value).toMatchObject({
      backend: 'disabled',
      reason: 'helper unavailable'
    })
  })

  it('passes cloneable settings through the default Electron bridge', async () => {
    const { useAudioOutputPlugin } = await import('@/composables/useAudioOutputPlugin')
    const { storageService } = createStorageServiceMock({
      audioOutput: {
        enabled: true,
        settings: {
          mode: 'exclusive',
          sharedDeviceId: ' chromium-usb ',
          deviceId: ' dac ',
          bufferFrames: 512,
          fallbackToShared: true,
          bitPerfectRequired: true,
          diagnosticsEnabled: false
        }
      }
    })
    const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
      if (channel === INVOKE_CHANNELS.AUDIO_OUTPUT_SET_ENABLED) {
        expectCloneableSettings(args[1])
        return {
          ...createDefaultAudioOutputStatus(),
          enabled: args[0] === true,
          backend: 'unavailable',
          backendAvailable: false,
          settings: args[1],
          requestedMode: args[1].mode,
          deviceId: args[1].deviceId,
          devices: []
        } satisfies AudioOutputStatus
      }

      return {
        ...createDefaultAudioOutputStatus()
      } satisfies AudioOutputStatus
    })

    Object.defineProperty(window, 'services', {
      configurable: true,
      writable: true,
      value: {
        invoke,
        on: vi.fn()
      }
    })

    const { audioOutputStatus } = useAudioOutputPlugin({
      storageService,
      mediaDevices: null
    })

    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        INVOKE_CHANNELS.AUDIO_OUTPUT_SET_ENABLED,
        true,
        expect.objectContaining({
          mode: 'exclusive',
          sharedDeviceId: 'chromium-usb',
          deviceId: 'dac'
        })
      )
    )
    expect(audioOutputStatus.value).toMatchObject({
      enabled: true,
      backend: 'unavailable',
      requestedMode: 'exclusive',
      deviceId: 'dac'
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
          bitPerfectRequired: false,
          diagnosticsEnabled: false
        }
      }
    })
    const audioOutputMainBridge = {
      getStatus: vi.fn(),
      setEnabled: vi.fn(),
      updateSettings: vi.fn(),
      playTestTone: vi.fn().mockResolvedValue(
        createAudioOutputStatus({
          enabled: true,
          backend: 'native',
          backendAvailable: true,
          requestedMode: 'shared',
          activeMode: 'shared',
          devices: [],
          testToneRunning: true,
          reason: 'Native audio output test tone is playing.'
        })
      )
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
