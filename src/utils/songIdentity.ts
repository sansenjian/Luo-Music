import type { Song } from '@/types/schemas'

function readLegacySongServer(song: Song): string | undefined {
  if (!('server' in song) || typeof song.server !== 'string' || song.server.length === 0) {
    return undefined
  }

  return song.server
}

export function getSongPlatformKey(song: Song): string {
  return song.platform || readLegacySongServer(song) || 'netease'
}

export function isSameSongIdentity(
  left: Song | null | undefined,
  right: Song | null | undefined
): boolean {
  if (!left || !right) {
    return false
  }

  return `${getSongPlatformKey(left)}:${left.id}` === `${getSongPlatformKey(right)}:${right.id}`
}

export function cloneSongData(song: Song): Song {
  return {
    ...song,
    artists: Array.isArray(song.artists) ? song.artists.map(artist => ({ ...artist })) : [],
    album:
      song.album && typeof song.album === 'object'
        ? {
            id: song.album.id ?? 0,
            name: song.album.name ?? '',
            picUrl: song.album.picUrl ?? ''
          }
        : {
            id: 0,
            name: '',
            picUrl: ''
          },
    ...(song.extra ? { extra: { ...song.extra } } : {})
  }
}
