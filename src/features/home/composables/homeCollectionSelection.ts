import type { HomeSidebarCollectionSelection } from '@/features/home/components/homeSidebar.types'
import type { FavoriteAlbumItem } from '@/composables/useFavoriteAlbums'
import type { PlaylistItem } from '@/composables/useUserPlaylists'
import type { LocalPlaylist } from '@/store/localPlaylistStore'

export function createPlaylistCollectionSelection(
  playlist: PlaylistItem
): HomeSidebarCollectionSelection {
  const trackCount = Number(playlist.trackCount)

  return {
    uiId: `playlist:${playlist.id}`,
    sourceId: playlist.id,
    kind: 'playlist',
    name: playlist.name,
    coverUrl: typeof playlist.coverImgUrl === 'string' ? playlist.coverImgUrl : '',
    summary: resolvePlaylistCollectionSummary(playlist),
    trackCount: Number.isFinite(trackCount) && trackCount > 0 ? trackCount : undefined
  }
}

export function createAlbumCollectionSelection(
  album: FavoriteAlbumItem
): HomeSidebarCollectionSelection {
  const size = Number(album.size)

  return {
    uiId: `album:${album.id}`,
    sourceId: album.id,
    kind: 'album',
    name: album.name,
    coverUrl: album.picUrl,
    summary: resolveAlbumCollectionSummary(album),
    trackCount: Number.isFinite(size) && size > 0 ? size : undefined
  }
}

export function createLocalPlaylistCollectionSelection(
  playlist: LocalPlaylist
): HomeSidebarCollectionSelection {
  const coverUrl = playlist.coverUrl || playlist.songs[0]?.album?.picUrl || ''

  return {
    uiId: playlist.id,
    sourceId: playlist.id,
    kind: 'localPlaylist',
    name: playlist.name,
    coverUrl,
    hasCustomCover: Boolean(playlist.coverUrl),
    summary: resolveLocalPlaylistCollectionSummary(playlist),
    trackCount: playlist.songs.length
  }
}

function resolvePlaylistCollectionSummary(playlist: PlaylistItem): string {
  const trackCount = Number(playlist.trackCount)
  if (Number.isFinite(trackCount) && trackCount > 0) {
    return `${trackCount} 首歌`
  }

  return '歌单'
}

function resolveAlbumCollectionSummary(album: FavoriteAlbumItem): string {
  const size = Number(album.size)
  if (album.artistName && Number.isFinite(size) && size > 0) {
    return `${album.artistName} · ${size} 首歌`
  }

  if (album.artistName) {
    return album.artistName
  }

  if (Number.isFinite(size) && size > 0) {
    return `${size} 首歌`
  }

  return '收藏'
}

function resolveLocalPlaylistCollectionSummary(playlist: LocalPlaylist): string {
  const trackCount = playlist.songs.length
  if (trackCount > 0) {
    return `${trackCount} 首本地歌曲`
  }

  return '本地歌单'
}
