import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHomeRecentPlayPanel } from '@/composables/home/useHomeRecentPlayPanel'
import { usePlayerStore } from '@/store/playerStore'
import { useRecentPlayStore } from '@/store/recentPlayStore'

import { createMockSong } from '../utils/test-utils'

describe('useHomeRecentPlayPanel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('filters recent items by song, artist, and album metadata', () => {
    const recentPlayStore = useRecentPlayStore()
    recentPlayStore.recordSong(
      createMockSong({
        id: 'alpha',
        name: 'Night Drive',
        artists: [{ id: 'artist-a', name: 'Echo' }],
        album: { id: 'album-a', name: 'City Lights', picUrl: '' }
      })
    )
    recentPlayStore.recordSong(
      createMockSong({
        id: 'beta',
        name: 'Golden Hour',
        artists: [{ id: 'artist-b', name: 'Harbor' }],
        album: { id: 'album-b', name: 'Sunset Avenue', picUrl: '' }
      })
    )

    const panel = useHomeRecentPlayPanel()
    panel.searchQuery.value = 'sunset'

    expect(panel.filteredItems.value).toHaveLength(1)
    expect(panel.filteredItems.value[0].name).toBe('Golden Hour')
  })

  it('plays the filtered recent songs as the active playlist from the selected row', async () => {
    const recentPlayStore = useRecentPlayStore()
    const matchingSong = createMockSong({
      id: 'match',
      name: 'Match Song',
      artists: [{ id: 'artist-match', name: 'Aurora' }],
      album: { id: 'album-match', name: 'Afterglow', picUrl: '' }
    })
    const otherSong = createMockSong({
      id: 'other',
      name: 'Other Song',
      artists: [{ id: 'artist-other', name: 'Signal' }],
      album: { id: 'album-other', name: 'Skyline', picUrl: '' }
    })

    recentPlayStore.recordSong(otherSong)
    recentPlayStore.recordSong(matchingSong)

    const playerStore = usePlayerStore()
    const setSongList = vi.spyOn(playerStore, 'setSongList')
    const playSongWithDetails = vi
      .spyOn(playerStore, 'playSongWithDetails')
      .mockResolvedValue(undefined as never)

    const panel = useHomeRecentPlayPanel()
    panel.searchQuery.value = 'aurora'

    await panel.playRecentSongAt(0)

    expect(setSongList).toHaveBeenCalledWith([matchingSong])
    expect(playSongWithDetails).toHaveBeenCalledWith(0)
  })

  it('marks the current song using song identity instead of the raw id alone', () => {
    const recentPlayStore = useRecentPlayStore()
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

    recentPlayStore.recordSong(neteaseSong)
    recentPlayStore.recordSong(qqSong)

    const playerStore = usePlayerStore()
    playerStore.currentSong = createMockSong({
      id: 'shared-id',
      platform: 'qq',
      name: 'Current QQ Song'
    })

    const panel = useHomeRecentPlayPanel()

    expect(panel.isCurrentSong(panel.filteredItems.value[0].song)).toBe(true)
    expect(panel.isCurrentSong(panel.filteredItems.value[1].song)).toBe(false)
  })
})
