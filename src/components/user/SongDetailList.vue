<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import type { Song } from '@/platform/music/interface'

interface SongDetailListProps {
  songs: Song[]
  fallbackCover?: string
  virtualizeThreshold?: number
}

const props = withDefaults(defineProps<SongDetailListProps>(), {
  fallbackCover: '',
  virtualizeThreshold: 80
})

const emit = defineEmits<{
  'play-song': [index: number]
}>()

const rootRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const containerHeight = ref(560)
const itemHeight = ref(98)
let resizeObserver: ResizeObserver | null = null

const DEFAULT_ITEM_HEIGHT = 98
const OVERSCAN = 6

const isVirtualized = computed(() => props.songs.length > props.virtualizeThreshold)
const totalHeight = computed(() => props.songs.length * itemHeight.value)
const maxScrollTop = computed(() => Math.max(0, totalHeight.value - containerHeight.value))
const effectiveScrollTop = computed(() => Math.min(scrollTop.value, maxScrollTop.value))
const visibleCount = computed(() =>
  Math.max(1, Math.ceil(containerHeight.value / itemHeight.value) + OVERSCAN * 2)
)
const startIndex = computed(() =>
  Math.max(0, Math.floor(effectiveScrollTop.value / itemHeight.value) - OVERSCAN)
)
const endIndex = computed(() => Math.min(props.songs.length, startIndex.value + visibleCount.value))
const offsetY = computed(() => startIndex.value * itemHeight.value)
const visibleSongs = computed(() =>
  props.songs.slice(startIndex.value, endIndex.value).map((song, offset) => ({
    index: startIndex.value + offset,
    song
  }))
)

function resolveSongCover(song: Song): string {
  return song.album.picUrl || props.fallbackCover || ''
}

function formatArtists(song: Song): string {
  return song.artists
    .map(artist => artist.name)
    .filter(Boolean)
    .join(' / ')
}

