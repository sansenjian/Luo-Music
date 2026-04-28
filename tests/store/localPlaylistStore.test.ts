import { describe, expect, it } from 'vitest'

import { useLocalPlaylistStore } from '@/store/localPlaylistStore'
import { createMockSong } from '../utils/test-utils'

function createLocalSong(id: string) {
  return createMockSong({
    id,
    name: 'Local Song',
    originalId: id,
    platform: 'local',
    extra: {
      localSource: true
    }
  })
}

describe('localPlaylistStore', () => {
  it('creates a named local playlist with cloned local songs', () => {
    const store = useLocalPlaylistStore()
    const song = createLocalSong('local:track-1')

    const playlist = store.createPlaylist(' 夜航歌单 ', [song])

    expect(playlist.id).toMatch(/^local-playlist:/)
    expect(playlist.name).toBe('夜航歌单')
    expect(playlist.songs).toHaveLength(1)
    expect(playlist.songs[0]).toEqual(song)
    expect(playlist.songs[0]).not.toBe(song)
    expect(store.getPlaylistById(playlist.id)).toEqual(playlist)
  })

  it('deduplicates songs and rejects non-local sources', () => {
    const store = useLocalPlaylistStore()
    const song = createLocalSong('local:track-1')
    const remoteSong = createMockSong({
      id: 'remote-1',
      platform: 'netease'
    })

    const playlist = store.createPlaylist('', [song, song, remoteSong])

    expect(playlist.name).toBe('本地歌单')
    expect(playlist.songs).toHaveLength(1)
    expect(playlist.songs[0]?.id).toBe('local:track-1')
  })

  it('throws when no local songs can be added', () => {
    const store = useLocalPlaylistStore()

    expect(() =>
      store.createPlaylist('远程歌单', [
        createMockSong({
          id: 'remote-1',
          platform: 'netease'
        })
      ])
    ).toThrow('本地歌单至少需要一首本地音乐')
  })

  it('adds new local songs to an existing playlist and skips duplicates', () => {
    const store = useLocalPlaylistStore()
    const firstSong = createLocalSong('local:track-1')
    const secondSong = createLocalSong('local:track-2')
    const playlist = store.createPlaylist('本地歌单', [firstSong])
    const originalUpdatedAt = playlist.updatedAt

    const result = store.addSongsToPlaylist(playlist.id, [firstSong, secondSong])

    expect(result.playlist.id).toBe(playlist.id)
    expect(result.addedCount).toBe(1)
    expect(result.playlist.songs.map(song => song.id)).toEqual(['local:track-1', 'local:track-2'])
    expect(result.playlist.songs[1]).toEqual(secondSong)
    expect(result.playlist.songs[1]).not.toBe(secondSong)
    expect(result.playlist.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt)

    const duplicateResult = store.addSongsToPlaylist(playlist.id, [secondSong])
    expect(duplicateResult.addedCount).toBe(0)
    expect(duplicateResult.playlist.songs).toHaveLength(2)
  })

  it('throws when adding songs to a missing local playlist', () => {
    const store = useLocalPlaylistStore()

    expect(() =>
      store.addSongsToPlaylist('missing-playlist', [createLocalSong('local:track-1')])
    ).toThrow('找不到该本地歌单')
  })

  it('removes a local song from an existing playlist', () => {
    const store = useLocalPlaylistStore()
    const firstSong = createLocalSong('local:track-1')
    const secondSong = createLocalSong('local:track-2')
    const playlist = store.createPlaylist('本地歌单', [firstSong, secondSong])
    const originalUpdatedAt = playlist.updatedAt

    const result = store.removeSongFromPlaylist(playlist.id, firstSong)

    expect(result.removed).toBe(true)
    expect(result.playlist.songs.map(song => song.id)).toEqual(['local:track-2'])
    expect(result.playlist.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt)

    const missingResult = store.removeSongFromPlaylist(playlist.id, firstSong)
    expect(missingResult.removed).toBe(false)
    expect(missingResult.playlist.songs.map(song => song.id)).toEqual(['local:track-2'])
  })

  it('throws when removing a song from a missing local playlist', () => {
    const store = useLocalPlaylistStore()

    expect(() =>
      store.removeSongFromPlaylist('missing-playlist', createLocalSong('local:track-1'))
    ).toThrow('找不到该本地歌单')
  })

  it('removes an existing local playlist by id', () => {
    const store = useLocalPlaylistStore()
    const playlist = store.createPlaylist('本地歌单', [createLocalSong('local:track-1')])

    expect(store.removePlaylist(playlist.id)).toBe(true)
    expect(store.getPlaylistById(playlist.id)).toBeNull()
    expect(store.playlists).toHaveLength(0)
    expect(store.removePlaylist(playlist.id)).toBe(false)
  })

  it('sets and clears a custom cover for a local playlist', () => {
    const store = useLocalPlaylistStore()
    const playlist = store.createPlaylist('本地歌单', [createLocalSong('local:track-1')])
    const originalUpdatedAt = playlist.updatedAt

    const updatedPlaylist = store.setPlaylistCover(playlist.id, ' data:image/jpeg;base64,cover ')

    expect(updatedPlaylist.coverUrl).toBe('data:image/jpeg;base64,cover')
    expect(updatedPlaylist.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt)

    const clearedPlaylist = store.clearPlaylistCover(playlist.id)
    expect(clearedPlaylist.coverUrl).toBeUndefined()
  })

  it('throws when setting a cover on a missing local playlist', () => {
    const store = useLocalPlaylistStore()

    expect(() =>
      store.setPlaylistCover('missing-playlist', 'data:image/jpeg;base64,cover')
    ).toThrow('找不到该本地歌单')
    expect(() => store.clearPlaylistCover('missing-playlist')).toThrow('找不到该本地歌单')
  })
})
