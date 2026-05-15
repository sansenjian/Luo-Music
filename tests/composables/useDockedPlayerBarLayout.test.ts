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

describe('useDockedPlayerBarLayout', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    storageServiceMock.getItem.mockReturnValue(null)
  })

  it('defaults to the full-width docked player bar layout', async () => {
    const { useDockedPlayerBarLayout } = await import('@/composables/useDockedPlayerBarLayout')
    const { dockedPlayerBarLayout } = useDockedPlayerBarLayout()

    expect(dockedPlayerBarLayout.value).toBe('full')
  })

  it('restores and persists the selected docked player bar layout', async () => {
    storageServiceMock.getItem.mockImplementation((key: string) =>
      key === 'dockedPlayerBarLayout' ? 'with-sidebar' : null
    )
    const { useDockedPlayerBarLayout } = await import('@/composables/useDockedPlayerBarLayout')
    const { dockedPlayerBarLayout, setDockedPlayerBarLayout } = useDockedPlayerBarLayout()

    expect(dockedPlayerBarLayout.value).toBe('with-sidebar')

    setDockedPlayerBarLayout('full')

    expect(storageServiceMock.setItem).toHaveBeenCalledWith('dockedPlayerBarLayout', 'full')
    expect(dockedPlayerBarLayout.value).toBe('full')
  })
})
