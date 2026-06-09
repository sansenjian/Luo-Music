import { effectScope, nextTick, type EffectScope, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDefaultAudioOutputStatus,
  type AudioOutputStatus
} from '@shared/audioOutput/protocol'
import type { PlatformDescriptor } from '@shared/types/platform'

const pluginServiceMock = vi.hoisted(() => ({
  refreshPlatformDescriptors: vi.fn(async () => []),
  onPlatformsChanged: vi.fn(() => () => {})
}))

const platformServiceMock = vi.hoisted(() => ({
  isElectron: vi.fn(() => true)
}))

const playAudioOutputTestToneMock = vi.hoisted(() => vi.fn())
const audioOutputStatusMock = vi.hoisted(() => ({
  ref: null as Ref<AudioOutputStatus> | null
}))

function createReadyAudioOutputStatus(
  overrides: Partial<AudioOutputStatus> = {}
): AudioOutputStatus {
  return {
    ...createDefaultAudioOutputStatus(),
    enabled: true,
    backend: 'native',
    backendAvailable: true,
    requestedMode: 'shared',
    devices: [],
    ...overrides
  }
}

vi.mock('@/services', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      plugins: () => pluginServiceMock,
      platform: () => platformServiceMock
    }
  }
})

vi.mock('@/composables/useAudioOutputPlugin', async () => {
  const { ref } = await import('vue')
  const { createDefaultAudioOutputStatus } = await import('@shared/audioOutput/protocol')
  audioOutputStatusMock.ref = ref({
    ...createDefaultAudioOutputStatus(),
    enabled: true,
    backend: 'native',
    backendAvailable: true,
    requestedMode: 'shared',
    devices: []
  })

  return {
    useAudioOutputPlugin: () => ({
      audioOutputStatus: audioOutputStatusMock.ref,
      playAudioOutputTestTone: playAudioOutputTestToneMock
    })
  }
})

