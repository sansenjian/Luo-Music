import { defineStore } from 'pinia'

import { storageAdapter } from '@/services/storageService'
import type { Song } from '@/platform/music/interface'
import { isLocalLibrarySong } from '@/types/localLibrary'
import { cloneSongData, isSameSongIdentity } from '@/utils/songIdentity'

export type LocalPlaylist = {
  id: string
  name: string
  coverUrl?: string
  songs: Song[]
  createdAt: number
  updatedAt: number
}

interface LocalPlaylistState {
  playlists: LocalPlaylist[]
}

export type AddSongsToLocalPlaylistResult = {
  playlist: LocalPlaylist
  addedCount: number
}

export type RemoveSongFromLocalPlaylistResult = {
  playlist: LocalPlaylist
  removed: boolean
}

const LOCAL_PLAYLIST_ID_PREFIX = 'local-playlist:'

function createLocalPlaylistId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${LOCAL_PLAYLIST_ID_PREFIX}${crypto.randomUUID()}`
  }

  return `${LOCAL_PLAYLIST_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizePlaylistName(name: string): string {
  const trimmedName = name.trim()
  return trimmedName.length > 0 ? trimmedName : '本地歌单'
}

function cloneUniqueLocalSongs(songs: Song[]): Song[] {
  const uniqueSongs: Song[] = []

  for (const song of songs) {
    if (!isLocalLibrarySong(song)) {
      continue
    }

    if (uniqueSongs.some(existingSong => isSameSongIdentity(existingSong, song))) {
      continue
    }

    uniqueSongs.push(cloneSongData(song))
  }

  return uniqueSongs
}

function filterNewLocalSongs(songs: Song[], existingSongs: Song[]): Song[] {
  return cloneUniqueLocalSongs(songs).filter(
    song => !existingSongs.some(existingSong => isSameSongIdentity(existingSong, song))
  )
}

export function addUniqueSongsToLocalPlaylist(
  playlist: LocalPlaylist,
  songs: Song[]
): AddSongsToLocalPlaylistResult {
  const nextSongs = filterNewLocalSongs(songs, playlist.songs)
  if (nextSongs.length === 0) {
    return {
      playlist,
      addedCount: 0
    }
  }

  playlist.songs.push(...nextSongs)
  playlist.updatedAt = Date.now()

  return {
    playlist,
    addedCount: nextSongs.length
  }
}

export function removeSongFromLocalPlaylist(
  playlist: LocalPlaylist,
  song: Song
): RemoveSongFromLocalPlaylistResult {
  const songIndex = playlist.songs.findIndex(existingSong => isSameSongIdentity(existingSong, song))
  if (songIndex === -1) {
    return {
      playlist,
      removed: false
    }
  }

  playlist.songs.splice(songIndex, 1)
  playlist.updatedAt = Date.now()

  return {
    playlist,
    removed: true
  }
}

export function removeLocalPlaylistById(playlists: LocalPlaylist[], playlistId: string): boolean {
  const playlistIndex = playlists.findIndex(playlist => playlist.id === playlistId)
  if (playlistIndex === -1) {
    return false
  }

  playlists.splice(playlistIndex, 1)
  return true
}

export function setLocalPlaylistCover(playlist: LocalPlaylist, coverUrl: string): LocalPlaylist {
  const nextCoverUrl = coverUrl.trim()
  if (!nextCoverUrl) {
    delete playlist.coverUrl
  } else {
    playlist.coverUrl = nextCoverUrl
  }

  playlist.updatedAt = Date.now()
  return playlist
}

export function clearLocalPlaylistCover(playlist: LocalPlaylist): LocalPlaylist {
  delete playlist.coverUrl
  playlist.updatedAt = Date.now()
  return playlist
}

export const useLocalPlaylistStore = defineStore('localPlaylistStore', {
  state: (): LocalPlaylistState => ({
    playlists: []
  }),
  getters: {
    sortedPlaylists: state =>
      [...state.playlists].sort((left, right) => right.updatedAt - left.updatedAt),
    getPlaylistById: state => {
      return (playlistId: string): LocalPlaylist | null =>
        state.playlists.find(playlist => playlist.id === playlistId) ?? null
    }
  },
  actions: {
    createPlaylist(name: string, songs: Song[]): LocalPlaylist {
      const playlistSongs = cloneUniqueLocalSongs(songs)

      if (playlistSongs.length === 0) {
        throw new Error('本地歌单至少需要一首本地音乐')
      }

      const now = Date.now()
      const playlist: LocalPlaylist = {
        id: createLocalPlaylistId(),
        name: normalizePlaylistName(name),
        songs: playlistSongs,
        createdAt: now,
        updatedAt: now
      }

      this.playlists.unshift(playlist)

      return playlist
    },
    addSongsToPlaylist(playlistId: string, songs: Song[]): AddSongsToLocalPlaylistResult {
      const playlist = this.playlists.find(item => item.id === playlistId)
      if (!playlist) {
        throw new Error('找不到该本地歌单')
      }

      return addUniqueSongsToLocalPlaylist(playlist, songs)
    },
    removeSongFromPlaylist(playlistId: string, song: Song): RemoveSongFromLocalPlaylistResult {
      const playlist = this.playlists.find(item => item.id === playlistId)
      if (!playlist) {
        throw new Error('找不到该本地歌单')
      }

      return removeSongFromLocalPlaylist(playlist, song)
    },
    removePlaylist(playlistId: string): boolean {
      return removeLocalPlaylistById(this.playlists, playlistId)
    },
    setPlaylistCover(playlistId: string, coverUrl: string): LocalPlaylist {
      const playlist = this.playlists.find(item => item.id === playlistId)
      if (!playlist) {
        throw new Error('找不到该本地歌单')
      }

      return setLocalPlaylistCover(playlist, coverUrl)
    },
    clearPlaylistCover(playlistId: string): LocalPlaylist {
      const playlist = this.playlists.find(item => item.id === playlistId)
      if (!playlist) {
        throw new Error('找不到该本地歌单')
      }

      return clearLocalPlaylistCover(playlist)
    }
  },
  persist: {
    storage: storageAdapter,
    pick: ['playlists']
  }
})
