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
      }),
      setJSON: vi.fn(<T>(key: string, value: T): void => {
        store.set(key, JSON.stringify(value))
      })
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

    expect(experimentalFeatures.value).toEqual({ smtcEnabled: false })
    expect(smtcEnabled.value).toBe(false)
  })

  it('restores and persists experimental features through an independent JSON key', async () => {
    const { useExperimentalFeatures } = await import('@/composables/useExperimentalFeatures')
    const { store, storageService } = createStorageServiceMock({
      experimentalFeatures: { smtcEnabled: true }
    })

    const { experimentalFeatures, smtcEnabled, setSMTCEnabled } = useExperimentalFeatures({
      storageService
    })

    expect(experimentalFeatures.value).toEqual({ smtcEnabled: true })
    expect(smtcEnabled.value).toBe(true)

    setSMTCEnabled(false)

    expect(storageService.setJSON).toHaveBeenCalledWith('experimentalFeatures', {
      smtcEnabled: false
    })
    expect(JSON.parse(store.get('experimentalFeatures') ?? 'null')).toEqual({
      smtcEnabled: false
    })
  })

  it('does not overwrite other settings keys when persisting experiments', async () => {
    const { useExperimentalFeatures } = await import('@/composables/useExperimentalFeatures')
    const { store, storageService } = createStorageServiceMock({
      player: { volume: 0.5 },
      experimentalFeatures: { smtcEnabled: false }
    })

    const { setSMTCEnabled } = useExperimentalFeatures({ storageService })

    setSMTCEnabled(true)

    expect(JSON.parse(store.get('player') ?? 'null')).toEqual({ volume: 0.5 })
    expect(JSON.parse(store.get('experimentalFeatures') ?? 'null')).toEqual({
      smtcEnabled: true
    })
  })
})
