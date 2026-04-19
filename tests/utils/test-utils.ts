import type { Song, SongPlatform } from '@/platform/music/interface'

/**
 * Create a mock Song object with sensible defaults.
 * Covers the full Song interface so tests don't need to define every field.
 */
export function createMockSong(overrides: Partial<Song> & Record<string, unknown> = {}): Song {
  return {
    id: overrides.id ?? 1,
    name: String(overrides.name ?? 'Song'),
    artists: overrides.artists ?? [{ id: 1, name: String(overrides.artist ?? 'Artist') }],
    album: overrides.album ?? {
      id: 1,
      name: String(overrides.albumName ?? 'Album'),
      picUrl: String(overrides.pic ?? '')
    },
    duration: Number(overrides.duration ?? 180000),
    mvid: overrides.mvid ?? 0,
    platform: (overrides.platform as SongPlatform) ?? 'netease',
    originalId: overrides.originalId ?? overrides.id ?? 1,
    ...overrides
  }
}

/**
 * Shortcut for QQ Music platform songs — avoids repeating `platform: 'qq'`.
 */
export function createQQSong(overrides: Partial<Song> & Record<string, unknown> = {}): Song {
  return createMockSong({ ...overrides, platform: 'qq' })
}
