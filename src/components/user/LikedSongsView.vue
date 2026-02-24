<script setup>
import { watch } from 'vue'
import { useLikedSongs } from '../../composables/useLikedSongs'
import { formatDuration } from '../../utils/songFormatter'

const props = defineProps({
  userId: {
    type: [String, Number],
    required: true,
  },
})

const emit = defineEmits(['play-song', 'play-all'])

const { likeSongs, formattedSongs, count, loading, loadLikedSongs } = useLikedSongs()

// Load data when userId changes
watch(() => props.userId, (newId) => {
  if (newId) loadLikedSongs(newId)
}, { immediate: true })

const handlePlayAll = () => {
  emit('play-all', formattedSongs.value)
}

const handlePlaySong = (index) => {
  emit('play-song', { songs: formattedSongs.value, index })
}
</script>

<template>
  <div class="liked-songs-section">
    <div v-if="loading" class="loading-container">
      <p>加载中...</p>
    </div>

    <div v-else-if="likeSongs.length === 0" class="empty-state">
      <p>暂无喜欢的音乐</p>
    </div>

    <template v-else>
      <div class="play-all-btn" @click="handlePlayAll">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"></path>
        </svg>
        播放全部
      </div>
      
      <div class="songs-list">
        <div 
          v-for="(song, index) in likeSongs" 
          :key="song.id" 
          class="song-item"
          @click="handlePlaySong(index)"
        >
          <span class="song-index">{{ index + 1 }}</span>
          <div class="song-cover">
            <img :src="song.al?.picUrl" :alt="song.name" />
            <div class="song-play-overlay">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"></path>
              </svg>
            </div>
          </div>
          <div class="song-info">
            <h4 class="song-name">{{ song.name }}</h4>
            <p class="song-artist">
              {{ song.ar?.map(a => a.name).join(' / ') || '未知歌手' }}
            </p>
          </div>
          <span class="song-album">{{ song.al?.name || '' }}</span>
          <span class="song-duration">{{ formatDuration(song.dt) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.liked-songs-section {
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

.play-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 28px;
  background: var(--accent);
  color: var(--white);
  border: 2px solid var(--black);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 24px;
  transition: all 0.2s ease;
  box-shadow: 4px 4px 0 var(--black);
}

.play-all-btn:hover {
  background: #e55a2b;
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 var(--black);
}

.play-all-btn:active {
  transform: translate(0, 0);
  box-shadow: 2px 2px 0 var(--black);
}

.songs-list {
  background: var(--white);
  border: 2px solid var(--black);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 4px 4px 0 var(--black);
}

.song-item {
  display: flex;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--bg-dark);
  transition: all 0.2s ease;
  gap: 16px;
  cursor: pointer;
}

.song-item:last-child {
  border-bottom: none;
}

.song-item:hover {
  background: linear-gradient(90deg, var(--bg) 0%, var(--white) 100%);
  padding-left: 24px;
}

.song-item:hover .song-index {
  color: var(--accent);
  font-weight: 700;
}

.song-index {
  width: 32px;
  font-size: 14px;
  color: var(--gray);
  text-align: center;
  font-variant-numeric: tabular-nums;
  transition: all 0.2s ease;
}

.song-cover {
  width: 52px;
  height: 52px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  border: 2px solid var(--black);
  transition: transform 0.2s ease;
  position: relative;
}

.song-item:hover .song-cover {
  transform: scale(1.05);
}

.song-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.song-play-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  color: var(--white);
}

.song-item:hover .song-play-overlay {
  opacity: 1;
}

.song-info {
  flex: 1;
  min-width: 0;
}

.song-name {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-artist {
  margin: 0;
  font-size: 12px;
  color: var(--gray);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-album {
  width: 200px;
  font-size: 12px;
  color: var(--gray);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

.song-duration {
  width: 60px;
  text-align: right;
  font-size: 12px;
  color: var(--gray);
}

@media (max-width: 768px) {
  .song-album {
    display: none;
  }
  
  .song-item {
    padding: 12px 16px;
    gap: 12px;
  }
  
  .song-cover {
    width: 44px;
    height: 44px;
  }
}
</style>
