import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const lyricListeners = new Map<string, (payload: unknown) => void>()

const platformServiceMock = vi.hoisted(() => ({
  isElectron: vi.fn(() => true),
  on: vi.fn((channel: string, callback: (payload: unknown) => void) => {
    lyricListeners.set(channel, callback)
    return () => {
      lyricListeners.delete(channel)
    }
  })
}))

vi.mock('../../src/services', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      platform: () => platformServiceMock
    }
  }
})

function createDeferred<T>() {
  let resolve!: (value: T) => void

  const promise = new Promise<T>(nextResolve => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

function mountHarness() {
  const Harness = defineComponent({
    setup() {
      return useActiveLyricState({ source: 'ipc' })
    },
    template: '<div />'
  })

  return mount(Harness)
}

async function flushAsyncState(): Promise<void> {
  await Promise.resolve()
  await nextTick()
}

import { useActiveLyricState } from '../../src/composables/useActiveLyricState'

describe('useActiveLyricState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lyricListeners.clear()
    platformServiceMock.isElectron.mockReturnValue(true)
  })

  it('does not let stale hydration overwrite a newer lyric push', async () => {
    const lyricDeferred =
      createDeferred<Array<{ time: number; text: string; trans: string; roma: string }>>()

    Object.defineProperty(window, 'services', {
      configurable: true,
      value: {
        player: {
          getState: vi.fn().mockResolvedValue({
            isPlaying: false,
            currentIndex: 0,
            currentSong: { id: 'song-1', platform: 'netease' },
            currentLyricIndex: 0
          }),
          getLyric: vi.fn(() => lyricDeferred.promise)
        }
      } as unknown
    })

    const wrapper = mountHarness()
    await flushAsyncState()

    lyricListeners.get('lyric-time-update')?.({
      index: 1,
      text: 'Push line',
      trans: 'Push trans',
      roma: 'Push roma',
      playing: true
    })

    lyricDeferred.resolve([{ time: 0, text: 'Hydrate line', trans: '', roma: '' }])
    await flushAsyncState()

    const vm = wrapper.vm as unknown as ReturnType<typeof useActiveLyricState>
    expect(vm.currentLyric).toBe('Push line')
    expect(vm.currentTrans).toBe('Push trans')
    expect(vm.currentRoma).toBe('Push roma')
    expect(vm.isPlaying).toBe(true)
  })

  it('exposes the current lyric line for ipc-based consumers', async () => {
    Object.defineProperty(window, 'services', {
      configurable: true,
      value: {
        player: {
          getState: vi.fn().mockResolvedValue({
            isPlaying: false,
            currentIndex: -1,
            currentSong: null,
            currentLyricIndex: -1
          }),
          getLyric: vi.fn().mockResolvedValue([])
        }
      } as unknown
    })

    const wrapper = mountHarness()
    await flushAsyncState()

    lyricListeners.get('lyric-time-update')?.({
      index: 1,
      text: 'Push line',
      trans: 'Push trans',
      roma: 'Push roma',
      playing: true
    })
    await flushAsyncState()

    const vm = wrapper.vm as unknown as ReturnType<typeof useActiveLyricState>
    expect(vm.currentLine).toEqual({
      time: 0,
      text: 'Push line',
      trans: 'Push trans',
      roma: 'Push roma'
    })
  })

  it('exposes hydrated lyrics for ipc-based consumers', async () => {
    const hydratedLyrics = [
      { time: 0, text: 'Line 1', trans: 'Trans 1', roma: 'Roma 1' },
      { time: 5, text: 'Line 2', trans: '', roma: '' }
    ]

    Object.defineProperty(window, 'services', {
      configurable: true,
      value: {
        player: {
          getState: vi.fn().mockResolvedValue({
            isPlaying: false,
            currentIndex: 0,
            currentSong: { id: 'song-1', platform: 'netease' },
            currentLyricIndex: 0
          }),
          getLyric: vi.fn().mockResolvedValue(hydratedLyrics)
        }
      } as unknown
    })

    const wrapper = mountHarness()
    await flushAsyncState()

    const vm = wrapper.vm as unknown as ReturnType<typeof useActiveLyricState>
    expect(vm.lyrics).toEqual(hydratedLyrics)
    expect(vm.currentLine).toEqual(hydratedLyrics[0])
  })
})
