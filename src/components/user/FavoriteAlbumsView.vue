<script setup lang="ts">
import type { FavoriteAlbumItem } from '@/composables/useFavoriteAlbums'

interface FavoriteAlbumsViewProps {
  albums: FavoriteAlbumItem[]
  loading?: boolean
  activeAlbumId?: string | null
}

const props = withDefaults(defineProps<FavoriteAlbumsViewProps>(), {
  loading: false,
  activeAlbumId: null
})

const emit = defineEmits<{
  'album-open': [albumId: string | number]
  'album-play': [albumId: string | number]
}>()

function handleAlbumOpen(albumId: string | number): void {
  emit('album-open', albumId)
}

function handleAlbumPlay(albumId: string | number): void {
  emit('album-play', albumId)
}

function formatArtistName(album: FavoriteAlbumItem): string {
  const artistName = typeof album.artistName === 'string' ? album.artistName.trim() : ''
  return artistName || '未知艺术家'
}
</script>

<template>
  <div class="favorite-albums-section">
    <div v-if="props.loading" class="loading-container">
      <p>加载中...</p>
    </div>

    <div v-else-if="props.albums.length === 0" class="empty-state">
      <p>暂无收藏专辑</p>
    </div>

    <div v-else class="albums-grid">
      <article
        v-for="album in props.albums"
        :key="album.id"
        class="album-card"
        :class="{ active: String(album.id) === props.activeAlbumId }"
      >
        <button type="button" class="album-card-hit" @click="handleAlbumOpen(album.id)">
          <div class="album-cover">
            <img :src="album.picUrl" :alt="album.name" loading="lazy" />
            <div class="album-overlay">
              <div class="album-overlay-copy">
                <strong>查看曲目</strong>
                <span>浏览专辑并选择播放</span>
              </div>
            </div>
          </div>
          <div class="album-info">
            <h3 class="album-name">{{ album.name }}</h3>
            <p class="album-artist">{{ formatArtistName(album) }}</p>
            <p class="album-meta">{{ album.size }} 首歌曲</p>
          </div>
        </button>

        <button type="button" class="album-play-button" @click="handleAlbumPlay(album.id)">
          播放专辑
        </button>
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
  gap: 12px;
}

.album-card.active .album-card-hit {
  transform: translate(-2px, -2px);
  box-shadow: 8px 8px 0 var(--black);
}

.album-card-hit {
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.album-card-hit:hover {
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

.album-card-hit:hover .album-cover {
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
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.74));
  opacity: 0;
  transition: opacity 0.2s ease;
  color: var(--white);
}

.album-card-hit:hover .album-overlay,
.album-card.active .album-overlay {
  opacity: 1;
}

.album-overlay-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.album-overlay-copy strong {
  font-size: 16px;
}

.album-overlay-copy span {
  font-size: 12px;
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

.album-play-button {
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

.album-play-button:hover {
  background: var(--black);
  color: var(--white);
}

@media (max-width: 768px) {
  .albums-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
}
</style>
