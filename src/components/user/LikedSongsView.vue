<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { formatDuration, type FormattedSong } from '@/utils/songFormatter'

interface LikedSongsViewProps {
  likeSongs: FormattedSong[]
  loading?: boolean
}

const props = withDefaults(defineProps<LikedSongsViewProps>(), {
  loading: false
})

const emit = defineEmits<{
  'play-all': []
  'play-song': [index: number]
}>()

const listRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const containerHeight = ref(640)

const ITEM_HEIGHT = 88
const OVERSCAN = 6

const totalHeight = computed(() => props.likeSongs.length * ITEM_HEIGHT)
const maxScrollTop = computed(() => Math.max(0, totalHeight.value - containerHeight.value))
const effectiveScrollTop = computed(() => Math.min(scrollTop.value, maxScrollTop.value))
const visibleCount = computed(() =>
  Math.max(1, Math.ceil(containerHeight.value / ITEM_HEIGHT) + OVERSCAN * 2)
)
const startIndex = computed(() =>
  Math.max(0, Math.floor(effectiveScrollTop.value / ITEM_HEIGHT) - OVERSCAN)
)
const endIndex = computed(() =>
  Math.min(props.likeSongs.length, startIndex.value + visibleCount.value)
)
const offsetY = computed(() => startIndex.value * ITEM_HEIGHT)
const visibleSongs = computed(() =>
  props.likeSongs.slice(startIndex.value, endIndex.value).map((song, offset) => ({
    index: startIndex.value + offset,
    song
  }))
)

function handlePlayAll(): void {
  emit('play-all')
}

function handlePlaySong(index: number): void {
  emit('play-song', index)
}

function syncContainerHeight(): void {
  containerHeight.value = listRef.value?.clientHeight || 640
}

function handleScroll(): void {
  scrollTop.value = listRef.value?.scrollTop || 0
}

function clampScrollPosition(): void {
  const nextScrollTop = Math.min(scrollTop.value, maxScrollTop.value)
  scrollTop.value = nextScrollTop

  const listElement = listRef.value
  if (listElement && listElement.scrollTop !== nextScrollTop) {
    listElement.scrollTop = nextScrollTop
  }
}

watch(
  () => props.likeSongs.length,
  () => {
    void nextTick(() => {
      syncContainerHeight()
      clampScrollPosition()
    })
  }
)

watch([totalHeight, containerHeight], () => {
  void nextTick(() => {
    clampScrollPosition()
  })
})

onMounted(() => {
  syncContainerHeight()
  clampScrollPosition()
  window.addEventListener('resize', syncContainerHeight)
})

onUnmounted(() => {
  window.removeEventListener('resize', syncContainerHeight)
})
</script>

<template>
  <div class="liked-songs-section">
    <div v-if="props.loading" class="loading-container">
      <p>加载中...</p>
    </div>

    <div v-else-if="props.likeSongs.length === 0" class="empty-state">
      <p>暂无喜欢的音乐</p>
    </div>

    <template v-else>
      <button class="play-all-btn" type="button" @click="handlePlayAll">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"></path>
        </svg>
        播放全部
      </button>

      <div ref="listRef" class="songs-list" @scroll="handleScroll">
        <div class="songs-viewport" :style="{ height: `${totalHeight}px` }">
          <div class="songs-window" :style="{ transform: `translateY(${offsetY}px)` }">
            <button
              v-for="{ song, index } in visibleSongs"
              :key="`${song.id}-${index}`"
              class="song-item"
              type="button"
              :data-index="index"
              @click="handlePlaySong(index)"
            >
              <span class="song-index">{{ index + 1 }}</span>
              <div class="song-cover">
                <img :src="song.cover" :alt="song.name" loading="lazy" />
                <div class="song-play-overlay">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"></path>
                  </svg>
                </div>
              </div>
              <div class="song-info">
                <h4 class="song-name">{{ song.name }}</h4>
                <p class="song-artist">{{ song.artist }}</p>
              </div>
              <span class="song-album">{{ song.album }}</span>
              <span class="song-duration">{{ formatDuration(song.duration * 1000) }}</span>
            </button>
          </div>
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
  overflow-y: auto;
  box-shadow: 4px 4px 0 var(--black);
  max-height: min(72vh, 960px);
  -webkit-overflow-scrolling: touch;
}

.songs-viewport {
  position: relative;
  min-height: 100%;
}

.songs-window {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.song-item {
  width: 100%;
  display: grid;
  grid-template-columns: 32px 52px minmax(0, 1fr) 200px 60px;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  height: 88px;
  border: none;
  border-bottom: 1px solid var(--bg-dark);
  background: var(--white);
  text-align: left;
  transition: all 0.2s ease;
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
  background: var(--bg);
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
  font-variant-numeric: tabular-nums;
}

@media (max-width: 768px) {
  .songs-list {
    max-height: min(68vh, 720px);
  }

  .song-item {
    grid-template-columns: 32px 44px minmax(0, 1fr) 60px;
    padding: 12px 16px;
    gap: 12px;
  }

  .song-cover {
    width: 44px;
    height: 44px;
  }

  .song-album {
    display: none;
  }
}
</style>
