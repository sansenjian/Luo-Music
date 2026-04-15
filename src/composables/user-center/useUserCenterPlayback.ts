import type { Ref } from 'vue'

import type { Song } from '@/platform/music/interface'

import type { UserTabStateMap } from './shared'
import type { PlayerStoreLike, PlaylistStoreLike, UserCenterRouterLike } from './types'

type LoadDetailSongs = (id: string | number, force?: boolean) => Promise<Song[]>

export interface UseUserCenterPlaybackOptions {
  router: UserCenterRouterLike
  playlistStore: PlaylistStoreLike
  playerStore: PlayerStoreLike
  likeSongs: Ref<Song[]>
  selectedPlaylistSongs: Ref<Song[]>
  selectedAlbumSongs: Ref<Song[]>
  loadingMap: Ref<UserTabStateMap>
  loadPlaylistDetail: LoadDetailSongs
  loadAlbumDetail: LoadDetailSongs
  getCachedPlaylistSongs: (playlistId: string | number) => Song[] | undefined
  getCachedAlbumSongs: (albumId: string | number) => Song[] | undefined
}

export interface UseUserCenterPlaybackReturn {
  playEventSong: (song: Song) => Promise<void>
  playPlaylist: (playlistId: string | number) => Promise<void>
  playPlaylistTrackAt: (index: number) => Promise<void>
  playAlbum: (albumId: string | number) => Promise<void>
  playAlbumTrackAt: (index: number) => Promise<void>
  playAllLikedSongs: () => Promise<void>
  playLikedSongAt: (index: number) => Promise<void>
}

export function useUserCenterPlayback(
  options: UseUserCenterPlaybackOptions
): UseUserCenterPlaybackReturn {
  const {
    getCachedAlbumSongs,
    getCachedPlaylistSongs,
    likeSongs,
    loadAlbumDetail,
    loadPlaylistDetail,
    loadingMap,
    playerStore,
    playlistStore,
    router,
    selectedAlbumSongs,
    selectedPlaylistSongs
  } = options

  const playSongs = async (songs: Song[], index: number): Promise<void> => {
    if (songs.length === 0) {
      return
    }

    playlistStore.setPlaylist(songs)
    playerStore.setSongList(songs)

    try {
      await playerStore.playSongWithDetails(index)
      void router.push('/')
    } catch (error) {
      console.error('播放失败:', error)
    }
  }

  const playPlaylist = async (playlistId: string | number): Promise<void> => {
    loadingMap.value.playlist = true

    try {
      const songs =
        getCachedPlaylistSongs(playlistId) ?? (await loadPlaylistDetail(playlistId, true))
      await playSongs(songs, 0)
    } catch (error) {
      console.error('获取歌单详情失败:', error)
    } finally {
      loadingMap.value.playlist = false
    }
  }

  const playAlbum = async (albumId: string | number): Promise<void> => {
    loadingMap.value.album = true

    try {
      const songs = getCachedAlbumSongs(albumId) ?? (await loadAlbumDetail(albumId, true))
      await playSongs(songs, 0)
    } catch (error) {
      console.error('获取专辑详情失败:', error)
    } finally {
      loadingMap.value.album = false
    }
  }

  const playAllLikedSongs = async (): Promise<void> => {
    await playSongs(likeSongs.value, 0)
  }

  const playEventSong = async (song: Song): Promise<void> => {
    await playSongs([song], 0)
  }

  const playPlaylistTrackAt = async (index: number): Promise<void> => {
    await playSongs(selectedPlaylistSongs.value, index)
  }

  const playAlbumTrackAt = async (index: number): Promise<void> => {
    await playSongs(selectedAlbumSongs.value, index)
  }

  const playLikedSongAt = async (index: number): Promise<void> => {
    await playSongs(likeSongs.value, index)
  }

  return {
    playEventSong,
    playPlaylist,
    playPlaylistTrackAt,
    playAlbum,
    playAlbumTrackAt,
    playAllLikedSongs,
    playLikedSongAt
  }
}
