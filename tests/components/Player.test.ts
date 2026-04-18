import { computed, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const playerVmState = vi.hoisted(() => ({
  playerStore: {
    playing: false,
    playMode: 0,
    formattedProgress: '00:00',
    formattedDuration: '03:00'
  },
  currentSong: null as null | {
    id: string
    name: string
  },
  progressPercent: 0,
  volumeDisplay: 70,
  artistText: 'Unknown Artist',
  coverUrl: 'cover.jpg',
  playModeSvg: [{ d: 'M0 0' }],
  playModeText: '顺序播放',
  canTogglePlay: true,
  canNavigatePlaylist: true,
  canTogglePlayMode: true,
  canToggleDesktopLyric: true,
  onPlayButtonClick: vi.fn(),
  onPrevButtonClick: vi.fn(),
  onNextButtonClick: vi.fn(),
  onLoopButtonClick: vi.fn(),
  toggleDesktopLyric: vi.fn()
}))

vi.mock('@/composables/usePlayerViewModel', async () => {
  const vue = await import('vue')

  return {
    usePlayerViewModel: () => ({
      playerStore: playerVmState.playerStore,
      playButtonRef: vue.ref(null),
      prevButtonRef: vue.ref(null),
      nextButtonRef: vue.ref(null),
      loopButtonRef: vue.ref(null),
      coverImgRef: vue.ref(null),
      volumeFillRef: vue.ref(null),
      currentSong: vue.computed(() => playerVmState.currentSong),
      progressPercent: vue.computed(() => playerVmState.progressPercent),
      volumePercent: vue.computed(() => playerVmState.volumeDisplay),
      volumeDisplay: vue.computed(() => playerVmState.volumeDisplay),
      artistText: vue.computed(() => playerVmState.artistText),
      coverUrl: vue.computed(() => playerVmState.coverUrl),
      playModeSvg: vue.computed(() => playerVmState.playModeSvg),
      playModeText: vue.computed(() => playerVmState.playModeText),
      canTogglePlay: vue.computed(() => playerVmState.canTogglePlay),
      canNavigatePlaylist: vue.computed(() => playerVmState.canNavigatePlaylist),
      canTogglePlayMode: vue.computed(() => playerVmState.canTogglePlayMode),
      canToggleDesktopLyric: vue.computed(() => playerVmState.canToggleDesktopLyric),
      progressSlider: {
        handlePointerDown: vi.fn(),
        handlePointerMove: vi.fn(),
        handlePointerUp: vi.fn(),
        handleClick: vi.fn()
      },
      volumeSlider: {
        handlePointerDown: vi.fn(),
        handlePointerMove: vi.fn(),
        handlePointerUp: vi.fn(),
        handleClick: vi.fn()
      },
      onPlayButtonClick: playerVmState.onPlayButtonClick,
      onPrevButtonClick: playerVmState.onPrevButtonClick,
      onNextButtonClick: playerVmState.onNextButtonClick,
      toggleDesktopLyric: playerVmState.toggleDesktopLyric,
      onLoopButtonClick: playerVmState.onLoopButtonClick
    })
  }
})

import Player from '@/components/Player.vue'

describe('Player Component', () => {
  beforeEach(() => {
    playerVmState.playerStore.playing = false
    playerVmState.currentSong = null
    playerVmState.progressPercent = 0
    playerVmState.artistText = 'Unknown Artist'
    playerVmState.coverUrl = 'cover.jpg'
    playerVmState.playModeText = '顺序播放'
    playerVmState.canTogglePlay = true
    playerVmState.canNavigatePlaylist = true
    playerVmState.canTogglePlayMode = true
    playerVmState.canToggleDesktopLyric = true
    vi.clearAllMocks()
  })

  it('renders normal mode layout with progress section and volume row', () => {
    const wrapper = mount(Player, {
      props: { docked: false, loading: false }
    })

    expect(wrapper.find('.player-section').exists()).toBe(true)
    expect(wrapper.find('.player-section').classes()).not.toContain('is-docked')
    expect(wrapper.find('.progress-section').exists()).toBe(true)
    expect(wrapper.find('.top-progress-wrapper').exists()).toBe(false)
    expect(wrapper.find('.volume-row').exists()).toBe(true)
  })

  it('renders docked player layout with top progress bar', () => {
    const wrapper = mount(Player, {
      props: { docked: true, loading: false }
    })

    expect(wrapper.find('.player-section').classes()).toContain('is-docked')
    expect(wrapper.find('.top-progress-wrapper').exists()).toBe(true)
    expect(wrapper.find('.progress-section').exists()).toBe(false)
  })

  it('shows default track info when no song is playing', () => {
    const wrapper = mount(Player, {
      props: { docked: false, loading: false }
    })

    expect(wrapper.find('.track-title').text()).toBe('Unknown Track')
    expect(wrapper.find('.track-artist').text()).toBe('Unknown Artist')
  })

  it('wires the player control buttons to the view-model handlers', async () => {
    const wrapper = mount(Player, {
      props: { docked: false, loading: false }
    })

    await wrapper.get('button[aria-label="顺序播放"]').trigger('click')
    await wrapper.get('button[aria-label="上一首"]').trigger('click')
    await wrapper.get('button[aria-label="开始播放"]').trigger('click')
    await wrapper.get('button[aria-label="下一首"]').trigger('click')
    await wrapper.get('button[aria-label="切换桌面歌词"]').trigger('click')

    expect(playerVmState.onLoopButtonClick).toHaveBeenCalledTimes(1)
    expect(playerVmState.onPrevButtonClick).toHaveBeenCalledTimes(1)
    expect(playerVmState.onPlayButtonClick).toHaveBeenCalledTimes(1)
    expect(playerVmState.onNextButtonClick).toHaveBeenCalledTimes(1)
    expect(playerVmState.toggleDesktopLyric).toHaveBeenCalledTimes(1)
  })

  it('updates the main play button aria-label when playback state changes', async () => {
    const wrapper = mount(Player, {
      props: { docked: false, loading: false }
    })

    expect(wrapper.find('button[aria-label="开始播放"]').exists()).toBe(true)

    playerVmState.playerStore.playing = true
    await wrapper.vm.$forceUpdate()

    expect(wrapper.find('button[aria-label="暂停播放"]').exists()).toBe(true)
  })
})
