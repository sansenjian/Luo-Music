import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUserPlaylists, type UseUserPlaylistsReturn } from '@/composables/useUserPlaylists'

const getPlaylistDetailMock = vi.hoisted(() => vi.fn())
const getPlaylistTracksMock = vi.hoisted(() => vi.fn())
const getUserPlaylistMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/playlist', () => ({
  getPlaylistDetail: getPlaylistDetailMock,
  getPlaylistTracks: getPlaylistTracksMock,
  getUserPlaylist: getUserPlaylistMock
}))

function mountUseUserPlaylists() {
  let viewModel!: UseUserPlaylistsReturn

  const Harness = defineComponent({
    setup() {
      viewModel = useUserPlaylists()
      return () => null
    }
  })

  mount(Harness)

  return viewModel
}

describe('useUserPlaylists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and normalizes full playlist tracks from playlist/track/all', async () => {
    getPlaylistTracksMock.mockResolvedValue({
      songs: [
        {
          id: 101,
          name: 'Raw Track',
          ar: [{ id: 7, name: 'Artist 7' }],
          al: { id: 9, name: 'Album 9', picUrl: 'cover-9.jpg' },
          dt: 189000
        },
        {
          id: 102,
          name: 'Sparse Track'
        }
      ]
    })

    const viewModel = mountUseUserPlaylists()
    const songs = await viewModel.loadPlaylistSongs(1)
    await flushPromises()

    expect(getPlaylistTracksMock).toHaveBeenCalledWith(1, 100, 0)
    expect(getPlaylistDetailMock).not.toHaveBeenCalled()
    expect(songs).toHaveLength(2)
    expect(songs[0]).toMatchObject({
      id: 101,
      name: 'Raw Track',
      artists: [{ id: 7, name: 'Artist 7' }],
      album: { id: 9, name: 'Album 9', picUrl: 'cover-9.jpg' },
      duration: 189000,
      platform: 'netease'
    })
    expect(songs[1]).toMatchObject({
      id: 102,
      name: 'Sparse Track',
      artists: [],
      album: { id: 0, name: '', picUrl: '' },
      platform: 'netease'
    })
  })

  it('falls back to playlist detail tracks when playlist/track/all returns nothing', async () => {
    getPlaylistTracksMock.mockResolvedValue({
      songs: []
    })
    getPlaylistDetailMock.mockResolvedValue({
      playlist: {
        tracks: [
          {
            id: 201,
            name: 'Fallback Track',
            ar: [{ id: 8, name: 'Artist 8' }],
            al: { id: 10, name: 'Album 10', picUrl: 'cover-10.jpg' },
            dt: 199000
          }
        ]
      }
    })

    const viewModel = mountUseUserPlaylists()
    const songs = await viewModel.loadPlaylistSongs(2)
    await flushPromises()

    expect(getPlaylistTracksMock).toHaveBeenCalledWith(2, 100, 0)
    expect(getPlaylistDetailMock).toHaveBeenCalledWith(2)
    expect(songs).toHaveLength(1)
    expect(songs[0]).toMatchObject({
      id: 201,
      name: 'Fallback Track',
      artists: [{ id: 8, name: 'Artist 8' }],
      album: { id: 10, name: 'Album 10', picUrl: 'cover-10.jpg' }
    })
  })
})
