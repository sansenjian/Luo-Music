import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'

import type { UseFavoriteAlbumsReturn } from '@/composables/useFavoriteAlbums'
import type { UseLikedSongsReturn } from '@/composables/useLikedSongs'
import type { UseUserEventsReturn } from '@/composables/useUserEvents'
import type { UseUserPlaylistsReturn } from '@/composables/useUserPlaylists'
import type { Song } from '@/platform/music/interface'
import { usePlayerStore } from '@/store/playerStore'
import { usePlaylistStore } from '@/store/playlistStore'
import { useUserStore } from '@/store/userStore'

export type UserStoreLike = Pick<
  ReturnType<typeof useUserStore>,
  'avatarUrl' | 'isLoggedIn' | 'nickname' | 'userId'
>
export type PlaylistStoreLike = Pick<ReturnType<typeof usePlaylistStore>, 'setPlaylist'>
export type PlayerStoreLike = Pick<
  ReturnType<typeof usePlayerStore>,
  'playSongWithDetails' | 'setSongList'
>
export type UserCenterRouterLike = Pick<Router, 'push' | 'replace'>
export type UserCenterRouteLike = Pick<RouteLocationNormalizedLoaded, 'query'>
export type UserCenterLikedSongsLike = Pick<
  UseLikedSongsReturn,
  | 'count'
  | 'error'
  | 'formattedSongs'
  | 'hasMore'
  | 'likeSongs'
  | 'loadLikedSongs'
  | 'loadMoreLikedSongs'
  | 'loadingMore'
  | 'retryLoadLikedSongs'
  | 'resetLikedSongs'
>
export type UserCenterPlaylistsLike = Pick<
  UseUserPlaylistsReturn,
  | 'count'
  | 'createdPlaylists'
  | 'error'
  | 'favoritePlaylists'
  | 'loadPlaylistSongs'
  | 'loadPlaylists'
  | 'playlists'
  | 'resetPlaylists'
>
export type UserCenterFavoriteAlbumsLike = Pick<
  UseFavoriteAlbumsReturn,
  'albums' | 'count' | 'error' | 'loadAlbumSongs' | 'loadFavoriteAlbums' | 'resetFavoriteAlbums'
>
export type UserCenterEventsLike = Pick<
  UseUserEventsReturn,
  | 'activeFilter'
  | 'count'
  | 'error'
  | 'events'
  | 'filteredEvents'
  | 'hasMore'
  | 'loadEvents'
  | 'loadMoreEvents'
  | 'loadingMore'
  | 'retryLoadEvents'
  | 'resetEvents'
  | 'setFilter'
>

export type LoadSongsById = (id: string | number) => Promise<Song[]>
