import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { normalizeRecentPlayItems, useRecentPlayStore } from '@/store/recentPlayStore'

import { createMockSong } from '../utils/test-utils'

describe('recentPlayStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('deduplicates recent songs by identity while keeping the latest copy', () => {
    const store = useRecentPlayStore()
    const qqSong = createMockSong({
      id: 'shared-id',
      platform: 'qq',
      name: 'QQ Old'
    })
    const neteaseSong = createMockSong({
      id: 'shared-id',
      platform: 'netease',
      name: 'Netease'
    })
    const latestQqSong = createMockSong({
      id: 'shared-id',
      platform: 'qq',
      name: 'QQ Latest'
    })

    store.recordSong(qqSong)
    store.recordSong(neteaseSong)
    store.recordSong(latestQqSong)

    expect(store.items).toHaveLength(2)
    expect(store.items[0].song.name).toBe('QQ Latest')
    expect(store.items[0].song).not.toBe(latestQqSong)
    expect(store.items[1].song.name).toBe('Netease')
  })

  it('removes songs by identity without affecting tracks from other platforms', () => {
    const store = useRecentPlayStore()
    const qqSong = createMockSong({
      id: 'shared-id',
      platform: 'qq',
      name: 'QQ Song'
    })
    const neteaseSong = createMockSong({
      id: 'shared-id',
      platform: 'netease',
      name: 'Netease Song'
    })

    store.recordSong(qqSong)
    store.recordSong(neteaseSong)
    store.removeSong(qqSong)

    expect(store.items).toHaveLength(1)
    expect(store.items[0].song.name).toBe('Netease Song')
  })

  it('normalizes persisted recent-play entries by removing duplicate identities', () => {
    const qqSong = createMockSong({
      id: 'shared-id',
      platform: 'qq',
      name: 'QQ New'
    })
    const duplicateQqSong = createMockSong({
      id: 'shared-id',
      platform: 'qq',
      name: 'QQ Old'
    })
    const neteaseSong = createMockSong({
      id: 'shared-id',
      platform: 'netease',
      name: 'Netease Song'
    })

    const normalizedItems = normalizeRecentPlayItems([
      { playedAt: 300, song: qqSong },
      { playedAt: 200, song: duplicateQqSong },
      { playedAt: 100, song: neteaseSong }
    ])

    expect(normalizedItems).toHaveLength(2)
    expect(normalizedItems[0].song.name).toBe('QQ New')
    expect(normalizedItems[1].song.name).toBe('Netease Song')
  })
})
