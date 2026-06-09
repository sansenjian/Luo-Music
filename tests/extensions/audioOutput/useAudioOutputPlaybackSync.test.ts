import { nextTick, ref, type Ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useAudioOutputPlaybackSync } from '@/extensions/audioOutput/useAudioOutputPlaybackSync'
import {
  createDefaultAudioOutputStatus,
  type AudioOutputSettings,
  type AudioOutputStatus
} from '@shared/audioOutput/protocol'
import { mountComposable } from '../../helpers/mountComposable'

function createAudioOutputSettings(
  overrides: Partial<AudioOutputSettings> = {}
): AudioOutputSettings {
  return {
    mode: 'shared',
    sharedDeviceId: '',
    deviceId: '',
    bufferFrames: 960,
    fallbackToShared: true,
    bitPerfectRequired: false,
    voicemeeterBus: 'A1',
    diagnosticsEnabled: false,
    ...overrides
  }
}

function createAudioOutputStatus(overrides: Partial<AudioOutputStatus> = {}): AudioOutputStatus {
  return {
    ...createDefaultAudioOutputStatus(),
    enabled: false,
    backend: 'disabled',
    backendAvailable: false,
    requestedMode: 'shared',
    devices: [],
    ...overrides
  }
}

function createVoicemeeterRemoteReady(
  overrides: Partial<NonNullable<AudioOutputStatus['voicemeeterRemote']>> = {}
): NonNullable<AudioOutputStatus['voicemeeterRemote']> {
  return {
    available: true,
    connected: true,
    routeApplied: true,
    routeManaged: true,
    routeBus: 'A1',
    kind: 'banana',
    virtualInputStrip: 3,
    ...overrides
  }
}

function createAudioOutputPluginState(
  options: {
    enabled?: boolean
    settings?: Partial<AudioOutputSettings>
  } = {}
) {
  const audioOutputEnabled = ref(options.enabled ?? true)
  const audioOutputSettings = ref(createAudioOutputSettings(options.settings))
  const audioOutputStatus = ref(
    createAudioOutputStatus({
      enabled: audioOutputEnabled.value,
      requestedMode: audioOutputSettings.value.mode
    })
  )

  return {
    audioOutputEnabled,
    audioOutputSettings,
    audioOutputStatus,
    sharedOutputDevices: ref([]),
    refreshSharedOutputDevices: vi.fn()
  }
}

function mountPlaybackSync(
  options: {
    isElectron?: boolean
    plugin?: ReturnType<typeof createAudioOutputPluginState>
    setOutputDevice?: (deviceId: string) => Promise<void> | void
    restartPlaybackForAudioOutputChange?: () => Promise<void>
    logger?: Pick<Console, 'warn'>
  } = {}
) {
  const plugin = options.plugin ?? createAudioOutputPluginState()
  const player = {
    setOutputDevice: vi.fn(options.setOutputDevice ?? (() => Promise.resolve()))
  }
  const playerStore = {
    restartPlaybackForAudioOutputChange: vi.fn(
      options.restartPlaybackForAudioOutputChange ?? (() => Promise.resolve())
    )
  }
  const logger = options.logger ?? { warn: vi.fn() }

  const { wrapper } = mountComposable(() =>
    useAudioOutputPlaybackSync({
      platformService: { isElectron: () => options.isElectron ?? true },
      audioOutputPlugin: plugin,
      player,
      playerStore,
      logger
    })
  )

  return {
    wrapper,
    plugin,
    player,
    playerStore,
    logger
  }
}

