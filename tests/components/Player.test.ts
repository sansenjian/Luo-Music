import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Player from '../../src/components/Player.vue'

// Mock anime.js
vi.mock('animejs', () => ({
  default: vi.fn(() => ({
    play: vi.fn(),
    pause: vi.fn()
  }))
}))

// Mock composables
vi.mock('../../src/composables/useAnimations.ts', () => ({
  animate: vi.fn(),
  animateButtonClick: vi.fn(),
  animatePlayPause: vi.fn(),
  animateAlbumCover: vi.fn(),
  animateLoopMode: vi.fn()
}))

describe('Player Component', () => {
  it('renders normal mode layout with progress section and volume row', () => {
    const wrapper = mount(Player, {
      props: { compact: false, loading: false }
    })

    expect(wrapper.find('.player-section').exists()).toBe(true)
    expect(wrapper.find('.player-section').classes()).not.toContain('is-compact')
    expect(wrapper.find('.progress-section').exists()).toBe(true)
    expect(wrapper.find('.top-progress-wrapper').exists()).toBe(false)
    expect(wrapper.find('.volume-row').exists()).toBe(true)
  })

  it('renders compact mode layout with top progress bar', () => {
    const wrapper = mount(Player, {
      props: { compact: true, loading: false }
    })

    expect(wrapper.find('.player-section').classes()).toContain('is-compact')
    expect(wrapper.find('.top-progress-wrapper').exists()).toBe(true)
    expect(wrapper.find('.progress-section').exists()).toBe(false)
  })

  it('renders play control buttons with correct roles', () => {
    const wrapper = mount(Player, {
      props: { compact: false, loading: false }
    })

    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThanOrEqual(5) // loop, prev, play, next, lyric

    // Main play button has the ctrl-main class
    const playButton = wrapper.find('.ctrl-main')
    expect(playButton.exists()).toBe(true)

    // Navigation buttons exist
    expect(wrapper.find('.loop-btn').exists()).toBe(true)
    expect(wrapper.find('.lyric-btn').exists()).toBe(true)
  })

  it('shows default track info when no song is playing', () => {
    const wrapper = mount(Player, {
      props: { compact: false, loading: false }
    })

    expect(wrapper.find('.track-title').text()).toBe('Unknown Track')
  })

  it('shows play icon when not playing', () => {
    const wrapper = mount(Player, {
      props: { compact: false, loading: false }
    })

    // The play SVG path (triangle) should be visible when not playing
    const mainButton = wrapper.find('.ctrl-main')
    expect(mainButton.exists()).toBe(true)
    expect(mainButton.find('svg').exists()).toBe(true)
  })

  it('responds to compact prop changes', async () => {
    const wrapper = mount(Player, {
      props: { compact: false, loading: false }
    })

    expect(wrapper.find('.progress-section').exists()).toBe(true)

    await wrapper.setProps({ compact: true })

    expect(wrapper.find('.player-section').classes()).toContain('is-compact')
    expect(wrapper.find('.top-progress-wrapper').exists()).toBe(true)
    expect(wrapper.find('.progress-section').exists()).toBe(false)
  })

  it('can access playerStore', () => {
    const wrapper = mount(Player, {
      props: { compact: false, loading: false }
    })

    const store = (wrapper.vm as unknown as { playerStore: { playing: boolean } }).playerStore
    expect(store).toBeDefined()
    expect(store.playing).toBe(false)
  })
})
