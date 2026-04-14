<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

import { usePlayerStore } from '../store/playerStore.ts'
import { formatTime } from '../utils/player/helpers/timeFormatter'
import type { Song } from '../platform/music/interface'

const playerStore = usePlayerStore()
const listRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const containerHeight = ref(560)

const emit = defineEmits(['play-song'])

const ITEM_HEIGHT = 74
const OVERSCAN = 6
const RENDER_CHUNK_SIZE = 50
const MIN_RENDERED_SCREENS = 2

type PlaylistItem = {
  id: Song['id']
  artistText: string
  cover: string
  duration: number
  isQQ: boolean
  name: string
}

function normalizePlaylistItem(song: Song): PlaylistItem {
  return {
    id: song.id,
    artistText: Array.isArray(song.artists)
      ? song.artists.map(artist => artist.name).join(' / ')
      : '',
    cover: song.album?.picUrl || '',
    duration: Math.floor(song.duration / 1000),
    isQQ: song.platform === 'qq',
    name: song.name
  }
}

const renderedCount = ref(0)
const normalizedSongs = shallowRef<PlaylistItem[]>([])
let normalizedSongSources: Song[] = []
const totalSongCount = computed(() => playerStore.songList.length)
const currentIndex = computed(() => playerStore.currentIndex)
const renderedSongCount = computed(() =>
  Math.min(renderedCount.value, normalizedSongs.value.length)
)
const totalHeight = computed(() => renderedSongCount.value * ITEM_HEIGHT)
const maxScrollTop = computed(() => Math.max(0, totalHeight.value - containerHeight.value))
const effectiveScrollTop = computed(() => Math.min(scrollTop.value, maxScrollTop.value))
const visibleCount = computed(() =>
  Math.max(1, Math.ceil(containerHeight.value / ITEM_HEIGHT) + OVERSCAN * 2)
)
const startIndex = computed(() =>
  Math.max(0, Math.floor(effectiveScrollTop.value / ITEM_HEIGHT) - OVERSCAN)
)
const endIndex = computed(() =>
  Math.min(renderedSongCount.value, startIndex.value + visibleCount.value)
)
const offsetY = computed(() => startIndex.value * ITEM_HEIGHT)
const visibleSongs = computed(() =>
  normalizedSongs.value.slice(startIndex.value, endIndex.value).map((song, offset) => ({
    index: startIndex.value + offset,
    song
  }))
)

function syncNormalizedSongs(songList: Song[]): void {
  const nextNormalizedSongs = new Array<PlaylistItem>(songList.length)
  let changed = normalizedSongSources.length !== songList.length

  for (let index = 0; index < songList.length; index += 1) {
    const song = songList[index]

    if (normalizedSongSources[index] === song) {
      nextNormalizedSongs[index] = normalizedSongs.value[index]
      continue
    }

    nextNormalizedSongs[index] = normalizePlaylistItem(song)
    changed = true
  }

  if (!changed) {
    return
  }

  normalizedSongSources = songList.slice()
  normalizedSongs.value = nextNormalizedSongs
}

function getInitialRenderCount(total = totalSongCount.value): number {
  if (total <= 0) {
    return 0
  }

  const viewportCount = Math.max(1, Math.ceil(containerHeight.value / ITEM_HEIGHT))
  return Math.min(total, Math.max(RENDER_CHUNK_SIZE, viewportCount * MIN_RENDERED_SCREENS))
}

function setRenderedCount(nextCount: number): void {
  renderedCount.value = Math.min(totalSongCount.value, Math.max(0, nextCount))
}

function ensureRenderedIndex(index: number): void {
  if (index < 0) {
    return
  }

  const requiredCount = Math.ceil((index + 1) / RENDER_CHUNK_SIZE) * RENDER_CHUNK_SIZE
  setRenderedCount(Math.max(renderedCount.value, requiredCount, getInitialRenderCount()))
}

function maybeRenderMore(): void {
  if (renderedCount.value >= totalSongCount.value || renderedCount.value === 0) {
    return
  }

  const viewportMidpoint = scrollTop.value + containerHeight.value / 2
  let nextCount = renderedCount.value

  while (nextCount < totalSongCount.value && viewportMidpoint >= (nextCount * ITEM_HEIGHT) / 2) {
    nextCount += RENDER_CHUNK_SIZE
  }

  if (nextCount !== renderedCount.value) {
    setRenderedCount(nextCount)
  }
}

watch(
  [() => playerStore.songList, totalSongCount],
  ([nextSongs]) => {
    syncNormalizedSongs(nextSongs)
    setRenderedCount(getInitialRenderCount(nextSongs.length))

    if (nextSongs.length === 0) {
      syncScrollPosition(0)
      return
    }

    if (currentIndex.value >= 0) {
      ensureRenderedIndex(currentIndex.value)
    }

    maybeRenderMore()
  },
  { immediate: true }
)

watch(currentIndex, newIndex => {
  if (newIndex === -1) return
  ensureRenderedIndex(newIndex)
  void nextTick(() => {
    const listElement = listRef.value
    if (!listElement) {
      return
    }

    const targetTop = Math.max(
      0,
      newIndex * ITEM_HEIGHT - (containerHeight.value - ITEM_HEIGHT) / 2
    )
    listElement.scrollTo({
      top: targetTop,
      behavior: 'smooth'
    })
  })
})

function playSong(index: number): void {
  emit('play-song', index)
}

function syncContainerHeight(): void {
  containerHeight.value = listRef.value?.clientHeight || 560
  setRenderedCount(Math.max(renderedCount.value, getInitialRenderCount()))
}

function syncScrollPosition(nextScrollTop: number): void {
  scrollTop.value = nextScrollTop

  const listElement = listRef.value
  if (listElement && listElement.scrollTop !== nextScrollTop) {
    listElement.scrollTop = nextScrollTop
  }
}

function clampScrollPosition(): void {
  syncScrollPosition(Math.min(scrollTop.value, maxScrollTop.value))
}

function handleScroll(): void {
  scrollTop.value = listRef.value?.scrollTop || 0
  maybeRenderMore()
}

watch([totalHeight, containerHeight], () => {
  void nextTick(() => {
    clampScrollPosition()
    maybeRenderMore()
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
  <div ref="listRef" class="playlist" @scroll="handleScroll">
    <div v-if="totalSongCount === 0" class="empty-state">
      <div class="empty-icon">[]</div>
      <div>NO TRACKS LOADED</div>
    </div>

    <div v-else class="track-list" :style="{ height: `${totalHeight}px` }">
      <div class="track-list-window" :style="{ transform: `translateY(${offsetY}px)` }">
        <div
          v-for="{ song, index } in visibleSongs"
          :key="`${song.id}-${index}`"
          class="list-item"
          :class="{ active: index === currentIndex }"
          :data-index="index"
          @click="playSong(index)"
        >
          <div v-if="song.cover" class="list-cover">
            <img :src="song.cover" :alt="song.name" loading="lazy" />
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
              <span class="server-badge" :class="song.isQQ ? 'qq' : 'netease'">
                {{ song.isQQ ? 'QQ' : 'Netease' }}
              </span>
            </div>
            <div class="list-artist">{{ song.artistText }}</div>
          </div>
          <div class="list-duration">
            {{ formatTime(song.duration) }}
          </div>
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
  position: relative;
  min-height: 100%;
}

.track-list-window {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.list-item {
  display: grid;
  grid-template-columns: 50px 36px 1fr 50px;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  height: 74px;
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
