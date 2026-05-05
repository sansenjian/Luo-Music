import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../helpers/deferred'
import { mountComposable } from '../helpers/mountComposable'

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

const playerStoreState = vi.hoisted(() => ({
  lyricsArray: [] as Array<{ time: number; text: string; trans: string; roma: string }>,
  currentLyricIndex: -1,
  progress: 0,
  playing: false,
  lyricType: ['original', 'trans'] as Array<'original' | 'trans' | 'roma'>
}))

vi.mock('@/services', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      platform: () => platformServiceMock
    }
  }
})

vi.mock('@/store/playerStore', () => ({
  usePlayerStore: () => playerStoreState
}))

async function flushAsyncState(): Promise<void> {
  await Promise.resolve()
  await nextTick()
}

import { useActiveLyricState } from '@/composables/useActiveLyricState'

type HarnessOptions = Parameters<typeof useActiveLyricState>[0]

let harnessOptions: HarnessOptions = { source: 'ipc' }

function mountHarness(options: HarnessOptions = { source: 'ipc' }) {
  harnessOptions = options
  return mountComposable(() => useActiveLyricState(harnessOptions)).wrapper
}

describe('useActiveLyricState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lyricListeners.clear()
    platformServiceMock.isElectron.mockReturnValue(true)
    playerStoreState.lyricsArray = []
    playerStoreState.currentLyricIndex = -1
    playerStoreState.progress = 0
    playerStoreState.playing = false
    playerStoreState.lyricType = ['original', 'trans']
    harnessOptions = { source: 'ipc' }
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

  it('preserves empty lyric text instead of falling back to emptyText', async () => {
    playerStoreState.lyricsArray = [{ time: 0, text: '', trans: '', roma: '' }]
    playerStoreState.currentLyricIndex = 0

    const wrapper = mountHarness({ emptyText: 'fallback' })
    await flushAsyncState()

    const vm = wrapper.vm as unknown as ReturnType<typeof useActiveLyricState>
    expect(vm.currentLyric).toBe('')
  })

  it('does not let a stale snapshot sequence block newer lyric pushes', async () => {
    const snapshotDeferred = createDeferred<{
      currentSong: { id: number; platform: 'netease' }
      currentLyricIndex: number
      progress: number
      isPlaying: boolean
      songId: number
      platform: 'netease'
      sequence: number
      lyrics: Array<{ time: number; text: string; trans: string; roma: string }>
    }>()

    Object.defineProperty(window, 'services', {
      configurable: true,
      value: {
        player: {
          getDesktopLyricSnapshot: vi.fn(() => snapshotDeferred.promise)
        }
      } as unknown
    })

    const wrapper = mountHarness()
    await flushAsyncState()

    lyricListeners.get('lyric-time-update')?.({
      index: 0,
      time: 0,
      text: 'Push line 1',
      trans: '',
      roma: '',
      playing: true,
      songId: 1,
      platform: 'netease',
      sequence: 2
    })
    await flushAsyncState()

    snapshotDeferred.resolve({
      currentSong: { id: 1, platform: 'netease' },
      currentLyricIndex: 0,
      progress: 0,
      isPlaying: true,
      songId: 1,
      platform: 'netease',
      sequence: 10,
      lyrics: [{ time: 0, text: 'Stale snapshot line', trans: '', roma: '' }]
    })
    await flushAsyncState()

    lyricListeners.get('lyric-time-update')?.({
      index: 1,
      time: 5,
      text: 'Push line 2',
      trans: 'Push trans 2',
      roma: '',
      playing: true,
      songId: 1,
      platform: 'netease',
      sequence: 3
    })
    await flushAsyncState()

    const vm = wrapper.vm as unknown as ReturnType<typeof useActiveLyricState>
    expect(vm.currentLyric).toBe('Push line 2')
    expect(vm.currentTrans).toBe('Push trans 2')
  })

  it('resets the exposed lyric index on song change before the next hydration finishes', async () => {
    const nextStateDeferred = createDeferred<{
      isPlaying: boolean
      currentIndex: number
      currentSong: { id: string; platform: 'netease' }
      currentLyricIndex: number
      progress: number
    }>()
    let songChangeListener:
      | ((data: { song: { id: string; platform: 'netease' } | null; index: number }) => void)
      | undefined

    Object.defineProperty(window, 'services', {
      configurable: true,
      value: {
        player: {
          getState: vi
            .fn()
            .mockResolvedValueOnce({
              isPlaying: true,
              currentIndex: 0,
              currentSong: { id: 'song-1', platform: 'netease' },
              currentLyricIndex: 1,
              progress: 5
            })
            .mockImplementationOnce(() => nextStateDeferred.promise),
          getLyric: vi.fn().mockResolvedValue([
            { time: 0, text: 'Line 1', trans: '', roma: '' },
            { time: 5, text: 'Line 2', trans: '', roma: '' }
          ]),
          onSongChange: vi.fn(
            (
              listener: (data: {
                song: { id: string; platform: 'netease' } | null
                index: number
              }) => void
            ) => {
              songChangeListener = listener
              return () => {}
            }
          )
        }
      } as unknown
    })

    const wrapper = mountHarness()
    await flushAsyncState()
    await flushAsyncState()

    const vm = wrapper.vm as unknown as ReturnType<typeof useActiveLyricState>
    expect(vm.currentLyricIndex).toBe(1)

    songChangeListener?.({
      song: { id: 'song-2', platform: 'netease' },
      index: 0
    })
    await flushAsyncState()

    expect(vm.currentLyricIndex).toBe(-1)

    nextStateDeferred.resolve({
      isPlaying: true,
      currentIndex: 0,
      currentSong: { id: 'song-2', platform: 'netease' },
      currentLyricIndex: 0,
      progress: 0
    })
  })
})
