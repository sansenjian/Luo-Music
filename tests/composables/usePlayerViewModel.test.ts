import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import { COMMANDS } from '../../src/core/commands/commands'
import { usePlayerViewModel } from '../../src/composables/usePlayerViewModel'
import type { Song } from '../../src/platform/music/interface'
import { usePlayerStore } from '../../src/store/playerStore'

const executeMock = vi.hoisted(() => vi.fn())
const canExecuteMock = vi.hoisted(() => vi.fn<(command: string) => boolean>(() => true))

vi.mock('../../src/services', () => ({
  services: {
    commands: () => ({
      execute: executeMock,
      canExecute: canExecuteMock
    })
  }
}))

vi.mock('../../src/composables/useAnimations', () => ({
  animateButtonClick: vi.fn(),
  animatePlayPause: vi.fn(),
  animateAlbumCover: vi.fn(),
  animateLoopMode: vi.fn()
}))

function createSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 1,
    name: 'Test Song',
    artists: [{ id: 1, name: 'Jay' }],
    album: { id: 1, name: 'Album', picUrl: 'https://example.com/cover.jpg' },
    duration: 180000,
    mvid: 0,
    platform: 'qq',
    originalId: 1,
    ...overrides
  }
}

function getVmValue<T>(source: T | { value: T }): T {
  if (source && typeof source === 'object' && 'value' in source) {
    return (source as { value: T }).value
  }
  return source as T
}

function mountHarness(): VueWrapper {
  const Harness = defineComponent({
    setup() {
      return usePlayerViewModel()
    },
    render() {
      return h('div')
    }
  })

  return mount(Harness)
}

describe('usePlayerViewModel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    canExecuteMock.mockReturnValue(true)
  })

  it('falls back to default cover for unsafe urls', async () => {
    const wrapper = mountHarness()
    const store = usePlayerStore()

    store.songList = [
      createSong({
        album: { id: 1, name: 'Album', picUrl: 'javascript:alert(1)' }
      })
    ]
    store.currentIndex = 0
    await nextTick()

    const coverUrl = getVmValue<string>((wrapper.vm as any).coverUrl)
    expect(coverUrl.startsWith('data:image/svg+xml')).toBe(true)
  })

  it('uses raw https cover url', async () => {
    const wrapper = mountHarness()
    const store = usePlayerStore()
    const url = 'https://cdn.example.com/cover.jpg'

    store.songList = [
      createSong({
        album: { id: 2, name: 'Album', picUrl: url }
      })
    ]
    store.currentIndex = 0
    await nextTick()

    expect(getVmValue<string>((wrapper.vm as any).coverUrl)).toBe(url)
  })

  it('executes play command when it is enabled', async () => {
    const wrapper = mountHarness()
    const store = usePlayerStore()

    store.songList = [createSong()]
    store.currentIndex = 0
    await nextTick()

    ;(wrapper.vm as any).onPlayButtonClick()
    expect(executeMock).toHaveBeenCalledWith(COMMANDS.PLAYER_TOGGLE_PLAY)
  })

  it('does not execute play command when disabled', async () => {
    canExecuteMock.mockImplementation(command => command !== COMMANDS.PLAYER_TOGGLE_PLAY)

    const wrapper = mountHarness()
    const store = usePlayerStore()

    store.songList = [createSong()]
    store.currentIndex = 0
    await nextTick()

    ;(wrapper.vm as any).onPlayButtonClick()
    expect(executeMock).not.toHaveBeenCalledWith(COMMANDS.PLAYER_TOGGLE_PLAY)
  })

  it('maps play mode text by current play mode', async () => {
    const wrapper = mountHarness()
    const store = usePlayerStore()

    store.playMode = 2
    await nextTick()

    expect(getVmValue<string>((wrapper.vm as any).playModeText)).toBe(
      '单曲循环'
    )
  })
})
