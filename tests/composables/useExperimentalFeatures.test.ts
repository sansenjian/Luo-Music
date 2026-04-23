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

    const { experimentalFeatures, smtcEnabled, setSMTCEnabled } = useExperimentalFeatures({
      storageService
    })

    expect(experimentalFeatures.value).toEqual({
      smtcEnabled: true,
      waveformEnabled: false,
      coverSwipeEnabled: false
    })
    expect(smtcEnabled.value).toBe(true)

    setSMTCEnabled(false)

    expect(storageService.setJSON).toHaveBeenCalledWith('experimentalFeatures', {
      smtcEnabled: false,
      waveformEnabled: false,
      coverSwipeEnabled: false
    })
    expect(JSON.parse(store.get('experimentalFeatures') ?? 'null')).toEqual({
      smtcEnabled: false,
      waveformEnabled: false,
      coverSwipeEnabled: false
    })
  })

  it('does not overwrite other settings keys when persisting experiments', async () => {
    const { useExperimentalFeatures } = await import('@/composables/useExperimentalFeatures')
    const { store, storageService } = createStorageServiceMock({
      player: { volume: 0.5 },
      experimentalFeatures: { smtcEnabled: false, waveformEnabled: false, coverSwipeEnabled: false }
    })

    const { setSMTCEnabled } = useExperimentalFeatures({ storageService })

    setSMTCEnabled(true)

    expect(JSON.parse(store.get('player') ?? 'null')).toEqual({ volume: 0.5 })
    expect(JSON.parse(store.get('experimentalFeatures') ?? 'null')).toEqual({
      smtcEnabled: true,
      waveformEnabled: false,
      coverSwipeEnabled: false
    })
  })

  it('persists coverSwipeEnabled independently', async () => {
    const { useExperimentalFeatures } = await import('@/composables/useExperimentalFeatures')
    const { store, storageService } = createStorageServiceMock({
      experimentalFeatures: { smtcEnabled: false, waveformEnabled: false, coverSwipeEnabled: false }
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
