import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const getPlaylistTracksMock = vi.hoisted(() => vi.fn())
const getPlaylistDetailMock = vi.hoisted(() => vi.fn())
const getAlbumDetailMock = vi.hoisted(() => vi.fn())
const getAlbumSublistMock = vi.hoisted(() => vi.fn())
const getLikelistMock = vi.hoisted(() => vi.fn())
const getSongDetailMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/playlist', () => ({
  getUserPlaylist: vi.fn(),
  getPlaylistTracks: getPlaylistTracksMock,
  getPlaylistDetail: getPlaylistDetailMock
}))

vi.mock('@/api/song', () => ({
  getLikelist: getLikelistMock,
  getSongDetail: getSongDetailMock
}))

vi.mock('@/api/album', () => ({
  getAlbumDetail: getAlbumDetailMock,
  getAlbumSublist: getAlbumSublistMock
}))

import HomeCollectionDetailPanel from '@/features/home/components/HomeCollectionDetailPanel.vue'
import { useLocalPlaylistStore } from '@/store/localPlaylistStore'
import { usePlayerStore } from '@/store/playerStore'
import { useUserStore } from '@/store/userStore'
import { createMockSong } from '../../utils/test-utils'

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
    getLikelistMock.mockResolvedValue({
      ids: ['liked-song-1']
    })
    getSongDetailMock.mockResolvedValue({
      songs: [
        {
          id: 'liked-song-1',
          name: 'Liked Song 1',
          ar: [{ id: 'artist-1', name: 'Artist 1' }],
          al: { id: 'album-1', name: 'Album 1', picUrl: 'liked-cover.jpg' },
          dt: 240000
        }
      ]
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

    expect(getPlaylistTracksMock).toHaveBeenCalledWith(123, 50, 0)
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

  it('starts playlist playback from the loaded page without fetching all pages first', async () => {
    getPlaylistTracksMock.mockResolvedValueOnce({
      songs: Array.from({ length: 50 }, (_, index) => ({
        id: `song-${index + 1}`,
        name: `Song ${index + 1}`,
        artists: [{ id: 'artist-1', name: 'Artist 1' }],
        album: { id: 'album-1', name: 'Album 1', picUrl: 'cover-1.jpg' },
        duration: 240000,
        platform: 'netease'
      }))
    })

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
          summary: '120 首歌',
          trackCount: 120
        }
      }
    })
    await flushPromises()

    expect(getPlaylistTracksMock).toHaveBeenCalledTimes(1)

    await wrapper.get('.hero-action-primary').trigger('click')
    await flushPromises()

    expect(getPlaylistTracksMock).toHaveBeenCalledTimes(1)
    expect(setSongListSpy).toHaveBeenCalledTimes(1)
    expect(setSongListSpy.mock.calls[0]?.[0]).toHaveLength(50)
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

  it('loads 我的喜欢 through the shared collection detail flow', async () => {
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        userId: 1001
      },
      'netease-cookie'
    )

    const wrapper = mount(HomeCollectionDetailPanel, {
      props: {
        collection: {
          uiId: 'liked',
          sourceId: 'liked',
          kind: 'liked',
          name: '我的喜欢',
          coverUrl: '',
          summary: '默认喜欢歌单'
        }
      }
    })
    await flushPromises()

    expect(getLikelistMock).toHaveBeenCalledWith(1001)
    expect(getSongDetailMock).toHaveBeenCalledWith('liked-song-1')
    expect(wrapper.text()).toContain('我的喜欢')
    expect(wrapper.text()).toContain('Liked Song 1')
  })

  it('renders local playlist songs without calling remote playlist APIs', async () => {
    const localSong = createMockSong({
      id: 'local:track-1',
      name: '本地夜航',
      originalId: 'local:track-1',
      platform: 'local',
      extra: {
        localSource: true
      }
    })
    const localPlaylistStore = useLocalPlaylistStore()
    const playlist = localPlaylistStore.createPlaylist('本地歌单', [localSong])

    const wrapper = mount(HomeCollectionDetailPanel, {
      props: {
        collection: {
          uiId: playlist.id,
          sourceId: playlist.id,
          kind: 'localPlaylist',
          name: playlist.name,
          coverUrl: '',
          summary: '1 首本地歌曲',
          trackCount: 1
        }
      }
    })
    await flushPromises()

    expect(getPlaylistTracksMock).not.toHaveBeenCalled()
    expect(getPlaylistDetailMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('本地歌单')
    expect(wrapper.text()).toContain('本地夜航')
  })

  it('uses a custom cover for local playlist detail', async () => {
    const localSong = createMockSong({
      id: 'local:track-1',
      name: '本地夜航',
      originalId: 'local:track-1',
      platform: 'local',
      album: {
        id: 'local-album',
        name: '本地专辑',
        picUrl: 'song-cover.jpg'
      },
      extra: {
        localSource: true
      }
    })
    const localPlaylistStore = useLocalPlaylistStore()
    const playlist = localPlaylistStore.createPlaylist('本地歌单', [localSong])
    localPlaylistStore.setPlaylistCover(playlist.id, 'custom-cover.jpg')

    const wrapper = mount(HomeCollectionDetailPanel, {
      props: {
        collection: {
          uiId: playlist.id,
          sourceId: playlist.id,
          kind: 'localPlaylist',
          name: playlist.name,
          coverUrl: '',
          summary: '1 首本地歌曲',
          trackCount: 1
        }
      }
    })
    await flushPromises()

    expect(wrapper.get('.media-cover .media-cover-image').attributes('src')).toBe(
      'custom-cover.jpg'
    )
  })

  it('removes a song from a local playlist through the song context menu', async () => {
    const firstSong = createMockSong({
      id: 'local:track-1',
      name: '本地夜航',
      originalId: 'local:track-1',
      platform: 'local',
      extra: {
        localSource: true
      }
    })
    const secondSong = createMockSong({
      id: 'local:track-2',
      name: '本地晨光',
      originalId: 'local:track-2',
      platform: 'local',
      extra: {
        localSource: true
      }
    })
    const localPlaylistStore = useLocalPlaylistStore()
    const playlist = localPlaylistStore.createPlaylist('本地歌单', [firstSong, secondSong])

    const wrapper = mount(HomeCollectionDetailPanel, {
      props: {
        collection: {
          uiId: playlist.id,
          sourceId: playlist.id,
          kind: 'localPlaylist',
          name: playlist.name,
          coverUrl: '',
          summary: '2 首本地歌曲',
          trackCount: 2
        }
      },
      global: {
        stubs: {
          SongDetailList: defineComponent({
            name: 'SongDetailListStub',
            props: {
              songs: {
                type: Array,
                required: true
              }
            },
            emits: ['song-context-menu'],
            template:
              '<button class="song-detail-list-stub" @contextmenu.prevent="$emit(\'song-context-menu\', { index: 0, song: songs[0], clientX: 24, clientY: 40 })">list</button>'
          })
        }
      }
    })
    await flushPromises()

    await wrapper.get('.song-detail-list-stub').trigger('contextmenu')
    expect(wrapper.find('.collection-song-context-menu').exists()).toBe(true)

    await wrapper.get('.collection-menu-remove-song').trigger('click')
    await flushPromises()

    expect(localPlaylistStore.getPlaylistById(playlist.id)?.songs.map(song => song.id)).toEqual([
      'local:track-2'
    ])
    expect(wrapper.find('.collection-song-context-menu').exists()).toBe(false)
    expect(wrapper.text()).toContain('歌曲 1')
  })

  it('requests the next playlist page when the detail list asks to load more', async () => {
    getPlaylistTracksMock
      .mockResolvedValueOnce({
        songs: Array.from({ length: 50 }, (_, index) => ({
          id: `song-${index + 1}`,
          name: `Song ${index + 1}`,
          artists: [{ id: 'artist-1', name: 'Artist 1' }],
          album: { id: 'album-1', name: 'Album 1', picUrl: 'cover-1.jpg' },
          duration: 240000,
          platform: 'netease'
        }))
      })
      .mockResolvedValueOnce({
        songs: [
          {
            id: 'song-51',
            name: 'Song 51',
            artists: [{ id: 'artist-1', name: 'Artist 1' }],
            album: { id: 'album-1', name: 'Album 1', picUrl: 'cover-1.jpg' },
            duration: 240000,
            platform: 'netease'
          }
        ]
      })

    const wrapper = mount(HomeCollectionDetailPanel, {
      props: {
        collection: {
          uiId: 'playlist:123',
          sourceId: 123,
          kind: 'playlist',
          name: '测试歌单',
          coverUrl: 'cover.jpg',
          summary: '120 首歌'
        }
      },
      global: {
        stubs: {
          SongDetailList: defineComponent({
            name: 'SongDetailListStub',
            emits: ['load-more'],
            template:
              '<button class="song-detail-list-stub" @click="$emit(\'load-more\')">list</button>'
          })
        }
      }
    })
    await flushPromises()

    await wrapper.get('.song-detail-list-stub').trigger('click')
    await flushPromises()

    expect(getPlaylistTracksMock).toHaveBeenNthCalledWith(1, 123, 50, 0)
    expect(getPlaylistTracksMock).toHaveBeenNthCalledWith(2, 123, 100, 50)
  })
})
