import { beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('useExperimentalFeatures', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('defaults SMTC to disabled', async () => {
    const { useExperimentalFeatures } = await import('@/composables/useExperimentalFeatures')
    const { storageService } = createStorageServiceMock()
    const { experimentalFeatures, smtcEnabled } = useExperimentalFeatures({ storageService })

    expect(experimentalFeatures.value).toEqual({
      smtcEnabled: false,
      waveformEnabled: false,
      coverSwipeEnabled: false
    })
    expect(smtcEnabled.value).toBe(false)
  })

  it('restores and persists experimental features through an independent JSON key', async () => {
    const { useExperimentalFeatures } = await import('@/composables/useExperimentalFeatures')
    const { store, storageService } = createStorageServiceMock({
      experimentalFeatures: { smtcEnabled: true, waveformEnabled: false, coverSwipeEnabled: false }
    })
    const smtcMainBridge = {
      setEnabled: vi.fn()
    }

    const { experimentalFeatures, smtcEnabled, setSMTCEnabled } = useExperimentalFeatures({
      storageService,
      smtcMainBridge
    })

    expect(experimentalFeatures.value).toEqual({
      smtcEnabled: true,
      waveformEnabled: false,
      coverSwipeEnabled: false
    })
    expect(smtcEnabled.value).toBe(true)
    expect(smtcMainBridge.setEnabled).toHaveBeenCalledWith(true)

    setSMTCEnabled(false)

    expect(storageService.setJSON).toHaveBeenCalledWith('experimentalFeatures', {
      smtcEnabled: false,
      waveformEnabled: false,
      coverSwipeEnabled: false
    })
    expect(smtcMainBridge.setEnabled).toHaveBeenLastCalledWith(false)
    expect(JSON.parse(store.get('experimentalFeatures') ?? 'null')).toEqual({
      smtcEnabled: false,
      waveformEnabled: false,
      coverSwipeEnabled: false
    })
  })

  it('stores the native SMTC status returned by the main process', async () => {
    const { useExperimentalFeatures } = await import('@/composables/useExperimentalFeatures')
    const { storageService } = createStorageServiceMock()
    const smtcMainBridge = {
      setEnabled: vi.fn().mockResolvedValue({
        enabled: true,
        backend: 'native',
        nativeAvailable: true,
        helperRunning: true,
        restartRequired: false,
        helperPath: 'D:\\app\\native\\smtc-helper.exe'
      })
    }

    const { setSMTCEnabled, smtcNativeStatus } = useExperimentalFeatures({
      storageService,
      smtcMainBridge
    })

    setSMTCEnabled(true)
    expect(smtcNativeStatus.value).toMatchObject({
      enabled: true,
      backend: 'disabled',
      helperRunning: false
    })

    await Promise.resolve()

    expect(smtcNativeStatus.value).toMatchObject({
      enabled: true,
      backend: 'native',
      nativeAvailable: true,
      helperRunning: true,
      restartRequired: false
    })
  })

  it('accepts native SMTC status delivered through the status listener', async () => {
    const { useExperimentalFeatures } = await import('@/composables/useExperimentalFeatures')
    const { storageService } = createStorageServiceMock()
    const pushedStatus = {
      enabled: true,
      backend: 'native',
      nativeAvailable: true,
      helperRunning: true,
      restartRequired: false
    } as const
    const statusListeners: Array<(status: typeof pushedStatus) => void> = []
    const smtcMainBridge = {
      setEnabled: vi.fn(),
      subscribeStatus: vi.fn((listener: (status: typeof pushedStatus) => void) => {
        statusListeners.push(listener)
      })
    }

    const { setSMTCEnabled, smtcNativeStatus } = useExperimentalFeatures({
      storageService,
      smtcMainBridge
    })

    setSMTCEnabled(true)
    expect(smtcMainBridge.setEnabled).toHaveBeenCalledWith(true)
    expect(smtcNativeStatus.value).toMatchObject({
      enabled: true,
      backend: 'disabled',
      helperRunning: false
    })

    const emitStatus = statusListeners[0]
    expect(emitStatus).toBeTypeOf('function')
    if (!emitStatus) {
      throw new Error('Expected status listener to be registered')
    }
    emitStatus(pushedStatus)
    await Promise.resolve()

    expect(smtcNativeStatus.value).toMatchObject({
      enabled: true,
      backend: 'native',
      helperRunning: true
    })
  })

  it('seeds native SMTC status from the main process during initialization', async () => {
    const { useExperimentalFeatures } = await import('@/composables/useExperimentalFeatures')
    const { storageService } = createStorageServiceMock({
      experimentalFeatures: { smtcEnabled: true, waveformEnabled: false, coverSwipeEnabled: false }
    })
    const smtcMainBridge = {
      getStatus: vi.fn().mockResolvedValue({
        enabled: true,
        backend: 'native',
        nativeAvailable: true,
        helperRunning: true,
        restartRequired: false
      }),
      setEnabled: vi.fn().mockResolvedValue({
        enabled: true,
        backend: 'native',
        nativeAvailable: true,
        helperRunning: true,
        restartRequired: false
      })
    }

    const { smtcNativeStatus } = useExperimentalFeatures({
      storageService,
      smtcMainBridge
    })

    await Promise.resolve()

    expect(smtcMainBridge.getStatus).toHaveBeenCalledTimes(1)
    expect(smtcNativeStatus.value).toMatchObject({
      enabled: true,
      backend: 'native',
      nativeAvailable: true,
      helperRunning: true
    })
  })

  it('does not overwrite other settings keys when persisting experiments', async () => {
    const { useExperimentalFeatures } = await import('@/composables/useExperimentalFeatures')
    const { store, storageService } = createStorageServiceMock({
      player: { volume: 0.5 },
      experimentalFeatures: {
        smtcEnabled: false,
        waveformEnabled: false,
        coverSwipeEnabled: false
      }
    })

    const { setSMTCEnabled, smtcNativeStatus } = useExperimentalFeatures({ storageService })

    setSMTCEnabled(true)

    expect(JSON.parse(store.get('player') ?? 'null')).toEqual({ volume: 0.5 })
    expect(JSON.parse(store.get('experimentalFeatures') ?? 'null')).toEqual({
      smtcEnabled: true,
      waveformEnabled: false,
      coverSwipeEnabled: false
    })
    expect(smtcNativeStatus.value).toMatchObject({
      enabled: true,
      backend: 'chromium'
    })
  })

  it('persists coverSwipeEnabled independently', async () => {
    const { useExperimentalFeatures } = await import('@/composables/useExperimentalFeatures')
    const { store, storageService } = createStorageServiceMock({
      experimentalFeatures: {
        smtcEnabled: false,
        waveformEnabled: false,
        coverSwipeEnabled: false
      }
    })

    const { coverSwipeEnabled, setCoverSwipeEnabled } = useExperimentalFeatures({ storageService })

    expect(coverSwipeEnabled.value).toBe(false)

    setCoverSwipeEnabled(true)

    expect(storageService.setJSON).toHaveBeenCalledWith('experimentalFeatures', {
      smtcEnabled: false,
      waveformEnabled: false,
      coverSwipeEnabled: true
    })
    expect(JSON.parse(store.get('experimentalFeatures') ?? 'null')).toEqual({
      smtcEnabled: false,
      waveformEnabled: false,
      coverSwipeEnabled: true
    })
  })
})
