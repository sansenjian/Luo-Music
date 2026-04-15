import { ref, type Ref } from 'vue'

import type { Song } from '@/platform/music/interface'

import type { PlayerStoreLike, PlaylistStoreLike, UserCenterRouterLike } from './types'

type LoadDetailSongs = (id: string | number, force?: boolean) => Promise<Song[]>

export interface UseUserCenterPlaybackOptions {
  router: UserCenterRouterLike
  playlistStore: PlaylistStoreLike
  playerStore: PlayerStoreLike
  likeSongs: Ref<Song[]>
  selectedPlaylistSongs: Ref<Song[]>
  selectedAlbumSongs: Ref<Song[]>
  loadPlaylistDetail: LoadDetailSongs
  loadAlbumDetail: LoadDetailSongs
  getCachedPlaylistSongs: (playlistId: string | number) => Song[] | undefined
  getCachedAlbumSongs: (albumId: string | number) => Song[] | undefined
}

export interface UseUserCenterPlaybackReturn {
  playingPlaylistId: Ref<string | null>
  playingAlbumId: Ref<string | null>
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
    playerStore,
    playlistStore,
    router,
    selectedAlbumSongs,
    selectedPlaylistSongs
  } = options

  const playingPlaylistId = ref<string | null>(null)
  const playingAlbumId = ref<string | null>(null)
  let activePlaylistPlayId = 0
  let activeAlbumPlayId = 0

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
    const normalizedPlaylistId = String(playlistId)
    const playId = ++activePlaylistPlayId
    playingPlaylistId.value = normalizedPlaylistId

    try {
      const songs =
        getCachedPlaylistSongs(playlistId) ?? (await loadPlaylistDetail(playlistId, true))
      if (playId !== activePlaylistPlayId || playingPlaylistId.value !== normalizedPlaylistId) {
        return
      }
      await playSongs(songs, 0)
    } catch (error) {
      console.error('获取歌单详情失败:', error)
    } finally {
      if (playId === activePlaylistPlayId && playingPlaylistId.value === normalizedPlaylistId) {
        playingPlaylistId.value = null
      }
    }
  }

  const playAlbum = async (albumId: string | number): Promise<void> => {
    const normalizedAlbumId = String(albumId)
    const playId = ++activeAlbumPlayId
    playingAlbumId.value = normalizedAlbumId

    try {
      const songs = getCachedAlbumSongs(albumId) ?? (await loadAlbumDetail(albumId, true))
      if (playId !== activeAlbumPlayId || playingAlbumId.value !== normalizedAlbumId) {
        return
      }
      await playSongs(songs, 0)
    } catch (error) {
      console.error('获取专辑详情失败:', error)
    } finally {
      if (playId === activeAlbumPlayId && playingAlbumId.value === normalizedAlbumId) {
        playingAlbumId.value = null
      }
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
    playingPlaylistId,
    playingAlbumId,
    playEventSong,
    playPlaylist,
    playPlaylistTrackAt,
    playAlbum,
    playAlbumTrackAt,
    playAllLikedSongs,
    playLikedSongAt
  }
}
