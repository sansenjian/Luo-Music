import { defineStore } from 'pinia'

import { storageAdapter } from '@/services/storageService'
import type { Song } from '@/types/schemas'
import { cloneSongData, isSameSongIdentity } from '@/utils/songIdentity'

const MAX_RECENT_PLAYS = 100

export type RecentPlayItem = {
  playedAt: number
  song: Song
}

export const useRecentPlayStore = defineStore('recentPlay', {
  state: () => ({
    items: [] as RecentPlayItem[]
  }),

  actions: {
    recordSong(song: Song): void {
      const nextEntry: RecentPlayItem = {
        playedAt: Date.now(),
        song: cloneSongData(song)
      }

      this.items = [
        nextEntry,
        ...this.items.filter(item => !isSameSongIdentity(item.song, song))
      ].slice(0, MAX_RECENT_PLAYS)
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
