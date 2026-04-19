import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Song } from '@/types/schemas'

const getLikelistMock = vi.hoisted(() => vi.fn())
const getSongDetailMock = vi.hoisted(() => vi.fn())
const getAlbumSublistMock = vi.hoisted(() => vi.fn())
const getAlbumDetailMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/song', () => ({
  getLikelist: getLikelistMock,
  getSongDetail: getSongDetailMock
}))

vi.mock('@/api/album', () => ({
  getAlbumSublist: getAlbumSublistMock,
  getAlbumDetail: getAlbumDetailMock
}))

import HomeLikedSongsPanel from '@/components/home/HomeLikedSongsPanel.vue'
import { useHomeLikedSongsPanel } from '@/composables/home/useHomeLikedSongsPanel'
import { usePlayerStore } from '@/store/playerStore'
import { useUserStore } from '@/store/userStore'
import { createLocalLibraryMockFromSongs } from '../../fixtures/localLibrary'

type HomeLikedSongsPanelDeps = NonNullable<Parameters<typeof useHomeLikedSongsPanel>[0]>

function mountHomeLikedSongsPanel(localLibrary?: HomeLikedSongsPanelDeps['localLibrary']) {
  const Harness = defineComponent({
    components: {
      HomeLikedSongsPanel
    },
    setup() {
      const model = useHomeLikedSongsPanel({ localLibrary })
      return {
        model
      }
    },
    template: '<HomeLikedSongsPanel :model="model" />'
  })

  return mount(Harness)
}

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
    getAlbumSublistMock.mockResolvedValue({
      count: 1,
      data: [
        {
          id: 1,
          name: 'Favorite Album 1',
          picUrl: 'album-cover-1.jpg',
          size: 8,
          artist: {
            name: 'Album Artist 1'
          }
        }
      ],
      hasMore: false
    })
    getAlbumDetailMock.mockResolvedValue({
      album: {
        id: 1,
        name: 'Favorite Album 1',
        picUrl: 'album-cover-1.jpg',
        artists: [{ name: 'Album Artist 1' }]
      },
      songs: [
        {
          id: 'album-song-1',
          name: 'Album Song 1',
          ar: [{ name: 'Album Artist 1' }],
          al: { id: 1, name: 'Favorite Album 1', picUrl: 'album-cover-1.jpg' },
          dt: 200000
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

    const wrapper = mountHomeLikedSongsPanel()
    await flushPromises()

    expect(getLikelistMock).toHaveBeenCalledWith(1001)
    expect(getSongDetailMock).toHaveBeenCalledWith('song-1,song-2')
    expect(getAlbumSublistMock).toHaveBeenCalled()
    expect(wrapper.text()).toContain('我的喜欢')
    expect(wrapper.text()).toContain('2 首歌曲')
    expect(wrapper.text()).toContain('Song 1')
    expect(wrapper.text()).toContain('Artist 1')
    expect(wrapper.text()).toContain('Album 1')
    expect(wrapper.text()).toContain('04:00')
    expect(wrapper.findAll('.detail-song')).toHaveLength(2)
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

    const wrapper = mountHomeLikedSongsPanel()
    await flushPromises()

    await wrapper.get('.hero-action-primary').trigger('click')

    expect(setSongListSpy).toHaveBeenCalledTimes(1)
    expect(playSongWithDetailsSpy).toHaveBeenCalledWith(0)
  })

  it('switches to albums inside 我的喜欢 and opens album detail', async () => {
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        userId: 1001
      },
      'netease-cookie'
    )

    const wrapper = mountHomeLikedSongsPanel()
    await flushPromises()

    const subtabs = wrapper.findAll('.subtab')
    expect(subtabs).toHaveLength(3)
    expect(subtabs[1].text()).toContain('专辑 1')
    expect(subtabs[2].text()).toContain('MV')
    expect(subtabs[2].attributes('disabled')).toBeDefined()

    await subtabs[1].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Favorite Album 1')
    expect(wrapper.text()).toContain('Album Artist 1')

    await wrapper.get('.album-card-hit').trigger('click')
    await flushPromises()

    expect(getAlbumDetailMock).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('Album Song 1')
  })

  it('clears song search when switching to albums so network albums remain visible', async () => {
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        userId: 1001
      },
      'netease-cookie'
    )

    const wrapper = mountHomeLikedSongsPanel()
    await flushPromises()

    await wrapper.get('input[type="search"]').setValue('does-not-match-any-album')
    expect(wrapper.text()).toContain('没有找到匹配的歌曲。')

    const subtabs = wrapper.findAll('.subtab')
    await subtabs[1].trigger('click')
    await flushPromises()

    expect((wrapper.get('input[type="search"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain('Favorite Album 1')
  })

  it('reloads network albums when entering the album section after an empty initial load', async () => {
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        userId: 1001
      },
      'netease-cookie'
    )

    getAlbumSublistMock
      .mockResolvedValueOnce({
        count: 0,
        data: [],
        hasMore: false
      })
      .mockResolvedValueOnce({
        count: 1,
        data: [
          {
            id: 1,
            name: 'Favorite Album 1',
            picUrl: 'album-cover-1.jpg',
            size: 8,
            artist: {
              name: 'Album Artist 1'
            }
          }
        ],
        hasMore: false
      })

    const wrapper = mountHomeLikedSongsPanel()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Favorite Album 1')

    const subtabs = wrapper.findAll('.subtab')
    await subtabs[1].trigger('click')
    await flushPromises()

    expect(getAlbumSublistMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Favorite Album 1')
  })

  it('includes local songs in 我的喜欢 even when the user is not logged in', async () => {
    const localSong: Song = {
      id: 'local:track-1',
      name: '本地夜航',
      artists: [{ id: 'artist-1', name: '本地歌手' }],
      album: { id: 'album-1', name: '本地专辑', picUrl: '' },
      duration: 188000,
      mvid: 0,
      platform: 'local',
      originalId: 'local:track-1',
      url: 'luo-media://media?path=D%3A%5CMusic%5C%E6%9C%AC%E5%9C%B0%E5%A4%9C%E8%88%AA.mp3',
      extra: {
        localSource: true,
        localDurationKnown: true
      }
    }

    const wrapper = mountHomeLikedSongsPanel(createLocalLibraryMockFromSongs([localSong]))
    await flushPromises()

    expect(wrapper.text()).not.toContain('登录后查看我的喜欢')
    expect(wrapper.text()).toContain('本地夜航')
    expect(wrapper.text()).toContain('本地歌手')
    expect(wrapper.text()).toContain('03:08')
    expect(wrapper.findAll('.detail-song')).toHaveLength(1)
  })
})
