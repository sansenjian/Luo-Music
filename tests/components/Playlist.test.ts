import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import Playlist from '../../src/components/Playlist.vue'
import { usePlayerStore } from '../../src/store/playerStore.ts'
import type { Song } from '../../src/platform/music/interface'

HTMLElement.prototype.scrollTo = vi.fn()

function createMockSong(overrides: Partial<Song> & Record<string, unknown> = {}): Song {
  return {
    id: overrides.id ?? 1,
    name: String(overrides.name ?? 'Song'),
    artists: overrides.artists ?? [{ id: 1, name: String(overrides.artist ?? 'Artist') }],
    album: overrides.album ?? {
      id: 1,
      name: String(overrides.albumName ?? 'Album'),
      picUrl: String(overrides.pic ?? '')
    },
    duration: Number(overrides.duration ?? 180000),
    mvid: overrides.mvid ?? 0,
    platform: (overrides.platform as 'netease' | 'qq') ?? 'netease',
    originalId: overrides.originalId ?? overrides.id ?? 1,
    ...overrides
  }
}

describe('Playlist.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders empty state when no songs', () => {
    const store = usePlayerStore()
    store.songList = []

    const wrapper = mount(Playlist)

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('NO TRACKS LOADED')
  })

  it('renders song list correctly', () => {
    const store = usePlayerStore()
    store.songList = [
      createMockSong({
        id: 1,
        name: 'Song 1',
        artists: [{ id: 1, name: 'Artist 1' }],
        album: { id: 11, name: 'Album 1', picUrl: 'cover-1.jpg' },
        duration: 180000,
        platform: 'netease'
      }),
      createMockSong({
        id: 2,
        name: 'Song 2',
        artists: [{ id: 2, name: 'Artist 2' }],
        album: { id: 12, name: 'Album 2', picUrl: 'cover-2.jpg' },
        duration: 200000,
        platform: 'qq'
      })
    ]
    store.currentIndex = 0

    const wrapper = mount(Playlist)
    const items = wrapper.findAll('.list-item')

    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('Song 1')
    expect(items[0].text()).toContain('Artist 1')
    expect(items[1].text()).toContain('Song 2')
    expect(items[0].find('img').attributes('src')).toBe('cover-1.jpg')
    expect(items[0].find('.server-badge.netease').exists()).toBe(true)
    expect(items[1].find('.server-badge.qq').exists()).toBe(true)
  })

  it('highlights current playing song', () => {
    const store = usePlayerStore()
    store.songList = [
      createMockSong({ id: 1, name: 'Song 1', artist: 'Artist 1' }),
      createMockSong({ id: 2, name: 'Song 2', artist: 'Artist 2' })
    ]
    store.currentIndex = 1
    store.playing = true

    const wrapper = mount(Playlist)
    const items = wrapper.findAll('.list-item')

    expect(items[1].classes()).toContain('active')
    expect(items[1].find('.playing-indicator').exists()).toBe(true)
    expect(items[0].classes()).not.toContain('active')
  })

  it('emits play-song event when clicking a song', async () => {
    const store = usePlayerStore()
    store.songList = [
      createMockSong({ id: 1, name: 'Song 1', artist: 'Artist 1' }),
      createMockSong({ id: 2, name: 'Song 2', artist: 'Artist 2' })
    ]

    const wrapper = mount(Playlist)
    const items = wrapper.findAll('.list-item')
    await items[1].trigger('click')

    expect(wrapper.emitted('play-song')).toBeTruthy()
    expect(wrapper.emitted('play-song')?.[0]).toEqual([1])
  })

  it('scrolls to current song when index changes', async () => {
    const store = usePlayerStore()
    store.songList = [
      createMockSong({ id: 1, name: 'Song 1' }),
      createMockSong({ id: 2, name: 'Song 2' }),
      createMockSong({ id: 3, name: 'Song 3' })
    ]
    store.currentIndex = 0

    const wrapper = mount(Playlist)
    store.currentIndex = 2
    await wrapper.vm.$nextTick()
    await Promise.resolve()

    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled()
  })

  it('virtualizes large playlists instead of rendering the full list at once', () => {
    const store = usePlayerStore()
    store.songList = Array.from({ length: 200 }, (_, index) =>
      createMockSong({
        id: index + 1,
        name: `Song ${index + 1}`
      })
    )

    const wrapper = mount(Playlist)
    const items = wrapper.findAll('.list-item')

    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThan(store.songList.length)
  })

  it('clamps scroll position when the playlist shrinks after a deep scroll', async () => {
    const store = usePlayerStore()
    store.songList = Array.from({ length: 200 }, (_, index) =>
      createMockSong({
        id: index + 1,
        name: `Song ${index + 1}`
      })
    )

    const wrapper = mount(Playlist, {
      attachTo: document.body
    })
    const listElement = wrapper.get('.playlist').element as HTMLElement

    listElement.scrollTop = 9000
    await wrapper.get('.playlist').trigger('scroll')

    store.songList = [
      createMockSong({ id: 1, name: 'Song 1' }),
      createMockSong({ id: 2, name: 'Song 2' })
    ]
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    const items = wrapper.findAll('.list-item')

    expect(listElement.scrollTop).toBe(0)
    expect(items).toHaveLength(2)
    expect(items[0].attributes('data-index')).toBe('0')

    wrapper.unmount()
  })
})
