<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import type { FormattedSong } from '@/utils/songFormatter'

import LikedSongListItem from './LikedSongListItem.vue'
import LikedSongsToolbar from './LikedSongsToolbar.vue'
import type { LikedSongsFilterScope, LikedSongsFilterScopeOption } from './likedSongsView.types'

interface LikedSongsViewProps {
  likeSongs: FormattedSong[]
  hasMore?: boolean
  loading?: boolean
  loadingMore?: boolean
  // eslint-disable-next-line vue/require-default-prop
  error?: unknown
}

const props = withDefaults(defineProps<LikedSongsViewProps>(), {
  hasMore: false,
  loading: false,
  loadingMore: false
})

const emit = defineEmits<{
  'load-more': []
  'play-all': []
  'play-song': [index: number]
  retry: []
}>()

const rootRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const filterScope = ref<LikedSongsFilterScope>('all')
const scrollTop = ref(0)
const containerHeight = ref(640)
const itemHeight = ref(88)
const activeIndex = ref(0)
const lastLoadMoreLength = ref<number | null>(null)
let resizeObserver: ResizeObserver | null = null

const DEFAULT_ITEM_HEIGHT = 88
const OVERSCAN = 6
const scopeOptions: LikedSongsFilterScopeOption[] = [
  { value: 'all', label: '全部' },
  { value: 'name', label: '歌名' },
  { value: 'artist', label: '歌手' },
  { value: 'album', label: '专辑' }
]

const normalizedQuery = computed(() => searchQuery.value.trim().toLocaleLowerCase())
const hasSearchQuery = computed(() => normalizedQuery.value.length > 0)
const filteredSongs = computed(() => {
  if (!hasSearchQuery.value) {
    return props.likeSongs
  }

  return props.likeSongs.filter(song => {
    const fields =
      filterScope.value === 'all' ? [song.name, song.artist, song.album] : [song[filterScope.value]]

    return fields.some(field => field.toLocaleLowerCase().includes(normalizedQuery.value))
  })
})
const errorMessage = computed(() => {
  if (!props.error) {
    return ''
  }

  if (props.error instanceof Error && props.error.message) {
    return props.error.message
  }

  if (typeof props.error === 'string') {
    return props.error
  }

  return '加载喜欢的音乐时发生错误，请稍后重试。'
})
const totalHeight = computed(() => filteredSongs.value.length * itemHeight.value)
const maxScrollTop = computed(() => Math.max(0, totalHeight.value - containerHeight.value))
const effectiveScrollTop = computed(() => Math.min(scrollTop.value, maxScrollTop.value))
const visibleCount = computed(() =>
  Math.max(1, Math.ceil(containerHeight.value / itemHeight.value) + OVERSCAN * 2)
)
const visibleRowCount = computed(() =>
  Math.max(1, Math.ceil(containerHeight.value / itemHeight.value))
)
const startIndex = computed(() =>
  Math.max(0, Math.floor(effectiveScrollTop.value / itemHeight.value) - OVERSCAN)
)
const endIndex = computed(() =>
  Math.min(filteredSongs.value.length, startIndex.value + visibleCount.value)
)
const offsetY = computed(() => startIndex.value * itemHeight.value)
const visibleSongs = computed(() =>
  filteredSongs.value.slice(startIndex.value, endIndex.value).map((song, offset) => ({
    index: startIndex.value + offset,
    song
  }))
)
const showSearchEmptyState = computed(
  () => !props.loading && props.likeSongs.length > 0 && filteredSongs.value.length === 0
)
const canLoadMoreSearchResults = computed(() => showSearchEmptyState.value && props.hasMore)

function handlePlayAll(): void {
  emit('play-all')
}

function handlePlaySong(index: number): void {
  const song = filteredSongs.value[index]
  if (!song) {
    return
  }

  activeIndex.value = clampIndex(index)
  emit('play-song', song.index)
}

function handleRetry(): void {
  emit('retry')
}

function clearSearch(): void {
  searchQuery.value = ''
}

function maybeLoadMore(): void {
  if (!props.hasMore || props.loading || props.loadingMore) {
    return
  }

  if (lastLoadMoreLength.value === props.likeSongs.length) {
    return
  }

  const remainingDistance = maxScrollTop.value - effectiveScrollTop.value
  if (remainingDistance > itemHeight.value * 2) {
    return
  }

  lastLoadMoreLength.value = props.likeSongs.length
  emit('load-more')
}

function readItemHeight(): number {
  if (!rootRef.value) {
    return DEFAULT_ITEM_HEIGHT
  }

  const cssValue = Number.parseInt(
    window.getComputedStyle(rootRef.value).getPropertyValue('--item-height'),
    10
  )

  return Number.isFinite(cssValue) && cssValue > 0 ? cssValue : DEFAULT_ITEM_HEIGHT
}

