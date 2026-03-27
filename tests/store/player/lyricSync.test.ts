import { describe, expect, it } from 'vitest'

import { LyricEngine, type LyricLine } from '@/utils/player/core/lyric'
import { ensurePlayerStoreRuntime, resetPlayerStoreRuntime } from '@/store/player/runtime'
import {
  createLyricTimeUpdatePayload,
  getCurrentLyricLine,
  notifyLyricTimeUpdate,
  syncLyricIndex,
  type LyricSyncStore
} from '@/store/player/lyricSync'

function createStore(overrides: Partial<LyricSyncStore> = {}): LyricSyncStore {
  return {
    $dispose: () => {},
    lyricsArray: [],
    currentLyricIndex: -1,
    progress: 0,
    playing: false,
    currentSong: null,
    lyricSong: null,
    ...overrides
  }
}

describe('lyricSync', () => {
  it('maps current lyric line from lyric array by active index', () => {
    const store = createStore({
      lyricsArray: [{ time: 1, text: 'Line', trans: '', roma: '' }],
      currentLyricIndex: 0
    })

    expect(getCurrentLyricLine(store)).toEqual({
      text: 'Line',
      trans: '',
      roma: ''
    })
  })

  it('returns false when no lyric engine runtime is available', () => {
    const store = createStore({
      lyricsArray: [{ time: 1, text: 'Line', trans: '', roma: '' }],
      progress: 1
    })

    expect(syncLyricIndex(store)).toBe(false)
    expect(store.currentLyricIndex).toBe(-1)
  })

  it('updates lyric index from runtime lyric engine', () => {
    const lyrics: LyricLine[] = [
      { time: 1, text: 'L1', trans: '', roma: '' },
      { time: 3, text: 'L2', trans: '', roma: '' }
    ]
    const store = createStore({
      lyricsArray: lyrics,
      progress: 3.2
    })
    const runtime = ensurePlayerStoreRuntime(store)
    runtime.setLyricEngine(new LyricEngine(lyrics))

    expect(syncLyricIndex(store)).toBe(true)
    expect(store.currentLyricIndex).toBe(1)

    resetPlayerStoreRuntime(store)
  })

  it('broadcasts lyric update payload in electron environment', () => {
    const store = createStore({
      lyricsArray: [{ time: 2, text: 'Main', trans: 'Trans', roma: 'Roma' }],
      currentLyricIndex: 0,
      progress: 2.5,
      playing: true,
      currentSong: { id: 1, platform: 'netease' } as never,
      lyricSong: { id: 1, platform: 'netease' } as never
    })
    const send = (channel: string, data: unknown) => {
      sent.push({ channel, data })
    }
    const sent: Array<{ channel: string; data: unknown }> = []

    notifyLyricTimeUpdate(
      store,
      {
        isElectron: () => true,
        send
      },
      2.5
    )

    expect(sent).toEqual([
      {
        channel: 'lyric-time-update',
        data: {
          time: 2.5,
          index: 0,
          text: 'Main',
          trans: 'Trans',
          roma: 'Roma',
          playing: true,
          songId: 1,
          platform: 'netease',
          sequence: 1,
          cause: 'interval'
        }
      }
    ])
  })

  it('increments sequence across desktop lyric payloads', () => {
    const store = createStore({
      lyricsArray: [{ time: 2, text: 'Main', trans: 'Trans', roma: 'Roma' }],
      currentLyricIndex: 0,
      progress: 2.5,
      playing: true,
      currentSong: { id: 'song-1', platform: 'qq' } as never,
      lyricSong: { id: 'song-1', platform: 'qq' } as never
    })

    expect(createLyricTimeUpdatePayload(store, 2.5)).toMatchObject({
      songId: 'song-1',
      platform: 'qq',
      sequence: 1,
      cause: 'interval'
    })
    expect(createLyricTimeUpdatePayload(store, 3)).toMatchObject({
      songId: 'song-1',
      platform: 'qq',
      sequence: 2,
      cause: 'interval'
    })
  })

  it('allows callers to tag desktop lyric payloads with a specific update cause', () => {
    const store = createStore({
      lyricsArray: [{ time: 5, text: 'Seek line', trans: '', roma: '' }],
      currentLyricIndex: 0,
      progress: 5,
      playing: true
    })

    expect(createLyricTimeUpdatePayload(store, 5, 'seek')).toMatchObject({
      time: 5,
      index: 0,
      cause: 'seek',
      sequence: 1
    })
  })

  it('skips lyric payload broadcast outside electron environment', () => {
    const store = createStore()
    const sent: Array<{ channel: string; data: unknown }> = []

    notifyLyricTimeUpdate(store, {
      isElectron: () => false,
      send: (channel, data) => {
        sent.push({ channel, data })
      }
    })

    expect(sent).toEqual([])
  })
})
