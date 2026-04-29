import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageServiceMock = vi.hoisted(() => ({
  getItem: vi.fn<(key: string) => string | null>(() => null),
  getJSON: vi.fn<(key: string) => unknown>(() => null),
  setItem: vi.fn(),
  setJSON: vi.fn()
}))

vi.mock('@/services', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      storage: () => storageServiceMock
    }
  }
})

describe('useProjectUi', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    storageServiceMock.getItem.mockReturnValue(null)
    storageServiceMock.getJSON.mockReturnValue(null)
    delete document.documentElement.dataset.renderStyle
  })

  it('only exposes render styles backed by enabled theme resources', async () => {
    const { useProjectUi } = await import('@/composables/useProjectUi')
    const { availableRenderStyleOptions, setRenderStyle } = useProjectUi()

    expect(availableRenderStyleOptions.value.map(option => option.value)).toEqual(['classic'])

    setRenderStyle('brand')

    expect(storageServiceMock.setItem).toHaveBeenCalledWith('renderStyle', 'classic')
    expect(document.documentElement.dataset.renderStyle).toBe('classic')
  })

  it('allows brand style selection after the built-in theme resource is enabled', async () => {
    storageServiceMock.getJSON.mockImplementation((key: string) =>
      key === 'themeResourcePacks' ? { enabledThemeResourcePackIds: ['builtin.brand-theme'] } : null
    )

    const { useProjectUi } = await import('@/composables/useProjectUi')
    const { availableRenderStyleOptions, setRenderStyle } = useProjectUi()

    expect(availableRenderStyleOptions.value.map(option => option.value)).toEqual([
      'classic',
      'brand'
    ])

    setRenderStyle('brand')

    expect(storageServiceMock.setItem).toHaveBeenCalledWith('renderStyle', 'brand')
    expect(document.documentElement.dataset.renderStyle).toBe('brand')
  })
})
