import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPlaylistTracksMock = vi.hoisted(() => vi.fn())
const getPlaylistDetailMock = vi.hoisted(() => vi.fn())
const getAlbumDetailMock = vi.hoisted(() => vi.fn())
const getAlbumSublistMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/playlist', () => ({
  getUserPlaylist: vi.fn(),
  getPlaylistTracks: getPlaylistTracksMock,
  getPlaylistDetail: getPlaylistDetailMock
}))

vi.mock('@/api/album', () => ({
  getAlbumDetail: getAlbumDetailMock,
  getAlbumSublist: getAlbumSublistMock
}))

import HomeCollectionDetailPanel from '@/components/home/HomeCollectionDetailPanel.vue'
import { usePlayerStore } from '@/store/playerStore'

describe('HomeCollectionDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPlaylistTracksMock.mockResolvedValue({
      songs: [
        {
          id: 'song-1',
          name: 'Song 1',
          artists: [{ id: 'artist-1', name: 'Artist 1' }],
          album: { id: 'album-1', name: 'Album 1', picUrl: 'cover-1.jpg' },
          duration: 240000,
          platform: 'netease'
        }
      ]
    })
    getPlaylistDetailMock.mockResolvedValue({
      playlist: {
        tracks: []
      }
    })
    getAlbumDetailMock.mockResolvedValue({
      album: {
        id: 'album-1',
        name: 'Album 1',
        picUrl: 'cover-1.jpg',
        artists: [{ name: 'Artist 1' }]
      },
      songs: [
        {
          id: 'song-2',
          name: 'Album Song',
          artists: [{ id: 'artist-1', name: 'Artist 1' }],
          album: { id: 'album-1', name: 'Album 1', picUrl: 'cover-1.jpg' },
          duration: 210000,
          platform: 'netease'
        }
      ]
    })
  })

  it('loads and renders playlist detail content in the home workspace', async () => {
    const wrapper = mount(HomeCollectionDetailPanel, {
      props: {
        collection: {
          uiId: 'playlist:123',
          sourceId: 123,
          kind: 'playlist',
          name: '测试歌单',
          coverUrl: 'cover.jpg',
          summary: '12 首歌'
        }
      }
    })
    await flushPromises()

    expect(getPlaylistTracksMock).toHaveBeenCalledWith(123, 100, 0)
    expect(wrapper.text()).toContain('测试歌单')
    expect(wrapper.text()).toContain('Song 1')
    expect(wrapper.text()).toContain('Album 1')
  })

  it('plays the current playlist detail songs from the hero action', async () => {
    const playerStore = usePlayerStore()
    const setSongListSpy = vi.spyOn(playerStore, 'setSongList')
    const playSongWithDetailsSpy = vi
      .spyOn(playerStore, 'playSongWithDetails')
      .mockResolvedValue(undefined as never)

    const wrapper = mount(HomeCollectionDetailPanel, {
      props: {
        collection: {
          uiId: 'playlist:123',
          sourceId: 123,
          kind: 'playlist',
          name: '测试歌单',
          coverUrl: 'cover.jpg',
          summary: '12 首歌'
        }
      }
    })
    await flushPromises()

    await wrapper.get('.hero-action-primary').trigger('click')

    expect(setSongListSpy).toHaveBeenCalledTimes(1)
    expect(playSongWithDetailsSpy).toHaveBeenCalledWith(0)
  })

  it('loads album detail when the selected collection is an album', async () => {
    const wrapper = mount(HomeCollectionDetailPanel, {
      props: {
        collection: {
          uiId: 'album:1',
          sourceId: 1,
          kind: 'album',
          name: '收藏专辑A',
          coverUrl: 'album-cover.jpg',
          summary: 'Album Artist · 12 首歌'
        }
      }
    })
    await flushPromises()

    expect(getAlbumDetailMock).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('收藏专辑A')
    expect(wrapper.text()).toContain('Album Song')
  })
})
