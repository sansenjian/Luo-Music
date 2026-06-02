import { nextTick, ref, type Ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useAudioOutputPlaybackSync } from '@/extensions/audioOutput/useAudioOutputPlaybackSync'
import type { AudioOutputSettings, AudioOutputStatus } from '@shared/audioOutput/protocol'
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
    diagnosticsEnabled: false,
    ...overrides
  }
}

function createAudioOutputStatus(overrides: Partial<AudioOutputStatus> = {}): AudioOutputStatus {
  return {
    enabled: false,
    backend: 'disabled',
    backendAvailable: false,
    requestedMode: 'shared',
    devices: [],
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
    logger?: Pick<Console, 'warn'>
  } = {}
) {
  const plugin = options.plugin ?? createAudioOutputPluginState()
  const player = {
    setOutputDevice: vi.fn(options.setOutputDevice ?? (() => Promise.resolve()))
  }
  const logger = options.logger ?? { warn: vi.fn() }

  const { wrapper } = mountComposable(() =>
    useAudioOutputPlaybackSync({
      platformService: { isElectron: () => options.isElectron ?? true },
      audioOutputPlugin: plugin,
      player,
      logger
    })
  )

  return {
    wrapper,
    plugin,
    player,
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
