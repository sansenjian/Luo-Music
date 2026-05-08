<script setup lang="ts">
import type { FavoriteAlbumItem } from '@/composables/useFavoriteAlbums'

interface FavoriteAlbumsViewProps {
  albums: FavoriteAlbumItem[]
  loading?: boolean
  interactive?: boolean
  playingAlbumId?: string | null
}

const props = withDefaults(defineProps<FavoriteAlbumsViewProps>(), {
  loading: false,
  interactive: true,
  playingAlbumId: null
})

const emit = defineEmits<{
  'album-open': [albumId: string | number]
  'album-play': [albumId: string | number]
}>()

function formatArtistName(album: FavoriteAlbumItem): string {
  const artistName = typeof album.artistName === 'string' ? album.artistName.trim() : ''
  return artistName || '未知艺术家'
}

function handleAlbumOpen(albumId: string | number): void {
  if (!props.interactive) {
    return
  }

  emit('album-open', albumId)
}

function handleAlbumPlay(albumId: string | number): void {
  emit('album-play', albumId)
}

function isPlayingAlbum(albumId: string | number): boolean {
  return props.playingAlbumId !== null && String(props.playingAlbumId) === String(albumId)
}
</script>

<template>
  <div class="favorite-albums-section">
    <div v-if="props.loading && props.albums.length === 0" class="loading-container">
      <p>加载中...</p>
    </div>

    <div v-else-if="props.albums.length === 0" class="empty-state">
      <p>暂无收藏专辑</p>
    </div>

    <div v-else class="albums-grid">
      <article v-for="album in props.albums" :key="album.id" class="album-card">
        <div v-if="props.interactive" class="album-card-shell">
          <button
            type="button"
            class="album-card-hit album-card-shell-button"
            @click="handleAlbumOpen(album.id)"
          >
            <div class="album-cover">
              <img :src="album.picUrl" :alt="album.name" loading="lazy" decoding="async" />
              <div class="album-overlay">
                <span>查看详情</span>
              </div>
            </div>
            <div class="album-info">
              <h3 class="album-name">{{ album.name }}</h3>
              <p class="album-artist">{{ formatArtistName(album) }}</p>
              <p class="album-meta">{{ album.size }} 首歌曲</p>
            </div>
          </button>

          <button
            type="button"
            class="album-play-button"
            :disabled="isPlayingAlbum(album.id)"
            @click.stop="handleAlbumPlay(album.id)"
          >
            {{ isPlayingAlbum(album.id) ? '播放中...' : '播放专辑' }}
          </button>
        </div>

        <div v-else class="album-card-shell">
          <div class="album-cover">
            <img :src="album.picUrl" :alt="album.name" loading="lazy" decoding="async" />
          </div>
          <div class="album-info">
            <h3 class="album-name">{{ album.name }}</h3>
            <p class="album-artist">{{ formatArtistName(album) }}</p>
            <p class="album-meta">{{ album.size }} 首歌曲</p>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.favorite-albums-section {
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

.albums-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 24px;
}

.album-card {
  display: flex;
  flex-direction: column;
  contain: layout paint style;
  contain-intrinsic-size: 320px 360px;
  content-visibility: auto;
}

.album-card-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: transform 0.2s ease;
}

.album-card-shell-button {
  display: flex;
  flex-direction: column;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.album-card-hit {
  width: 100%;
}

.album-card:hover .album-card-shell {
  transform: translateY(-6px);
}

.album-cover {
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

.album-card:hover .album-cover {
  box-shadow: 8px 8px 0 var(--black);
}

.album-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.album-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  padding: 16px;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.68));
  color: var(--white);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.album-card-shell-button:hover .album-overlay,
.album-card-shell-button:focus-visible .album-overlay {
  opacity: 1;
}

.album-card-shell-button:focus-visible {
  outline: none;
}

.album-card-shell-button:focus-visible .album-cover {
  box-shadow: 8px 8px 0 var(--accent);
}

.album-play-button {
  min-height: 40px;
  padding: 0 14px;
  border: 2px solid var(--black);
  border-radius: 999px;
  background: var(--white);
  color: var(--black);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    opacity 0.2s ease;
}

.album-play-button:hover:not(:disabled) {
  background: var(--black);
  color: var(--white);
}

.album-play-button:disabled {
  cursor: default;
  opacity: 0.7;
}

.album-info {
  padding: 0 4px;
}

.album-name {
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

.album-artist,
.album-meta {
  margin: 0;
  font-size: 12px;
  color: var(--gray);
}

.album-meta {
  margin-top: 4px;
}

@media (max-width: 768px) {
  .albums-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
}
</style>
