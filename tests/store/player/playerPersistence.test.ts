import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPlayerPersistStorage } from '@/store/player/playerPersistence'
import { createMockSong } from '../../utils/test-utils'

function createMemoryStorage(): Storage {
  const data = new Map<string, string>()

  return {
    get length(): number {
      return data.size
    },
    clear(): void {
      data.clear()
    },
    getItem(key: string): string | null {
      return data.get(key) ?? null
    },
    key(index: number): string | null {
      return Array.from(data.keys())[index] ?? null
    },
    removeItem(key: string): void {
      data.delete(key)
    },
    setItem(key: string, value: string): void {
      data.set(key, value)
    }
  } as Storage
}

function readPlayerState(storage: Storage, key = 'player'): Record<string, unknown> {
  return JSON.parse(storage.getItem(key) ?? '{}') as Record<string, unknown>
}

describe('player persistence storage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sanitizes persisted player state and stamps a schema version', () => {
    const backingStorage = createMemoryStorage()
    const storage = createPlayerPersistStorage(backingStorage)

    storage.setItem(
      'player',
      JSON.stringify({
        songList: [
          createMockSong({
            id: 1,
            name: 'Runtime Song',
            url: 'https://song.test/runtime.mp3',
            retryCount: 2
          })
        ],
        currentIndex: 0,
        progress: 30,
        duration: 180
      })
    )

    const persisted = readPlayerState(backingStorage)
    const persistedSong = (persisted.songList as Array<Record<string, unknown>>)[0]

    expect(persisted.version).toBe(1)
    expect(persistedSong.url).toBeUndefined()
    expect(persistedSong.retryCount).toBeUndefined()
  })

  it('throttles progress-only writes while exposing the latest pending value', () => {
    const backingStorage = createMemoryStorage()
    const storage = createPlayerPersistStorage(backingStorage, { progressThrottleMs: 1000 })
    const baseState = {
      volume: 0.7,
      playMode: 0,
      lyricType: ['original', 'trans'],
      isPlayerDocked: true,
      songList: [createMockSong({ id: 1, name: 'Song 1' })],
      currentIndex: 0,
      progress: 0,
      duration: 180
    }

    storage.setItem('player', JSON.stringify(baseState))
    vi.setSystemTime(1_100)
    storage.setItem('player', JSON.stringify({ ...baseState, progress: 10 }))

    expect(readPlayerState(backingStorage).progress).toBe(0)
    expect(JSON.parse(storage.getItem('player') ?? '{}').progress).toBe(10)

    vi.advanceTimersByTime(900)

    expect(readPlayerState(backingStorage).progress).toBe(10)
  })

  it('writes structural changes immediately even when a progress write is pending', () => {
    const backingStorage = createMemoryStorage()
    const storage = createPlayerPersistStorage(backingStorage, { progressThrottleMs: 1000 })
    const baseState = {
      volume: 0.7,
      playMode: 0,
      lyricType: ['original', 'trans'],
      isPlayerDocked: true,
      songList: [createMockSong({ id: 1, name: 'Song 1' })],
      currentIndex: 0,
      progress: 0,
      duration: 180
    }

    storage.setItem('player', JSON.stringify(baseState))
    vi.setSystemTime(1_100)
    storage.setItem('player', JSON.stringify({ ...baseState, progress: 10 }))
    storage.setItem('player', JSON.stringify({ ...baseState, volume: 0.4, progress: 10 }))

    const persisted = readPlayerState(backingStorage)

    expect(persisted.volume).toBe(0.4)
    expect(persisted.progress).toBe(10)
  })

  it('keeps throttled progress pending and retries when delayed persistence fails', () => {
    const backingStorage = createMemoryStorage()
    let failNextWrite = false
    const flakyStorage = {
      get length(): number {
        return backingStorage.length
      },
      clear: vi.fn(() => backingStorage.clear()),
      getItem: vi.fn((key: string) => backingStorage.getItem(key)),
      key: vi.fn((index: number) => backingStorage.key(index)),
      removeItem: vi.fn((key: string) => backingStorage.removeItem(key)),
      setItem: vi.fn((key: string, value: string) => {
        if (failNextWrite) {
          failNextWrite = false
          throw new Error('persist failed')
        }

        backingStorage.setItem(key, value)
      })
    } as Storage
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = createPlayerPersistStorage(flakyStorage, { progressThrottleMs: 1000 })
    const baseState = {
      volume: 0.7,
      playMode: 0,
      lyricType: ['original', 'trans'],
      isPlayerDocked: true,
      songList: [createMockSong({ id: 1, name: 'Song 1' })],
      currentIndex: 0,
      progress: 0,
      duration: 180
    }

    try {
      storage.setItem('player', JSON.stringify(baseState))
      vi.setSystemTime(1_100)
      storage.setItem('player', JSON.stringify({ ...baseState, progress: 10 }))
      failNextWrite = true

      vi.advanceTimersByTime(900)

      expect(warnSpy).toHaveBeenCalledWith(
        '[playerPersistence] Failed to persist throttled player state',
        expect.any(Error)
      )
      expect(readPlayerState(backingStorage).progress).toBe(0)
      expect(JSON.parse(storage.getItem('player') ?? '{}').progress).toBe(10)

      vi.advanceTimersByTime(1000)

      expect(readPlayerState(backingStorage).progress).toBe(10)
    } finally {
      warnSpy.mockRestore()
    }
  })
})