describe('useAudioOutputPlaybackSync', () => {
  it('does not touch playback devices outside Electron', () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { sharedDeviceId: 'chromium-usb' }
    })
    const { player } = mountPlaybackSync({
      isElectron: false,
      plugin
    })

    expect(plugin.refreshSharedOutputDevices).not.toHaveBeenCalled()
    expect(player.setOutputDevice).not.toHaveBeenCalled()
  })

  it('syncs shared mode to Chromium setSinkId output device', () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'shared', sharedDeviceId: 'chromium-usb' }
    })
    const { player } = mountPlaybackSync({ plugin })

    expect(plugin.refreshSharedOutputDevices).toHaveBeenCalledOnce()
    expect(player.setOutputDevice).toHaveBeenCalledWith('chromium-usb')
  })

  it('keeps Chromium on the selected fallback device while enabled and clears it when disabled', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'shared', sharedDeviceId: 'chromium-usb' }
    })
    const { player } = mountPlaybackSync({ plugin })

    ;(plugin.audioOutputSettings as Ref<AudioOutputSettings>).value = createAudioOutputSettings({
      mode: 'exclusive',
      sharedDeviceId: 'chromium-usb'
    })
    await nextTick()
    expect(player.setOutputDevice).toHaveBeenLastCalledWith('chromium-usb')

    ;(plugin.audioOutputSettings as Ref<AudioOutputSettings>).value = createAudioOutputSettings({
      mode: 'shared',
      sharedDeviceId: 'chromium-usb'
    })
    await nextTick()
    expect(player.setOutputDevice).toHaveBeenLastCalledWith('chromium-usb')

    ;(plugin.audioOutputEnabled as Ref<boolean>).value = false
    await nextTick()
    expect(player.setOutputDevice).toHaveBeenLastCalledWith('')
  })

  it('keeps Chromium fallback output on the selected device while native exclusive is active', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: {
        mode: 'exclusive',
        sharedDeviceId: 'chromium-usb',
        deviceId: '0:Speakers'
      }
    })
    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      requestedMode: 'exclusive',
      activeMode: 'exclusive'
    })

    const { player } = mountPlaybackSync({ plugin })

    expect(player.setOutputDevice).toHaveBeenCalledWith('chromium-usb')
  })

  it('does not resync Chromium output device when only native status changes', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'exclusive', sharedDeviceId: 'chromium-usb' }
    })
    const { player } = mountPlaybackSync({ plugin })
    player.setOutputDevice.mockClear()

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      requestedMode: 'exclusive',
      activeMode: 'exclusive'
    })
    await nextTick()

    expect(player.setOutputDevice).not.toHaveBeenCalled()
  })

  it('restarts playback when the native output route changes after initialization', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'shared', sharedDeviceId: 'chromium-usb' }
    })
    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'shared',
      activeMode: 'shared',
      settings: createAudioOutputSettings({
        mode: 'shared',
        sharedDeviceId: 'chromium-usb'
      })
    })
    const { playerStore } = mountPlaybackSync({ plugin })

    expect(playerStore.restartPlaybackForAudioOutputChange).not.toHaveBeenCalled()

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'exclusive',
      activeMode: undefined,
      deviceId: '0:Speakers',
      settings: createAudioOutputSettings({
        mode: 'exclusive',
        sharedDeviceId: 'chromium-usb',
        deviceId: '0:Speakers'
      })
    })
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).toHaveBeenCalledOnce()
  })

  it('waits for native output to become available before restarting during route transitions', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'shared', sharedDeviceId: 'chromium-usb' }
    })
    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'shared',
      activeMode: 'shared',
      settings: createAudioOutputSettings({
        mode: 'shared',
        sharedDeviceId: 'chromium-usb'
      })
    })
    const { playerStore } = mountPlaybackSync({ plugin })

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'unavailable',
      backendAvailable: false,
      helperRunning: true,
      requestedMode: 'exclusive',
      activeMode: undefined,
      deviceId: '0:Speakers',
      settings: createAudioOutputSettings({
        mode: 'exclusive',
        sharedDeviceId: 'chromium-usb',
        deviceId: '0:Speakers'
      }),
      reason: 'Native audio output playback stopped because output settings changed.'
    })
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).not.toHaveBeenCalled()

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'exclusive',
      activeMode: 'exclusive',
      deviceId: '0:Speakers',
      settings: createAudioOutputSettings({
        mode: 'exclusive',
        sharedDeviceId: 'chromium-usb',
        deviceId: '0:Speakers'
      })
    })
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).toHaveBeenCalledOnce()
  })

  it('serializes native route playback restarts while output settings change quickly', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'shared', sharedDeviceId: 'chromium-usb' }
    })
    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'shared',
      activeMode: 'shared',
      settings: createAudioOutputSettings({
        mode: 'shared',
        sharedDeviceId: 'chromium-usb'
      })
    })
    let resolveFirstRestart: (() => void) | undefined
    const restartPlaybackForAudioOutputChange = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveFirstRestart = resolve
          })
      )
      .mockResolvedValue(undefined)
    const { playerStore } = mountPlaybackSync({
      plugin,
      restartPlaybackForAudioOutputChange
    })

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'exclusive',
      activeMode: undefined,
      deviceId: '0:Speakers',
      settings: createAudioOutputSettings({
        mode: 'exclusive',
        sharedDeviceId: 'chromium-usb',
        deviceId: '0:Speakers',
        bufferFrames: 512
      })
    })
    await nextTick()
    expect(playerStore.restartPlaybackForAudioOutputChange).toHaveBeenCalledOnce()

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'exclusive',
      activeMode: undefined,
      deviceId: '0:Speakers',
      settings: createAudioOutputSettings({
        mode: 'exclusive',
        sharedDeviceId: 'chromium-usb',
        deviceId: '0:Speakers',
        bufferFrames: 1024
      })
    })
    await nextTick()
    await Promise.resolve()
    expect(playerStore.restartPlaybackForAudioOutputChange).toHaveBeenCalledOnce()

    resolveFirstRestart?.()
    await vi.waitFor(() => {
      expect(playerStore.restartPlaybackForAudioOutputChange).toHaveBeenCalledTimes(2)
    })
  })

  it('waits for Voicemeeter Remote route readiness before restarting from another native route', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'exclusive', sharedDeviceId: 'chromium-usb' }
    })
    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'exclusive',
      activeMode: 'exclusive',
      deviceId: '0:Speakers',
      settings: createAudioOutputSettings({
        mode: 'exclusive',
        sharedDeviceId: 'chromium-usb',
        deviceId: '0:Speakers'
      })
    })
    const { playerStore } = mountPlaybackSync({ plugin })

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'voicemeeter',
      activeMode: undefined,
      deviceId: 'VoiceMeeter Input',
      settings: createAudioOutputSettings({
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-usb',
        deviceId: 'VoiceMeeter Input',
        voicemeeterBus: 'B1'
      }),
      voicemeeterRemote: createVoicemeeterRemoteReady({
        routeApplied: false,
        routeBus: 'B1'
      })
    })
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).not.toHaveBeenCalled()

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      deviceId: 'VoiceMeeter Input',
      settings: createAudioOutputSettings({
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-usb',
        deviceId: 'VoiceMeeter Input',
        voicemeeterBus: 'B1'
      }),
      voicemeeterRemote: createVoicemeeterRemoteReady({
        routeBus: 'B1'
      })
    })
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).toHaveBeenCalledOnce()
  })

  it('does not restart again when pending playback already claims the ready Voicemeeter route', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'exclusive', sharedDeviceId: 'chromium-usb' }
    })
    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'exclusive',
      activeMode: 'exclusive',
      deviceId: '0:Speakers',
      settings: createAudioOutputSettings({
        mode: 'exclusive',
        sharedDeviceId: 'chromium-usb',
        deviceId: '0:Speakers'
      })
    })
    const { playerStore } = mountPlaybackSync({ plugin })

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'voicemeeter',
      activeMode: undefined,
      deviceId: 'VoiceMeeter Input',
      settings: createAudioOutputSettings({
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-usb',
        deviceId: 'VoiceMeeter Input',
        voicemeeterBus: 'B1'
      }),
      nativePlaybackRunning: true,
      nativePlaybackSource: 'https://song.test/current.mp3',
      nativePlaybackState: 'starting',
      nativePlaybackToken: 'native-playback-current',
      voicemeeterRemote: createVoicemeeterRemoteReady({
        routeApplied: false,
        routeBus: 'B1'
      })
    })
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).not.toHaveBeenCalled()

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      deviceId: 'VoiceMeeter Input',
      settings: createAudioOutputSettings({
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-usb',
        deviceId: 'VoiceMeeter Input',
        voicemeeterBus: 'B1'
      }),
      nativePlaybackRunning: true,
      nativePlaybackSource: 'https://song.test/current.mp3',
      nativePlaybackState: 'starting',
      nativePlaybackToken: 'native-playback-current',
      voicemeeterRemote: createVoicemeeterRemoteReady({
        routeBus: 'B1'
      })
    })
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).not.toHaveBeenCalled()
  })

  it('restarts when a ready Voicemeeter route still reports stale playback from the previous native route', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'exclusive', sharedDeviceId: 'chromium-usb' }
    })
    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'exclusive',
      activeMode: 'exclusive',
      deviceId: '0:Speakers',
      settings: createAudioOutputSettings({
        mode: 'exclusive',
        sharedDeviceId: 'chromium-usb',
        deviceId: '0:Speakers'
      })
    })
    const { playerStore } = mountPlaybackSync({ plugin })

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'voicemeeter',
      activeMode: undefined,
      deviceId: 'VoiceMeeter Input',
      settings: createAudioOutputSettings({
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-usb',
        deviceId: 'VoiceMeeter Input',
        voicemeeterBus: 'B1'
      }),
      nativePlaybackRunning: true,
      nativePlaybackSource: 'https://song.test/old-exclusive.mp3',
      nativePlaybackState: 'starting',
      nativePlaybackToken: 'native-playback-old-exclusive',
      voicemeeterRemote: createVoicemeeterRemoteReady({
        routeApplied: false,
        routeBus: 'B1'
      })
    })
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).not.toHaveBeenCalled()

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      deviceId: 'VoiceMeeter Input',
      settings: createAudioOutputSettings({
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-usb',
        deviceId: 'VoiceMeeter Input',
        voicemeeterBus: 'B1'
      }),
      nativePlaybackRunning: true,
      nativePlaybackSource: 'https://song.test/old-exclusive.mp3',
      nativePlaybackState: 'starting',
      nativePlaybackToken: 'native-playback-stale-after-route',
      voicemeeterRemote: createVoicemeeterRemoteReady({
        routeBus: 'B1'
      })
    })
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).toHaveBeenCalledOnce()
  })

  it('does not restart again for Voicemeeter level or position updates after route readiness', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'exclusive', sharedDeviceId: 'chromium-usb' }
    })
    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'exclusive',
      activeMode: 'exclusive',
      deviceId: '0:Speakers',
      settings: createAudioOutputSettings({
        mode: 'exclusive',
        sharedDeviceId: 'chromium-usb',
        deviceId: '0:Speakers'
      })
    })
    const { playerStore } = mountPlaybackSync({ plugin })
    const voicemeeterRemote = createVoicemeeterRemoteReady({
      levelProbe: {
        active: false,
        target: 'outputBus',
        bus: 'A1',
        channelStart: 6,
        channels: 2,
        samples: 1,
        activeSamples: 0,
        maxLevel: 0,
        threshold: 0.001
      }
    })
    const voicemeeterReadyStatus = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      deviceId: 'VoiceMeeter Input',
      settings: createAudioOutputSettings({
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-usb',
        deviceId: 'VoiceMeeter Input',
        voicemeeterBus: 'A1'
      }),
      voicemeeterRemote
    })

    plugin.audioOutputStatus.value = voicemeeterReadyStatus
    await nextTick()
    expect(playerStore.restartPlaybackForAudioOutputChange).toHaveBeenCalledOnce()

    plugin.audioOutputStatus.value = {
      ...voicemeeterReadyStatus,
      nativePlaybackPositionSeconds: 12.5,
      reason: 'Voicemeeter level probe updated.',
      voicemeeterRemote: {
        ...voicemeeterRemote,
        levelProbe: {
          active: true,
          target: 'outputBus',
          bus: 'A1',
          channelStart: 6,
          channels: 2,
          samples: 2,
          activeSamples: 1,
          maxLevel: 0.02,
          threshold: 0.001
        }
      }
    }
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).toHaveBeenCalledOnce()
  })

  it('restarts playback when Voicemeeter HARDWARE OUT routing changes after initialization', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'voicemeeter', sharedDeviceId: 'chromium-usb' }
    })
    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      deviceId: 'VoiceMeeter Input',
      settings: createAudioOutputSettings({
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-usb',
        deviceId: 'VoiceMeeter Input',
        voicemeeterBus: 'B1',
        voicemeeterHardwareOutBus: 'A1',
        voicemeeterHardwareOutDriver: 'wdm',
        voicemeeterHardwareOutDevice: ''
      }),
      voicemeeterRemote: createVoicemeeterRemoteReady({
        routeBus: 'B1'
      })
    })
    const { playerStore } = mountPlaybackSync({ plugin })

    expect(playerStore.restartPlaybackForAudioOutputChange).not.toHaveBeenCalled()

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      deviceId: 'VoiceMeeter Input',
      settings: createAudioOutputSettings({
        mode: 'voicemeeter',
        sharedDeviceId: 'chromium-usb',
        deviceId: 'VoiceMeeter Input',
        voicemeeterBus: 'B1',
        voicemeeterHardwareOutBus: 'A2',
        voicemeeterHardwareOutDriver: 'ks',
        voicemeeterHardwareOutDevice: 'USB DAC'
      }),
      voicemeeterRemote: createVoicemeeterRemoteReady({
        routeBus: 'B1',
        hardwareOutApplied: true,
        hardwareOutBus: 'A2',
        hardwareOutDriver: 'ks',
        hardwareOutDevice: 'USB DAC'
      })
    })
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).toHaveBeenCalledOnce()
  })

  it('waits for configured Voicemeeter HARDWARE OUT before restarting', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'shared', sharedDeviceId: 'chromium-usb' }
    })
    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'shared',
      activeMode: 'shared',
      settings: createAudioOutputSettings({
        mode: 'shared',
        sharedDeviceId: 'chromium-usb'
      })
    })
    const { playerStore } = mountPlaybackSync({ plugin })
    const voicemeeterSettings = createAudioOutputSettings({
      mode: 'voicemeeter',
      sharedDeviceId: 'chromium-usb',
      deviceId: 'VoiceMeeter Input',
      voicemeeterBus: 'A1',
      voicemeeterHardwareOutBus: 'A2',
      voicemeeterHardwareOutDriver: 'ks',
      voicemeeterHardwareOutDevice: 'USB DAC'
    })

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      deviceId: 'VoiceMeeter Input',
      settings: voicemeeterSettings,
      voicemeeterRemote: createVoicemeeterRemoteReady({
        hardwareOutApplied: false,
        hardwareOutBus: 'A2',
        hardwareOutDriver: 'ks',
        hardwareOutDevice: 'USB DAC'
      })
    })
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).not.toHaveBeenCalled()

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      deviceId: 'VoiceMeeter Input',
      settings: voicemeeterSettings,
      voicemeeterRemote: createVoicemeeterRemoteReady({
        hardwareOutApplied: true,
        hardwareOutBus: 'A2',
        hardwareOutDriver: 'ks',
        hardwareOutDevice: 'USB DAC'
      })
    })
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).toHaveBeenCalledOnce()
  })

  it('does not restart playback again when only active native mode changes', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'exclusive', sharedDeviceId: 'chromium-usb' }
    })
    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'exclusive',
      activeMode: undefined,
      deviceId: '0:Speakers',
      settings: createAudioOutputSettings({
        mode: 'exclusive',
        sharedDeviceId: 'chromium-usb',
        deviceId: '0:Speakers'
      })
    })
    const { playerStore } = mountPlaybackSync({ plugin })

    plugin.audioOutputStatus.value = createAudioOutputStatus({
      enabled: true,
      backend: 'native',
      backendAvailable: true,
      helperRunning: true,
      requestedMode: 'exclusive',
      activeMode: 'exclusive',
      deviceId: '0:Speakers',
      settings: createAudioOutputSettings({
        mode: 'exclusive',
        sharedDeviceId: 'chromium-usb',
        deviceId: '0:Speakers'
      })
    })
    await nextTick()

    expect(playerStore.restartPlaybackForAudioOutputChange).not.toHaveBeenCalled()
  })

  it('ignores stale failed syncs after a newer device request is sent', async () => {
    const plugin = createAudioOutputPluginState({
      enabled: true,
      settings: { mode: 'shared', sharedDeviceId: 'slow-device' }
    })
    let rejectSlowSync: ((error: Error) => void) | undefined
    const logger = { warn: vi.fn() }
    const setOutputDevice = vi.fn((deviceId: string) => {
      if (deviceId === 'slow-device') {
        return new Promise<void>((_, reject) => {
          rejectSlowSync = reject
        })
      }

      return Promise.resolve()
    })
    mountPlaybackSync({
      plugin,
      setOutputDevice,
      logger
    })

    ;(plugin.audioOutputSettings as Ref<AudioOutputSettings>).value = createAudioOutputSettings({
      mode: 'shared',
      sharedDeviceId: 'fast-device'
    })
    await nextTick()
    rejectSlowSync?.(new Error('slow failure'))
    await Promise.resolve()

    expect(setOutputDevice).toHaveBeenLastCalledWith('fast-device')
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