function clampIndex(index: number): number {
  if (filteredSongs.value.length === 0) {
    return 0
  }

  return Math.min(Math.max(index, 0), filteredSongs.value.length - 1)
}

function syncItemHeight(): void {
  itemHeight.value = readItemHeight()
}

function syncContainerHeight(): void {
  containerHeight.value = listRef.value?.clientHeight || 640
}

function syncListMetrics(): void {
  syncItemHeight()
  syncContainerHeight()
}

function getVisibleRange(scrollPosition = effectiveScrollTop.value): {
  first: number
  last: number
} {
  if (filteredSongs.value.length === 0) {
    return { first: 0, last: 0 }
  }

  const first = Math.max(0, Math.floor(scrollPosition / itemHeight.value))
  const last = Math.min(filteredSongs.value.length - 1, first + visibleRowCount.value - 1)

  return { first, last }
}

function syncActiveIndexToViewport(scrollPosition = effectiveScrollTop.value): void {
  if (filteredSongs.value.length === 0) {
    activeIndex.value = 0
    return
  }

  const { first, last } = getVisibleRange(scrollPosition)
  activeIndex.value = Math.min(Math.max(activeIndex.value, first), last)
}

function focusActiveSong(): void {
  if (filteredSongs.value.length === 0) {
    return
  }

  void nextTick(() => {
    const activeButton = listRef.value?.querySelector<HTMLButtonElement>(
      `.song-item[data-filtered-index="${activeIndex.value}"]`
    )
    activeButton?.focus({ preventScroll: true })
  })
}

function setListScrollTop(nextScrollTop: number): void {
  const clampedScrollTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop.value))
  scrollTop.value = clampedScrollTop

  const listElement = listRef.value
  if (listElement && listElement.scrollTop !== clampedScrollTop) {
    listElement.scrollTop = clampedScrollTop
  }
}

function scrollSongIntoView(index: number): void {
  const listElement = listRef.value
  if (!listElement || filteredSongs.value.length === 0) {
    return
  }

  const songTop = index * itemHeight.value
  const songBottom = songTop + itemHeight.value
  const viewportTop = effectiveScrollTop.value
  const viewportBottom = viewportTop + containerHeight.value

  if (songTop < viewportTop) {
    setListScrollTop(songTop)
    return
  }

  if (songBottom > viewportBottom) {
    setListScrollTop(songBottom - containerHeight.value)
  }
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
  syncActiveIndexToViewport(scrollTop.value)
  maybeLoadMore()
}

function clampScrollPosition(): void {
  activeIndex.value = clampIndex(activeIndex.value)
  const nextScrollTop = Math.min(scrollTop.value, maxScrollTop.value)
  setListScrollTop(nextScrollTop)
  syncActiveIndexToViewport(nextScrollTop)
}

function moveActiveIndex(nextIndex: number): void {
  if (filteredSongs.value.length === 0) {
    return
  }

  activeIndex.value = clampIndex(nextIndex)
  scrollSongIntoView(activeIndex.value)
  focusActiveSong()
}

function handleListFocus(event: FocusEvent): void {
  if (event.target !== listRef.value || filteredSongs.value.length === 0) {
    return
  }

  focusActiveSong()
}

function handleSongFocus(index: number): void {
  activeIndex.value = clampIndex(index)
}

