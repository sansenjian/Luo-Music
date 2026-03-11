import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Playlist from '../../src/components/Playlist.vue'
import { usePlayerStore } from '../../src/store/playerStore.ts'

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

interface MockSong {
  id: number
  name: string
  artist: string
  duration?: number
  server?: string
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
      { id: 1, name: 'Song 1', artist: 'Artist 1', duration: 180, server: 'netease' },
      { id: 2, name: 'Song 2', artist: 'Artist 2', duration: 200, server: 'qq' }
    ] as MockSong[]
    store.currentIndex = 0
    
    const wrapper = mount(Playlist)
    
    const items = wrapper.findAll('.list-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('Song 1')
    expect(items[0].text()).toContain('Artist 1')
    expect(items[1].text()).toContain('Song 2')
    
    // Check server badges
    expect(items[0].find('.server-badge.netease').exists()).toBe(true)
    expect(items[1].find('.server-badge.qq').exists()).toBe(true)
  })

  it('highlights current playing song', () => {
    const store = usePlayerStore()
    store.songList = [
      { id: 1, name: 'Song 1', artist: 'Artist 1' },
      { id: 2, name: 'Song 2', artist: 'Artist 2' }
    ] as MockSong[]
    store.currentIndex = 1 // Second song active
    store.playing = true
    
    const wrapper = mount(Playlist)
    
    const items = wrapper.findAll('.list-item')
    expect(items[1].classes()).toContain('active')
    expect(items[1].find('.playing-indicator').exists()).toBe(true)
    
    // First song not active
    expect(items[0].classes()).not.toContain('active')
  })

  it('emits play-song event when clicking a song', async () => {
    const store = usePlayerStore()
    store.songList = [
      { id: 1, name: 'Song 1', artist: 'Artist 1' },
      { id: 2, name: 'Song 2', artist: 'Artist 2' }
    ] as MockSong[]
    
    const wrapper = mount(Playlist)
    
    const items = wrapper.findAll('.list-item')
    await items[1].trigger('click')
    
    expect(wrapper.emitted('play-song')).toBeTruthy()
    expect(wrapper.emitted('play-song')![0]).toEqual([1]) // Index 1
  })

  it('scrolls to current song when index changes', async () => {
    const store = usePlayerStore()
    store.songList = [
      { id: 1, name: 'Song 1' },
      { id: 2, name: 'Song 2' },
      { id: 3, name: 'Song 3' }
    ] as MockSong[]
    store.currentIndex = 0
    
    const wrapper = mount(Playlist)
    
    // Manually set ref value because JSDOM doesn't handle template refs perfectly in some cases
    // or just rely on the watch effect
    
    // Update index
    store.currentIndex = 2
    await wrapper.vm.$nextTick()
    
    // Since we mocked scrollIntoView on Element.prototype, we can check if it was called
    // However, getting the exact element instance might be tricky.
    // Let's verify that the watch callback logic executes.
    
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})
