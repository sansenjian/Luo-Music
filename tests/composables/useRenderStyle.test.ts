import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageServiceMock = vi.hoisted(() => ({
  getItem: vi.fn<(key: string) => string | null>(() => null),
  setItem: vi.fn()
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

describe('useRenderStyle', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    storageServiceMock.getItem.mockReturnValue(null)
    delete document.documentElement.dataset.renderStyle
  })

  it('defaults to the classic render style and applies it to the document', async () => {
    const { useRenderStyle: useRenderStyleFactory } = await import('@/composables/useRenderStyle')
    const { renderStyle } = useRenderStyleFactory()

    expect(renderStyle.value).toBe('classic')
    expect(document.documentElement.dataset.renderStyle).toBe('classic')
  })

  it('restores and persists the selected render style', async () => {
    storageServiceMock.getItem.mockReturnValue('red')
    const { useRenderStyle: useRenderStyleFactory } = await import('@/composables/useRenderStyle')
    const { renderStyle, setRenderStyle } = useRenderStyleFactory()

    expect(renderStyle.value).toBe('red')
    expect(document.documentElement.dataset.renderStyle).toBe('red')

    setRenderStyle('classic')

    expect(storageServiceMock.setItem).toHaveBeenCalledWith('renderStyle', 'classic')
    expect(document.documentElement.dataset.renderStyle).toBe('classic')
  })
})
