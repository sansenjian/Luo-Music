import { defineStore } from 'pinia'

import { storageAdapter } from '@/services/storageService'
import type { Song } from '@/types/schemas'
import { cloneSongData, getSongPlatformKey, isSameSongIdentity } from '@/utils/songIdentity'

const MAX_RECENT_PLAYS = 100

export type RecentPlayItem = {
  playedAt: number
  song: Song
}

function createRecentPlayIdentityKey(song: Song): string {
  return `${getSongPlatformKey(song)}:${String(song.id)}`
}

export function normalizeRecentPlayItems(items: RecentPlayItem[]): RecentPlayItem[] {
  const seenKeys = new Set<string>()
  const normalizedItems: RecentPlayItem[] = []

  for (const item of items) {
    if (!item?.song) {
      continue
    }

    const identityKey = createRecentPlayIdentityKey(item.song)
    if (seenKeys.has(identityKey)) {
      continue
    }

    seenKeys.add(identityKey)
    normalizedItems.push({
      playedAt:
        typeof item.playedAt === 'number' && Number.isFinite(item.playedAt) ? item.playedAt : 0,
      song: cloneSongData(item.song)
    })

    if (normalizedItems.length >= MAX_RECENT_PLAYS) {
      break
    }
  }

  return normalizedItems
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

    removeSong(song: Song): void {
      this.items = this.items.filter(item => !isSameSongIdentity(item.song, song))
    },

    clear(): void {
      this.items = []
    }
  },

  persist: {
    storage: storageAdapter,
    pick: ['items'],
    afterHydrate: context => {
      const store = context.store as unknown as { items: RecentPlayItem[] }
      store.items = normalizeRecentPlayItems(Array.isArray(store.items) ? store.items : [])
    }
  }
})
