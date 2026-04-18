<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import type { Song } from '@/platform/music/interface'
import { isLocalLibrarySong } from '@/types/localLibrary'

interface SongDetailListProps {
  songs: Song[]
  activeSongId?: string | number | null
  fallbackCover?: string
  variant?: 'card' | 'table'
  virtualizeThreshold?: number
}

const props = withDefaults(defineProps<SongDetailListProps>(), {
  activeSongId: null,
  fallbackCover: '',
  variant: 'card',
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
    song,
    coverUrl: resolveSongCover(song)
  }))
)
const staticSongs = computed(() =>
  props.songs.map((song, index) => ({
    index,
    song,
    coverUrl: resolveSongCover(song)
  }))
)

function resolveSongCover(song: Song): string {
  const album = song && typeof song === 'object' && 'album' in song ? song.album : undefined
  return album &&
    typeof album === 'object' &&
    'picUrl' in album &&
    typeof album.picUrl === 'string' &&
    album.picUrl.length > 0
    ? album.picUrl
    : props.fallbackCover || ''
}

function formatArtists(song: Song): string {
  return (song && typeof song === 'object' && Array.isArray(song.artists) ? song.artists : [])
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

function resolveDurationLabel(song: Song): string {
  const duration = typeof song?.duration === 'number' ? song.duration : 0

  if (
    isLocalLibrarySong(song) &&
    (!Number.isFinite(duration) || duration <= 0) &&
    song.extra?.localDurationKnown !== true
  ) {
    return '--:--'
  }

  return formatDuration(duration)
}

function emitPlaySong(index: number): void {
  emit('play-song', index)
}

function resolveAlbumName(song: Song): string {
  const album = song && typeof song === 'object' && 'album' in song ? song.album : undefined
  return album && typeof album === 'object' && 'name' in album && typeof album.name === 'string'
    ? album.name || '单曲'
    : '单曲'
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
  <div ref="rootRef" class="song-detail-list" :class="`is-${props.variant}`">
    <div
      v-if="isVirtualized"
      ref="listRef"
      class="detail-list detail-list-virtualized"
      @scroll="handleScroll"
    >
      <div class="detail-viewport" :style="{ height: `${totalHeight}px` }">
        <div class="detail-window" :style="{ transform: `translateY(${offsetY}px)` }">
          <div
            v-for="{ song, index, coverUrl } in visibleSongs"
            :key="`${song.id}-${index}`"
            class="detail-song-row"
          >
            <button
              type="button"
              class="detail-song"
              :class="{ active: props.activeSongId === song.id }"
              @click="emitPlaySong(index)"
            >
              <span class="detail-song-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <img
                v-if="coverUrl"
                class="detail-song-cover"
                :src="coverUrl"
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
              <span v-if="props.variant === 'table'" class="detail-song-album">
                {{ resolveAlbumName(song) }}
              </span>
              <span class="detail-song-duration">{{ resolveDurationLabel(song) }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="detail-list detail-list-static">
      <button
        v-for="{ song, index, coverUrl } in staticSongs"
        :key="`${song.id}-${index}`"
        type="button"
        class="detail-song"
        :class="{ active: props.activeSongId === song.id }"
        @click="emitPlaySong(index)"
      >
        <span class="detail-song-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <img
          v-if="coverUrl"
          class="detail-song-cover"
          :src="coverUrl"
          :alt="song.name"
          loading="lazy"
        />
        <div v-else class="detail-song-cover detail-song-cover-fallback" aria-hidden="true"></div>
        <div class="detail-song-copy">
          <span class="detail-song-name">{{ song.name }}</span>
          <span class="detail-song-artist">{{ formatArtists(song) || '未知歌手' }}</span>
        </div>
        <span v-if="props.variant === 'table'" class="detail-song-album">
          {{ resolveAlbumName(song) }}
        </span>
        <span class="detail-song-duration">{{ resolveDurationLabel(song) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.song-detail-list {
  --detail-song-height: 98px;
  --detail-song-gap: 10px;
}

.song-detail-list.is-table {
  --detail-song-height: 72px;
  --detail-song-gap: 0px;
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

.song-detail-list.is-table .detail-list-static {
  gap: 0;
}

.song-detail-list.is-table .detail-list-virtualized {
  max-height: none;
  padding-right: 0;
}

.song-detail-list.is-table .detail-song-row {
  height: var(--detail-song-height);
  padding-bottom: 0;
}

.song-detail-list.is-table .detail-song {
  grid-template-columns: 40px 40px minmax(0, 2fr) minmax(120px, 1.3fr) 64px;
  min-height: 72px;
  padding: 10px 12px;
  border: 0;
  border-top: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 0;
  background: transparent;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
  box-shadow: none;
}

.song-detail-list.is-table .detail-song:hover {
  transform: none;
  box-shadow: none;
  background: rgba(255, 255, 255, 0.72);
}

.detail-song.active {
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 3px 3px 0 rgba(255, 66, 89, 0.42);
}

.detail-song.active .detail-song-name {
  color: var(--accent);
}

.song-detail-list.is-table .detail-song.active {
  box-shadow: none;
  background: rgba(255, 255, 255, 0.92);
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

.detail-song-album {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--gray);
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

.song-detail-list.is-table .detail-song-cover {
  width: 40px;
  height: 40px;
  border-width: 1px;
  border-color: rgba(17, 24, 39, 0.12);
}

.song-detail-list.is-table .detail-song-cover-fallback {
  background: linear-gradient(135deg, rgba(255, 112, 59, 0.14), rgba(0, 0, 0, 0.04)), var(--bg);
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

  .song-detail-list.is-table .detail-song {
    grid-template-columns: 34px 40px minmax(0, 1fr) 60px;
    gap: 10px;
  }

  .song-detail-list.is-table .detail-song-album {
    display: none;
  }
}
</style>
