<script setup>
import { watch } from 'vue'
import { useUserPlaylists } from '../../composables/useUserPlaylists'

const props = defineProps({
  userId: {
    type: [String, Number],
    required: true,
  },
})

const emit = defineEmits(['playlist-click'])

const { playlists, count, loading, loadPlaylists } = useUserPlaylists()

// Load data when userId changes
watch(() => props.userId, (newId) => {
  if (newId) loadPlaylists(newId)
}, { immediate: true })

const handlePlaylistClick = (playlistId) => {
  emit('playlist-click', playlistId)
}

const formatPlayCount = (count) => {
  if (count > 10000) {
    return (count / 10000).toFixed(1) + '万'
  }
  return count
}
</script>

<template>
  <div class="playlists-section">
    <div v-if="loading" class="loading-container">
      <p>加载中...</p>
    </div>

    <div v-else-if="playlists.length === 0" class="empty-state">
      <p>暂无歌单</p>
    </div>

    <div v-else class="playlists-grid">
      <div 
        v-for="playlist in playlists" 
        :key="playlist.id" 
        class="playlist-card"
        @click="handlePlaylistClick(playlist.id)"
      >
        <div class="playlist-cover">
          <img :src="playlist.coverImgUrl" :alt="playlist.name" />
          <div class="playlist-overlay">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"></path>
            </svg>
          </div>
          <span v-if="playlist.playCount > 0" class="play-count">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"></path>
            </svg>
            {{ formatPlayCount(playlist.playCount) }}
          </span>
        </div>
        <div class="playlist-info">
          <h3 class="playlist-name">{{ playlist.name }}</h3>
          <p class="playlist-count">{{ playlist.trackCount }} 首</p>
        </div>
      </div>
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
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 28px;
}

.playlist-card {
  cursor: pointer;
  transition: all 0.3s ease;
}

.playlist-card:hover {
  transform: translateY(-8px);
}

.playlist-card:hover .playlist-cover {
  box-shadow: 8px 8px 0 var(--black);
}

.playlist-cover {
  position: relative;
  aspect-ratio: 1;
  border: 2px solid var(--black);
  overflow: hidden;
  background: var(--white);
  margin-bottom: 12px;
  border-radius: 12px;
  box-shadow: 4px 4px 0 var(--black);
  transition: all 0.3s ease;
}

.playlist-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.playlist-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.3s ease;
  color: var(--white);
  backdrop-filter: blur(2px);
}

.playlist-card:hover .playlist-overlay {
  opacity: 1;
}

.playlist-overlay svg {
  transform: scale(0.8);
  transition: transform 0.3s ease;
}

.playlist-card:hover .playlist-overlay svg {
  transform: scale(1);
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
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
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

@media (max-width: 768px) {
  .playlists-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
}
</style>
