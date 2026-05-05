import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

function createStorageServiceMock(initialEntries: Record<string, unknown> = {}) {
  const jsonStore = new Map(
    Object.entries(initialEntries).map(([key, value]) => [key, JSON.stringify(value)])
  )
  const itemStore = new Map<string, string>()

  return {
    jsonStore,
    itemStore,
    storageService: {
      getJSON: vi.fn(<T>(key: string): T | null => {
        const value = jsonStore.get(key)
        return value ? (JSON.parse(value) as T) : null
      }) as <T>(key: string) => T | null,
      setJSON: vi.fn(<T>(key: string, value: T): void => {
        jsonStore.set(key, JSON.stringify(value))
      }) as <T>(key: string, value: T) => void,
      getItem: vi.fn((key: string) => itemStore.get(key) ?? null)
    }
  }
}

describe('useThemeResourcePacks', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    document.documentElement.style.removeProperty('--accent')
    delete document.documentElement.dataset.themeResourcePack
    delete document.documentElement.dataset.themePlugin
    document.getElementById('luo-theme-resource-css')?.remove()
  })

  it('defaults the built-in brand theme resource to disabled', async () => {
    const { useThemeResourcePacks } = await import('@/composables/useThemeResourcePacks')
    const { storageService } = createStorageServiceMock()
    const { enabledThemeResourcePackIds, isRenderStyleAvailable, isThemeResourcePackEnabled } =
      useThemeResourcePacks({ storageService })

    expect(enabledThemeResourcePackIds.value).toEqual([])
    expect(isThemeResourcePackEnabled('builtin.brand-theme')).toBe(false)
    expect(isRenderStyleAvailable('classic')).toBe(true)
    expect(isRenderStyleAvailable('brand')).toBe(false)
  })

  it('restores and persists the enabled resource packs', async () => {
    const { useThemeResourcePacks } = await import('@/composables/useThemeResourcePacks')
    const { jsonStore, storageService } = createStorageServiceMock({
      themeResourcePacks: { enabledThemeResourcePackIds: ['builtin.brand-theme'] }
    })

    const { isThemeResourcePackEnabled, setThemeResourcePackEnabled } = useThemeResourcePacks({
      storageService
    })

    expect(isThemeResourcePackEnabled('builtin.brand-theme')).toBe(true)

    setThemeResourcePackEnabled('builtin.brand-theme', false)

    expect(storageService.setJSON).toHaveBeenCalledWith('themeResourcePacks', {
      enabledThemeResourcePackIds: []
    })
    expect(JSON.parse(jsonStore.get('themeResourcePacks') ?? 'null')).toEqual({
      enabledThemeResourcePackIds: []
    })
  })

  it('migrates the legacy brand theme resource flag', async () => {
    const { useThemeResourcePacks } = await import('@/composables/useThemeResourcePacks')
    const { storageService } = createStorageServiceMock({
      themeResourcePacks: { brandThemeEnabled: true }
    })

    const { enabledThemeResourcePackIds, isRenderStyleAvailable } = useThemeResourcePacks({
      storageService
    })

    expect(enabledThemeResourcePackIds.value).toEqual(['builtin.brand-theme'])
    expect(isRenderStyleAvailable('brand')).toBe(true)
  })

  it('keeps the brand resource enabled for users who already selected the brand style', async () => {
    const { useThemeResourcePacks } = await import('@/composables/useThemeResourcePacks')
    const { itemStore, storageService } = createStorageServiceMock()
    itemStore.set('renderStyle', 'brand')

    const { enabledThemeResourcePackIds, isRenderStyleAvailable } = useThemeResourcePacks({
      storageService
    })

    expect(enabledThemeResourcePackIds.value).toEqual(['builtin.brand-theme'])
    expect(isRenderStyleAvailable('brand')).toBe(true)
  })

  it('exposes enabled external theme resources as render styles', async () => {
    const { replaceRuntimePlatformDescriptors } = await import('@/platform/music/descriptors')
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
            },
            cssText:
              ":root[data-render-style='community.ocean'] [data-ui='player'] { border-radius: 24px; }"
          }
        ]
      }
    ])

    const { useThemeResourcePacks } = await import('@/composables/useThemeResourcePacks')
    const {
      availableRenderStyleOptions,
      applyThemeResourceForRenderStyle,
      isRenderStyleAvailable
    } = useThemeResourcePacks({ storageService: createStorageServiceMock().storageService })

    expect(isRenderStyleAvailable('community.ocean')).toBe(true)
    expect(availableRenderStyleOptions.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 'community.ocean',
          label: '海风主题',
          themeResourcePackId: 'community-theme.ocean'
        })
      ])
    )

    applyThemeResourceForRenderStyle('community.ocean')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#006d77')
    expect(document.documentElement.dataset.themeResourcePack).toBe('community-theme.ocean')
    expect(document.documentElement.dataset.themePlugin).toBe('community-theme')
    expect(document.getElementById('luo-theme-resource-css')?.textContent).toContain(
      "[data-ui='player']"
    )

    applyThemeResourceForRenderStyle('classic')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('')
    expect(document.documentElement.dataset.themeResourcePack).toBeUndefined()
    expect(document.documentElement.dataset.themePlugin).toBeUndefined()
    expect(document.getElementById('luo-theme-resource-css')).toBeNull()
  })

  it('does not mount unsafe theme CSS with imports or remote URLs', async () => {
    const { replaceRuntimePlatformDescriptors } = await import('@/platform/music/descriptors')
    replaceRuntimePlatformDescriptors([
      {
        id: 'unsafe-theme',
        displayName: 'Unsafe Theme',
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
            id: 'unsafe-theme.remote',
            label: 'Remote',
            renderStyle: 'unsafe.remote',
            cssText: "@import url('https://example.com/theme.css');"
          }
        ]
      }
    ])

    const { useThemeResourcePacks } = await import('@/composables/useThemeResourcePacks')
    const { applyThemeResourceForRenderStyle } = useThemeResourcePacks({
      storageService: createStorageServiceMock().storageService
    })

    applyThemeResourceForRenderStyle('unsafe.remote')

    expect(document.documentElement.dataset.themeResourcePack).toBe('unsafe-theme.remote')
    expect(document.getElementById('luo-theme-resource-css')).toBeNull()
  })
})