function formatDuration(duration: number): string {
  const totalSeconds = Math.max(0, Math.floor(duration / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function emitPlaySong(index: number): void {
  emit('play-song', index)
}

function readItemHeight(): number {
  if (!rootRef.value) {
    return DEFAULT_ITEM_HEIGHT
  }

  const cssValue = Number.parseInt(
    window.getComputedStyle(rootRef.value).getPropertyValue('--detail-song-height'),
    10
  )

  return Number.isFinite(cssValue) && cssValue > 0 ? cssValue : DEFAULT_ITEM_HEIGHT
}

function syncItemHeight(): void {
  itemHeight.value = readItemHeight()
}

function syncContainerHeight(): void {
  containerHeight.value = listRef.value?.clientHeight || 560
}

function syncListMetrics(): void {
  syncItemHeight()
  syncContainerHeight()
}

function setListScrollTop(nextScrollTop: number): void {
  const clampedScrollTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop.value))
  scrollTop.value = clampedScrollTop

  const listElement = listRef.value
  if (listElement && listElement.scrollTop !== clampedScrollTop) {
    listElement.scrollTop = clampedScrollTop
  }
}

function clampScrollPosition(): void {
  setListScrollTop(Math.min(scrollTop.value, maxScrollTop.value))
}

function bindResizeObserver(element: HTMLElement | null): void {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (typeof ResizeObserver === 'undefined' || !element) {
    return
  }

  resizeObserver = new ResizeObserver(() => {
    syncListMetrics()
    clampScrollPosition()
  })
  resizeObserver.observe(element)
}

function handleScroll(): void {
  scrollTop.value = listRef.value?.scrollTop || 0
}

watch(
  () => props.songs.length,
  () => {
    if (!isVirtualized.value) {
      return
    }

    void nextTick(() => {
      syncListMetrics()
      clampScrollPosition()
    })
  }
)

watch(
  isVirtualized,
  nextIsVirtualized => {
    if (!nextIsVirtualized) {
      scrollTop.value = 0
      return
    }

    void nextTick(() => {
      syncListMetrics()
      clampScrollPosition()
    })
  },
  { immediate: true }
)

watch([totalHeight, containerHeight, itemHeight], () => {
  if (!isVirtualized.value) {
    return
  }

  void nextTick(() => {
    clampScrollPosition()
  })
})

watch(
  listRef,
  element => {
    if (!isVirtualized.value) {
      bindResizeObserver(null)
      return
    }

    bindResizeObserver(element)
    void nextTick(() => {
      syncListMetrics()
      clampScrollPosition()
    })
  },
  { flush: 'post' }
)

onMounted(() => {
  syncItemHeight()
  if (!isVirtualized.value) {
    return
  }

  syncListMetrics()
  clampScrollPosition()
  bindResizeObserver(listRef.value)
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<template>
  <div ref="rootRef" class="song-detail-list">
    <div
      v-if="isVirtualized"
      ref="listRef"
      class="detail-list detail-list-virtualized"
      @scroll="handleScroll"
    >
      <div class="detail-viewport" :style="{ height: `${totalHeight}px` }">
        <div class="detail-window" :style="{ transform: `translateY(${offsetY}px)` }">
          <div
            v-for="{ song, index } in visibleSongs"
            :key="`${song.id}-${index}`"
            class="detail-song-row"
          >
            <button type="button" class="detail-song" @click="emitPlaySong(index)">
              <span class="detail-song-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <img
                v-if="resolveSongCover(song)"
                class="detail-song-cover"
                :src="resolveSongCover(song)"
                :alt="song.name"
                loading="lazy"
              />
              <div
                v-else
                class="detail-song-cover detail-song-cover-fallback"
                aria-hidden="true"
              ></div>
              <div class="detail-song-copy">
                <span class="detail-song-name">{{ song.name }}</span>
                <span class="detail-song-artist">{{ formatArtists(song) || '未知歌手' }}</span>
              </div>
              <span class="detail-song-duration">{{ formatDuration(song.duration) }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="detail-list detail-list-static">
      <button
        v-for="(song, index) in props.songs"
        :key="`${song.id}-${index}`"
        type="button"
        class="detail-song"
        @click="emitPlaySong(index)"
      >
        <span class="detail-song-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <img
          v-if="resolveSongCover(song)"
          class="detail-song-cover"
          :src="resolveSongCover(song)"
          :alt="song.name"
          loading="lazy"
        />
        <div v-else class="detail-song-cover detail-song-cover-fallback" aria-hidden="true"></div>
        <div class="detail-song-copy">
          <span class="detail-song-name">{{ song.name }}</span>
          <span class="detail-song-artist">{{ formatArtists(song) || '未知歌手' }}</span>
        </div>
        <span class="detail-song-duration">{{ formatDuration(song.duration) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.song-detail-list {
  --detail-song-height: 98px;
  --detail-song-gap: 10px;
}

.detail-list-static {
  display: flex;
  flex-direction: column;
  gap: var(--detail-song-gap);
}

.detail-list-virtualized {
  max-height: min(60vh, 720px);
  overflow-y: auto;
  padding-right: 4px;
  -webkit-overflow-scrolling: touch;
}

.detail-viewport {
  position: relative;
  min-height: 100%;
}

.detail-window {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.detail-song-row {
  box-sizing: border-box;
  height: var(--detail-song-height);
  padding-bottom: var(--detail-song-gap);
}

.detail-song {
  display: grid;
  grid-template-columns: 36px 52px minmax(0, 1fr) 56px;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: calc(var(--detail-song-height) - var(--detail-song-gap));
  padding: 12px 14px;
  border: 2px solid var(--black);
  border-radius: 12px;
  background: var(--white);
  cursor: pointer;
  text-align: left;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.detail-song:hover {
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--black);
}

.detail-song-index,
.detail-song-duration {
  font-size: 12px;
  font-weight: 700;
  color: var(--gray);
  font-variant-numeric: tabular-nums;
}

.detail-song-duration {
  text-align: right;
}

.detail-song-cover {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 8px;
  border: 2px solid var(--black);
  background: var(--bg);
}

.detail-song-cover-fallback {
  background: linear-gradient(135deg, rgba(255, 112, 59, 0.2), rgba(0, 0, 0, 0.06)), var(--bg);
}

.detail-song-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.detail-song-name,
.detail-song-artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-song-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--black);
}

.detail-song-artist {
  font-size: 12px;
  color: var(--gray);
}

@media (max-width: 768px) {
  .detail-song {
    grid-template-columns: 28px 44px minmax(0, 1fr);
  }

  .detail-song-duration {
    grid-column: 3;
    justify-self: end;
  }
}
</style>
