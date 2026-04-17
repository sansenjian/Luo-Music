import { defineStore } from 'pinia'

import { storageAdapter } from '@/services/storageService'
import type { Song } from '@/types/schemas'

const MAX_RECENT_PLAYS = 100

export type RecentPlayItem = {
  playedAt: number
  song: Song
}

function cloneSong(song: Song): Song {
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

function isSameSong(left: Song, right: Song): boolean {
  return left.id === right.id && (left.platform ?? 'netease') === (right.platform ?? 'netease')
}

export const useRecentPlayStore = defineStore('recentPlay', {
  state: () => ({
    items: [] as RecentPlayItem[]
  }),

  actions: {
    recordSong(song: Song): void {
      const nextEntry: RecentPlayItem = {
        playedAt: Date.now(),
        song: cloneSong(song)
      }

      this.items = [nextEntry, ...this.items.filter(item => !isSameSong(item.song, song))].slice(
        0,
        MAX_RECENT_PLAYS
      )
    },

    clear(): void {
      this.items = []
    }
  },

  persist: {
    storage: storageAdapter,
    pick: ['items']
  }
})
