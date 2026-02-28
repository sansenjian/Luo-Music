<script setup>
import { computed, watch, ref } from 'vue'
import { usePlayerStore } from '../store/playerStore'
import { formatTime } from '../utils/player/helpers/timeFormatter'

const playerStore = usePlayerStore()
const listRef = ref(null)

const emit = defineEmits(['play-song'])

const songs = computed(() => playerStore.songList)
const currentIndex = computed(() => playerStore.currentIndex)

watch(currentIndex, (newIndex) => {
  if (newIndex === -1) return
  const el = listRef.value?.querySelector(`[data-index="${newIndex}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

function playSong(index) {
  emit('play-song', index)
}
</script>

<template>
  <div ref="listRef" class="playlist">
    <div v-if="songs.length === 0" class="empty-state">
      <div class="empty-icon">[]</div>
      <div>NO TRACKS LOADED</div>
    </div>

    <div v-else class="track-list">
      <div
        v-for="(song, index) in songs"
        :key="song.id"
        class="list-item"
        :class="{ active: index === currentIndex }"
        :data-index="index"
        @click="playSong(index)"
      >
        <div v-if="song.pic" class="list-cover">
          <img :src="song.pic" :alt="song.album" loading="lazy" />
        </div>
        <div class="list-num">
          <span v-if="!(index === currentIndex && playerStore.playing)">
            {{ String(index + 1).padStart(2, '0') }}
          </span>
          <div v-else class="playing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <div class="list-info">
          <div class="list-title">
            {{ song.name }}
            <span class="server-badge" :class="song.server || 'netease'">
              {{ song.server === 'qq' ? 'QQ' : '网易' }}
            </span>
          </div>
          <div class="list-artist">{{ song.artist }}</div>
        </div>
        <div class="list-duration">
          {{ formatTime(song.duration) }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.playlist {
  padding: 6px;
  height: 100%;
  background: var(--bg);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.empty-state {
  text-align: center;
  padding: 60px 40px;
  color: var(--gray);
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
  opacity: 0.3;
}

.track-list {
  display: flex;
  flex-direction: column;
}

.list-item {
  display: grid;
  grid-template-columns: 50px 36px 1fr 50px;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.1s;
  user-select: none;
}

.list-item:hover,
.list-item:active {
  border-color: var(--black);
  background: var(--white);
}

.list-item.active {
  background: var(--black);
  color: var(--white);
}

.list-item.dragging {
  opacity: 0.5;
  border-color: var(--accent);
  background: var(--bg-dark);
}

.list-cover {
  width: 50px;
  height: 50px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.list-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.list-num {
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  opacity: 0.5;
}

.list-item.active .list-num {
  opacity: 1;
  color: var(--accent);
}

.playing-indicator {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  height: 16px;
}

.playing-indicator span {
  width: 3px;
  background: var(--accent);
  animation: soundWave 0.8s ease-in-out infinite;
}

.list-item.active .playing-indicator span {
  background: var(--accent);
}

.playing-indicator span:nth-child(1) {
  height: 8px;
  animation-delay: 0s;
}

.playing-indicator span:nth-child(2) {
  height: 14px;
  animation-delay: 0.2s;
}

.playing-indicator span:nth-child(3) {
  height: 10px;
  animation-delay: 0.4s;
}

@keyframes soundWave {
  0%,
  100% {
    transform: scaleY(1);
  }
  50% {
    transform: scaleY(0.5);
  }
}

.list-info {
  min-width: 0;
  overflow: hidden;
}

.list-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.server-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 2px;
  text-transform: uppercase;
  flex-shrink: 0;
}

.server-badge.netease {
  background: #e60026;
  color: white;
}

.server-badge.qq {
  background: #31c27c;
  color: white;
}

.list-item.active .server-badge.netease {
  background: #ff4d6a;
}

.list-item.active .server-badge.qq {
  background: #5dd99a;
}

.list-artist {
  font-size: 11px;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-duration {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

@media (max-width: 600px) {
  .list-item {
    padding: 12px 16px;
  }

  .list-title {
    font-size: 14px;
  }

  .list-artist {
    font-size: 12px;
  }
}
</style>
