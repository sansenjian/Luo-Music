import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUserPlaylists, type UseUserPlaylistsReturn } from '@/composables/useUserPlaylists'
import { nextTick } from 'vue'
import { mountComposable } from '../helpers/mountComposable'

const getPlaylistDetailMock = vi.hoisted(() => vi.fn())
const getPlaylistTracksMock = vi.hoisted(() => vi.fn())
const getUserPlaylistMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/playlist', () => ({
  getPlaylistDetail: getPlaylistDetailMock,
  getPlaylistTracks: getPlaylistTracksMock,
  getUserPlaylist: getUserPlaylistMock
}))

function mountUseUserPlaylists() {
  const { result } = mountComposable<UseUserPlaylistsReturn>(() => useUserPlaylists())
  return result
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

  it('continues requesting playlist/track/all pages until the playlist is fully loaded', async () => {
    getPlaylistTracksMock
      .mockResolvedValueOnce({
        songs: Array.from({ length: 100 }, (_, index) => ({
          id: index + 1,
          name: `Track ${index + 1}`
        }))
      })
      .mockResolvedValueOnce({
        songs: [
          { id: 101, name: 'Track 101' },
          { id: 102, name: 'Track 102' }
        ]
      })

    const viewModel = mountUseUserPlaylists()
    const songs = await viewModel.loadPlaylistSongs(9)
    await flushPromises()

    expect(getPlaylistTracksMock).toHaveBeenNthCalledWith(1, 9, 100, 0)
    expect(getPlaylistTracksMock).toHaveBeenNthCalledWith(2, 9, 100, 100)
    expect(getPlaylistDetailMock).not.toHaveBeenCalled()
    expect(songs).toHaveLength(102)
    expect(songs.at(-1)).toMatchObject({
      id: 102,
      name: 'Track 102'
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

  it('supports incremental playlist track loading through usePlaylistTracks', async () => {
    getPlaylistTracksMock
      .mockResolvedValueOnce({
        songs: Array.from({ length: 50 }, (_, index) => ({
          id: index + 1,
          name: `Track ${index + 1}`
        }))
      })
      .mockResolvedValueOnce({
        songs: Array.from({ length: 52 }, (_, index) => ({
          id: index + 51,
          name: `Track ${index + 51}`
        }))
      })

    const viewModel = mountUseUserPlaylists()
    const playlistTracks = viewModel.usePlaylistTracks()

    await playlistTracks.loadFirstPage(7)
    await flushPromises()

    expect(getPlaylistTracksMock).toHaveBeenNthCalledWith(1, 7, 50, 0)
    expect(playlistTracks.songs.value).toHaveLength(50)
    expect(playlistTracks.hasMore.value).toBe(true)

    await playlistTracks.loadMore()
    await flushPromises()
    await nextTick()

    expect(getPlaylistTracksMock).toHaveBeenNthCalledWith(2, 7, 100, 50)
    expect(playlistTracks.songs.value).toHaveLength(102)
    expect(playlistTracks.hasMore.value).toBe(false)
  })

  it('splits created playlists from favorite playlists', async () => {
    getUserPlaylistMock.mockResolvedValue({
      playlist: [
        {
          id: 'playlist-created',
          name: 'Created Playlist',
          subscribed: false
        },
        {
          id: 'playlist-favorite',
          name: 'Favorite Playlist',
          subscribed: true
        }
      ]
    })

    const viewModel = mountUseUserPlaylists()
    await viewModel.loadPlaylists('user-1')
    await flushPromises()

    expect(viewModel.playlists.value).toHaveLength(2)
    expect(viewModel.createdPlaylists.value).toEqual([
      expect.objectContaining({
        id: 'playlist-created'
      })
    ])
    expect(viewModel.favoritePlaylists.value).toEqual([
      expect.objectContaining({
        id: 'playlist-favorite'
      })
    ])
    expect(viewModel.count.value).toBe(1)
  })

  it('surfaces playlist detail failures instead of silently returning an empty song list', async () => {
    getPlaylistTracksMock.mockRejectedValue(new Error('playlist detail failed'))

    const viewModel = mountUseUserPlaylists()

    await expect(viewModel.loadPlaylistSongs(3)).rejects.toThrow('playlist detail failed')
  })
})
