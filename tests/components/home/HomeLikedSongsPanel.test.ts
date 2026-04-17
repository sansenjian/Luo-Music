import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getLikelistMock = vi.hoisted(() => vi.fn())
const getSongDetailMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/song', () => ({
  getLikelist: getLikelistMock,
  getSongDetail: getSongDetailMock
}))

import HomeLikedSongsPanel from '@/components/home/HomeLikedSongsPanel.vue'
import { usePlayerStore } from '@/store/playerStore'
import { useUserStore } from '@/store/userStore'

describe('HomeLikedSongsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getLikelistMock.mockResolvedValue({
      ids: ['song-1', 'song-2']
    })
    getSongDetailMock.mockResolvedValue({
      songs: [
        {
          id: 'song-1',
          name: 'Song 1',
          ar: [{ name: 'Artist 1' }],
          al: { name: 'Album 1', picUrl: 'cover-1.jpg' },
          dt: 240000
        },
        {
          id: 'song-2',
          name: 'Song 2',
          ar: [{ name: 'Artist 2' }],
          al: { name: 'Album 2', picUrl: 'cover-2.jpg' },
          dt: 210000
        }
      ]
    })
  })

  it('loads and renders liked songs inside the home workspace', async () => {
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        userId: 1001
      },
      'netease-cookie'
    )

    const wrapper = mount(HomeLikedSongsPanel)
    await flushPromises()

    expect(getLikelistMock).toHaveBeenCalledWith(1001)
    expect(getSongDetailMock).toHaveBeenCalledWith('song-1,song-2')
    expect(wrapper.text()).toContain('我喜欢的音乐')
    expect(wrapper.text()).toContain('2 首歌曲')
    expect(wrapper.text()).toContain('Song 1')
    expect(wrapper.text()).toContain('Album 1')
    expect(wrapper.findAll('.liked-row')).toHaveLength(2)
  })

  it('plays the loaded liked songs from the workspace actions', async () => {
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        userId: 1001
      },
      'netease-cookie'
    )

    const playerStore = usePlayerStore()
    const setSongListSpy = vi.spyOn(playerStore, 'setSongList')
    const playSongWithDetailsSpy = vi
      .spyOn(playerStore, 'playSongWithDetails')
      .mockResolvedValue(undefined as never)

    const wrapper = mount(HomeLikedSongsPanel)
    await flushPromises()

    await wrapper.get('.hero-action-primary').trigger('click')

    expect(setSongListSpy).toHaveBeenCalledTimes(1)
    expect(playSongWithDetailsSpy).toHaveBeenCalledWith(0)
  })
})
