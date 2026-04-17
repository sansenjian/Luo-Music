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

describe('useCompactPlayerFooterLayout', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    storageServiceMock.getItem.mockReturnValue(null)
  })

  it('defaults to the full-width compact footer layout', async () => {
    const { useCompactPlayerFooterLayout } =
      await import('@/composables/useCompactPlayerFooterLayout')
    const { compactPlayerFooterLayout } = useCompactPlayerFooterLayout()

    expect(compactPlayerFooterLayout.value).toBe('full')
  })

  it('restores and persists the selected compact footer layout', async () => {
    storageServiceMock.getItem.mockReturnValue('with-sidebar')
    const { useCompactPlayerFooterLayout } =
      await import('@/composables/useCompactPlayerFooterLayout')
    const { compactPlayerFooterLayout, setCompactPlayerFooterLayout } =
      useCompactPlayerFooterLayout()

    expect(compactPlayerFooterLayout.value).toBe('with-sidebar')

    setCompactPlayerFooterLayout('full')

    expect(storageServiceMock.setItem).toHaveBeenCalledWith('compactPlayerFooterLayout', 'full')
    expect(compactPlayerFooterLayout.value).toBe('full')
  })
})
