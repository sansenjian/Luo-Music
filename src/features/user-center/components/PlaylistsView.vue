<script setup lang="ts">
import type { PlaylistItem } from '@/composables/useUserPlaylists'

interface PlaylistsViewProps {
  playlists: PlaylistItem[]
  loading?: boolean
  activePlaylistId?: string | null
  playingPlaylistId?: string | null
}

const props = withDefaults(defineProps<PlaylistsViewProps>(), {
  loading: false,
  activePlaylistId: null,
  playingPlaylistId: null
})

const emit = defineEmits<{
  'playlist-open': [playlistId: string | number]
  'playlist-play': [playlistId: string | number]
}>()

function handlePlaylistOpen(playlistId: string | number): void {
  emit('playlist-open', playlistId)
}

function handlePlaylistPlay(playlistId: string | number): void {
  emit('playlist-play', playlistId)
}

function isPlayingPlaylist(playlistId: string | number): boolean {
  return String(playlistId) === props.playingPlaylistId
}

function formatPlayCount(count: unknown): string | number {
  const numericCount = Number(count)
  if (!Number.isFinite(numericCount) || numericCount <= 0) {
    return 0
  }

  if (numericCount > 10000) {
    return `${(numericCount / 10000).toFixed(1)}万`
  }

  return numericCount
}
</script>

<template>
  <div class="playlists-section">
    <div v-if="props.loading && props.playlists.length === 0" class="loading-container">
      <p>加载中...</p>
    </div>

    <div v-else-if="props.playlists.length === 0" class="empty-state">
      <p>暂无歌单</p>
    </div>

    <div v-else class="playlists-grid">
      <article
        v-for="playlist in props.playlists"
        :key="playlist.id"
        class="playlist-card"
        :class="{ active: String(playlist.id) === props.activePlaylistId }"
      >
        <button type="button" class="playlist-card-hit" @click="handlePlaylistOpen(playlist.id)">
          <div class="playlist-cover">
            <img
              :src="String(playlist.coverImgUrl ?? '')"
              :alt="playlist.name"
              loading="lazy"
              decoding="async"
            />
            <div class="playlist-overlay">
              <div class="playlist-overlay-copy">
                <strong>查看详情</strong>
                <span>浏览曲目并选择播放</span>
              </div>
            </div>
            <span v-if="Number(playlist.playCount) > 0" class="play-count">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"></path>
              </svg>
              {{ formatPlayCount(playlist.playCount) }}
            </span>
          </div>
          <div class="playlist-info">
            <h3 class="playlist-name">{{ playlist.name }}</h3>
            <p class="playlist-count">{{ playlist.trackCount ?? 0 }} 首</p>
          </div>
        </button>

        <button
          type="button"
          class="playlist-play-button"
          :class="{ loading: isPlayingPlaylist(playlist.id) }"
          :disabled="isPlayingPlaylist(playlist.id)"
          @click="handlePlaylistPlay(playlist.id)"
        >
          {{ isPlayingPlaylist(playlist.id) ? '播放中...' : '直接播放' }}
        </button>
      </article>
    </div>
  </div>
</template>

<style scoped>
.playlists-section {
  padding: 0;
}

.loading-container {
  text-align: center;
  padding: 60px 20px;
  font-size: 16px;
  color: var(--gray);
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  background: var(--white);
  border: 2px dashed var(--gray-light);
  border-radius: 12px;
}

.empty-state p {
  margin: 0;
  font-size: 16px;
  color: var(--gray);
}

.playlists-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 24px;
}

.playlist-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  contain: layout paint style;
  contain-intrinsic-size: 320px 360px;
  content-visibility: auto;
}

.playlist-card.active .playlist-card-hit {
  transform: translate(-2px, -2px);
  box-shadow: 8px 8px 0 var(--black);
}

.playlist-card-hit {
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.playlist-card-hit:hover {
  transform: translateY(-6px);
}

.playlist-cover {
  position: relative;
  aspect-ratio: 1;
  border: 2px solid var(--black);
  overflow: hidden;
  background: var(--white);
  margin-bottom: 12px;
  border-radius: 14px;
  box-shadow: 4px 4px 0 var(--black);
  transition: box-shadow 0.2s ease;
}

.playlist-card-hit:hover .playlist-cover {
  box-shadow: 8px 8px 0 var(--black);
}

.playlist-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.playlist-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  padding: 16px;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.74));
  opacity: 0;
  transition: opacity 0.2s ease;
  color: var(--white);
}

.playlist-card-hit:hover .playlist-overlay,
.playlist-card.active .playlist-overlay {
  opacity: 1;
}

.playlist-overlay-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.playlist-overlay-copy strong {
  font-size: 16px;
}

.playlist-overlay-copy span {
  font-size: 12px;
}

.play-count {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.6);
  color: var(--white);
  font-size: 12px;
  border-radius: 12px;
}

.playlist-info {
  padding: 0 4px;
}

.playlist-name {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 700;
  color: var(--black);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.playlist-count {
  margin: 0;
  font-size: 12px;
  color: var(--gray);
}

.playlist-play-button {
  padding: 10px 14px;
  border: 2px solid var(--black);
  border-radius: 10px;
  background: var(--white);
  color: var(--black);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.playlist-play-button.loading,
.playlist-play-button:disabled {
  cursor: wait;
  opacity: 0.75;
}

.playlist-play-button:hover {
  background: var(--black);
  color: var(--white);
}

.playlist-play-button:hover:disabled {
  background: var(--white);
  color: var(--black);
}

@media (max-width: 768px) {
  .playlists-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
}
</style>