function handleListKeydown(event: KeyboardEvent): void {
  if (filteredSongs.value.length === 0) {
    return
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveActiveIndex(activeIndex.value + 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveActiveIndex(activeIndex.value - 1)
      break
    case 'PageDown':
      event.preventDefault()
      moveActiveIndex(activeIndex.value + visibleRowCount.value)
      break
    case 'PageUp':
      event.preventDefault()
      moveActiveIndex(activeIndex.value - visibleRowCount.value)
      break
    case 'Home':
      event.preventDefault()
      moveActiveIndex(0)
      break
    case 'End':
      event.preventDefault()
      moveActiveIndex(filteredSongs.value.length - 1)
      break
    case 'Enter':
    case ' ':
      if (event.target === listRef.value) {
        event.preventDefault()
        handlePlaySong(activeIndex.value)
      }
      break
    default:
      break
  }
}

watch(
  () => props.likeSongs.length,
  (nextLength, previousLength) => {
    if (nextLength > previousLength) {
      lastLoadMoreLength.value = null
    }

    void nextTick(() => {
      syncListMetrics()
      clampScrollPosition()
    })
  }
)

watch([normalizedQuery, filterScope], () => {
  activeIndex.value = 0
  setListScrollTop(0)
  void nextTick(() => {
    syncListMetrics()
    clampScrollPosition()
  })
})

watch(
  () => [props.hasMore, props.loadingMore] as const,
  ([hasMore, loadingMore]) => {
    if (!hasMore) {
      lastLoadMoreLength.value = null
      return
    }

    if (!loadingMore) {
      lastLoadMoreLength.value = null
    }
  }
)

watch([totalHeight, containerHeight, itemHeight], () => {
  void nextTick(() => {
    clampScrollPosition()
  })
})

watch(
  listRef,
  element => {
    bindResizeObserver(element)
    void nextTick(() => {
      syncListMetrics()
      clampScrollPosition()
    })
  },
  { flush: 'post' }
)

onMounted(() => {
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
  <div ref="rootRef" class="liked-songs-section">
    <div v-if="props.loading && props.likeSongs.length === 0" class="loading-container">
      <p>加载中...</p>
    </div>

    <div v-else-if="props.error && props.likeSongs.length === 0" class="error-state" role="alert">
      <p class="error-title">喜欢的音乐加载失败</p>
      <p class="error-message">{{ errorMessage }}</p>
      <button class="retry-btn" type="button" @click="handleRetry">重新加载</button>
    </div>

    <div v-else-if="props.likeSongs.length === 0" class="empty-state">
      <p>暂无喜欢的音乐</p>
    </div>

    <template v-else>
      <LikedSongsToolbar
        v-model:search-query="searchQuery"
        v-model:filter-scope="filterScope"
        :scope-options="scopeOptions"
        :has-search-query="hasSearchQuery"
        :filtered-count="filteredSongs.length"
        :loaded-count="props.likeSongs.length"
        @play-all="handlePlayAll"
      />

      <div v-if="props.error" class="inline-error" role="alert">
        <span>{{ errorMessage }}</span>
        <button type="button" class="inline-error-action" @click="handleRetry">重试</button>
      </div>

      <div v-if="showSearchEmptyState" class="search-empty-state">
        <p>当前已加载内容里没有匹配结果。</p>
        <div class="search-empty-actions">
          <button type="button" class="secondary-action" @click="clearSearch">清空搜索</button>
          <button
            v-if="canLoadMoreSearchResults"
            type="button"
            class="secondary-action"
            @click="$emit('load-more')"
          >
            继续加载下一批
          </button>
        </div>
      </div>

      <div
        v-else
        ref="listRef"
        class="songs-list"
        tabindex="0"
        @focus="handleListFocus"
        @keydown="handleListKeydown"
        @scroll="handleScroll"
      >
        <div class="songs-viewport" :style="{ height: `${totalHeight}px` }">
          <div class="songs-window" :style="{ transform: `translateY(${offsetY}px)` }">
            <LikedSongListItem
              v-for="{ song, index } in visibleSongs"
              :key="`${song.id}-${song.index}`"
              :song="song"
              :filtered-index="index"
              :active="index === activeIndex"
              @play="handlePlaySong"
              @focus="handleSongFocus"
            />
          </div>
        </div>

        <div v-if="props.loadingMore" class="load-more-indicator">
          <p>继续加载中...</p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.liked-songs-section {
  --item-height: 88px;
  padding: 0;
}

.loading-container {
  text-align: center;
  padding: 60px 20px;
  font-size: 16px;
  color: var(--gray);
}

.error-state,
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

.error-state {
  border-style: solid;
  border-color: #dc3545;
}

.error-title {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--black);
}

.error-message {
  margin: 0 0 18px;
  color: var(--gray);
}

.retry-btn,
.secondary-action,
.inline-error-action {
  padding: 10px 16px;
  background: var(--white);
  border: 2px solid var(--black);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  color: var(--black);
  transition: all 0.2s ease;
}

.retry-btn:hover,
.secondary-action:hover,
.inline-error-action:hover {
  background: var(--black);
  color: var(--white);
}

.inline-error,
.search-empty-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding: 14px 16px;
  border: 2px solid var(--black);
  border-radius: 12px;
  background: var(--white);
  box-shadow: 4px 4px 0 var(--black);
}

.inline-error {
  border-color: #dc3545;
}

.search-empty-state p,
.inline-error span {
  margin: 0;
  color: var(--gray);
  font-size: 13px;
}

.search-empty-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
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

.songs-list:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
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

.load-more-indicator {
  padding: 20px 16px 24px;
  text-align: center;
  color: var(--gray);
  font-size: 13px;
}

.load-more-indicator p {
  margin: 0;
}

@media (max-width: 768px) {
  .inline-error,
  .search-empty-state {
    flex-direction: column;
    align-items: stretch;
  }

  .songs-list {
    max-height: min(68vh, 720px);
  }
}
</style>
