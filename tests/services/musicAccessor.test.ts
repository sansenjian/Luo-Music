import { beforeEach, describe, expect, it, vi } from 'vitest'

const servicesMock = vi.hoisted(() => ({
  music: vi.fn()
}))

vi.mock('@/services', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      music: servicesMock.music
    }
  }
})

function createMusicServiceMock() {
  return {
    search: vi.fn(),
    getSongUrl: vi.fn(),
    getSongDetail: vi.fn(),
    getLyric: vi.fn(),
    getPlaylistDetail: vi.fn()
  }
}

describe('services.music()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves the music service through services.music()', async () => {
    const service = createMusicServiceMock()
    servicesMock.music.mockReturnValue(service)

    const { services } = await import('@/services')
    expect(services.music()).toBe(service)
  })
})