describe('usePluginManager', () => {
  let activeScope: EffectScope | null = null

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    platformServiceMock.isElectron.mockReturnValue(true)
    playAudioOutputTestToneMock.mockResolvedValue(createReadyAudioOutputStatus())
    if (audioOutputStatusMock.ref) {
      audioOutputStatusMock.ref.value = createReadyAudioOutputStatus()
    }
  })

  afterEach(() => {
    activeScope?.stop()
    activeScope = null
  })

  it('reports native audio output test tone failures from returned status', async () => {
    const { usePluginManager } = await import('@/composables/usePluginManager')
    playAudioOutputTestToneMock.mockResolvedValueOnce({
      enabled: true,
      backend: 'unavailable',
      backendAvailable: false,
      requestedMode: 'exclusive',
      devices: [],
      reason: 'WASAPI exclusive output is busy.'
    })
    activeScope = effectScope()
    const pluginManager = activeScope.run(() =>
      usePluginManager({
        pluginService: pluginServiceMock as never,
        platformService: platformServiceMock
      })
    )
    expect(pluginManager).toBeTruthy()

    await pluginManager!.testAudioOutput({
      id: 'builtin.audio-output'
    } as PlatformDescriptor)

    expect(pluginManager!.errorMessage.value).toBe('WASAPI exclusive output is busy.')
    expect(pluginServiceMock.refreshPlatformDescriptors).not.toHaveBeenCalled()
  })

  it('does not refresh platform descriptors for native playback position updates', async () => {
    const { usePluginManager } = await import('@/composables/usePluginManager')
    expect(audioOutputStatusMock.ref).toBeTruthy()
    audioOutputStatusMock.ref!.value = createReadyAudioOutputStatus({
      nativePlaybackRunning: true,
      nativePlaybackState: 'playing',
      nativePlaybackPositionSeconds: 0
    })
    activeScope = effectScope()
    activeScope.run(() =>
      usePluginManager({
        pluginService: pluginServiceMock as never,
        platformService: platformServiceMock
      })
    )
    pluginServiceMock.refreshPlatformDescriptors.mockClear()

    for (const positionSeconds of [0.04, 0.08, 0.12, 0.16]) {
      audioOutputStatusMock.ref!.value = {
        ...audioOutputStatusMock.ref!.value,
        nativePlaybackPositionSeconds: positionSeconds
      }
      await nextTick()
    }

    expect(pluginServiceMock.refreshPlatformDescriptors).not.toHaveBeenCalled()
  })

  it('does not refresh platform descriptors for high-frequency playback diagnostics', async () => {
    const { usePluginManager } = await import('@/composables/usePluginManager')
    expect(audioOutputStatusMock.ref).toBeTruthy()
    audioOutputStatusMock.ref!.value = createReadyAudioOutputStatus({
      requestedMode: 'voicemeeter',
      activeMode: 'voicemeeter',
      nativePlaybackRunning: true,
      nativePlaybackState: 'playing',
      nativePlaybackDownload: {
        state: 'downloading',
        bytesReceived: 1024,
        totalBytes: 4096,
        rangeSupported: true,
        strategy: 'range-chunk'
      },
      voicemeeterRemote: {
        available: true,
        connected: true,
        routeApplied: true,
        routeManaged: true,
        routeBus: 'A1',
        kind: 'banana',
        virtualInputStrip: 3,
        levelProbe: {
          active: true,
          target: 'virtualInput',
          bus: 'A1',
          strip: 3,
          levelType: 0,
          channelStart: 24,
          channels: 2,
          samples: 25,
          activeSamples: 0,
          maxLevel: 0,
          threshold: 0.001,
          reason: 'No Voicemeeter output level exceeded 0.001 on A1.'
        }
      }
    })
    activeScope = effectScope()
    activeScope.run(() =>
      usePluginManager({
        pluginService: pluginServiceMock as never,
        platformService: platformServiceMock
      })
    )
    pluginServiceMock.refreshPlatformDescriptors.mockClear()

    for (const [bytesReceived, maxLevel, activeSamples] of [
      [1536, 0.02, 2],
      [2048, 0.04, 4],
      [2560, 0.01, 1]
    ] as const) {
      audioOutputStatusMock.ref!.value = {
        ...audioOutputStatusMock.ref!.value,
        nativePlaybackDownload: {
          ...audioOutputStatusMock.ref!.value.nativePlaybackDownload!,
          bytesReceived
        },
        voicemeeterRemote: {
          ...audioOutputStatusMock.ref!.value.voicemeeterRemote!,
          levelProbe: {
            ...audioOutputStatusMock.ref!.value.voicemeeterRemote!.levelProbe!,
            activeSamples,
            maxLevel,
            reason: 'Voicemeeter output level activity detected on A1.'
          }
        }
      }
      await nextTick()
    }

    expect(pluginServiceMock.refreshPlatformDescriptors).not.toHaveBeenCalled()
  })

  it('refreshes platform descriptors when descriptor-visible audio output fields change', async () => {
    const { usePluginManager } = await import('@/composables/usePluginManager')
    expect(audioOutputStatusMock.ref).toBeTruthy()
    audioOutputStatusMock.ref!.value = createReadyAudioOutputStatus({
      settings: {
        ...createDefaultAudioOutputStatus().settings,
        mode: 'shared'
      }
    })
    activeScope = effectScope()
    activeScope.run(() =>
      usePluginManager({
        pluginService: pluginServiceMock as never,
        platformService: platformServiceMock
      })
    )
    pluginServiceMock.refreshPlatformDescriptors.mockClear()

    audioOutputStatusMock.ref!.value = {
      ...audioOutputStatusMock.ref!.value,
      requestedMode: 'exclusive',
      activeMode: 'exclusive',
      settings: {
        ...audioOutputStatusMock.ref!.value.settings,
        mode: 'exclusive'
      },
      devices: [
        {
          id: '0:Speakers',
          name: 'Speakers',
          isDefault: true,
          backend: 'wasapi'
        }
      ]
    }
    await nextTick()

    expect(pluginServiceMock.refreshPlatformDescriptors).toHaveBeenCalledTimes(1)
  })
})
