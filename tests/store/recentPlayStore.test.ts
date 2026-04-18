import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useRecentPlayStore } from '@/store/recentPlayStore'

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
})
