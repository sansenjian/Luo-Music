import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

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
    document.documentElement.style.removeProperty('--accent')
  })

  it('only exposes render styles backed by enabled theme resources', async () => {
    const { getPlatformDescriptors } = await import('@/platform/music/descriptors')
    const { useProjectUi } = await import('@/composables/useProjectUi')
    const { availableRenderStyleOptions, setRenderStyle } = useProjectUi({
      musicService: { getPlatformDescriptors }
    })

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

  it('allows render styles contributed by enabled theme plugins', async () => {
    const { getPlatformDescriptors, replaceRuntimePlatformDescriptors } =
      await import('@/platform/music/descriptors')
    replaceRuntimePlatformDescriptors([
      {
        id: 'community-theme',
        displayName: 'Community Theme',
        source: 'external',
        runtime: 'external-host',
        category: 'theme',
        enabled: true,
        status: 'ready',
        capabilities: {
          search: false,
          songUrl: false,
          songDetail: false,
          lyric: false,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: false,
          supportsUrlRefreshOnFailure: false
        },
        themeResources: [
          {
            id: 'community-theme.ocean',
            label: '海风主题',
            renderStyle: 'community.ocean',
            cssVariables: {
              '--accent': '#006d77'
            }
          }
        ]
      }
    ])

    const { useProjectUi } = await import('@/composables/useProjectUi')
    const { availableRenderStyleOptions, setRenderStyle } = useProjectUi({
      musicService: { getPlatformDescriptors }
    })

    expect(availableRenderStyleOptions.value.map(option => option.value)).toContain(
      'community.ocean'
    )

    setRenderStyle('community.ocean')

    expect(storageServiceMock.setItem).toHaveBeenCalledWith('renderStyle', 'community.ocean')
    expect(document.documentElement.dataset.renderStyle).toBe('community.ocean')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#006d77')
  })
})
