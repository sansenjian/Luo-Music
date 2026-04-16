<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { formatDuration, type FormattedSong } from '@/utils/songFormatter'

type FilterScope = 'all' | 'name' | 'artist' | 'album'

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
const filterScope = ref<FilterScope>('all')
const scrollTop = ref(0)
const containerHeight = ref(640)
const itemHeight = ref(88)
const activeIndex = ref(0)
const lastLoadMoreLength = ref<number | null>(null)
let resizeObserver: ResizeObserver | null = null

const DEFAULT_ITEM_HEIGHT = 88
const OVERSCAN = 6
const scopeOptions: Array<{ value: FilterScope; label: string }> = [
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

function setFilterScope(scope: FilterScope): void {
  filterScope.value = scope
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
      <div class="liked-toolbar">
        <button class="play-all-btn" type="button" @click="handlePlayAll">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"></path>
          </svg>
          播放全部
        </button>

        <div class="search-panel">
          <label class="search-input">
            <span class="sr-only">搜索喜欢的音乐</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m20 20-3.5-3.5"></path>
            </svg>
            <input
              v-model="searchQuery"
              type="search"
              placeholder="搜索歌名、歌手或专辑"
              autocomplete="off"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="search-clear-btn"
              aria-label="清空搜索"
              @click="clearSearch"
            >
              ×
            </button>
          </label>

          <div class="filter-scopes" role="tablist" aria-label="搜索范围">
            <button
              v-for="scope in scopeOptions"
              :key="scope.value"
              type="button"
              class="scope-btn"
              :class="{ active: filterScope === scope.value }"
              @click="setFilterScope(scope.value)"
            >
              {{ scope.label }}
            </button>
          </div>

          <p class="results-summary">
            <template v-if="hasSearchQuery">
              找到 {{ filteredSongs.length }} 首匹配歌曲，当前已加载 {{ props.likeSongs.length }} 首
            </template>
            <template v-else>当前已加载 {{ props.likeSongs.length }} 首喜欢的音乐</template>
          </p>
        </div>
      </div>

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
            <button
              v-for="{ song, index } in visibleSongs"
              :key="`${song.id}-${song.index}`"
              class="song-item"
              type="button"
              :data-filtered-index="index"
              :tabindex="index === activeIndex ? 0 : -1"
              @click="handlePlaySong(index)"
              @focus="handleSongFocus(index)"
            >
              <span class="song-index">{{ song.index + 1 }}</span>
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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

.liked-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-start;
  margin-bottom: 24px;
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

.search-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  min-height: 52px;
  border: 2px solid var(--black);
  border-radius: 12px;
  background: var(--white);
  box-shadow: 4px 4px 0 var(--black);
  color: var(--gray);
}

.search-input input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 14px;
  color: var(--black);
  background: transparent;
}

.search-input input::placeholder {
  color: var(--gray);
}

.search-clear-btn {
  border: none;
  background: transparent;
  color: var(--gray);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.filter-scopes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.scope-btn {
  padding: 8px 14px;
  border: 2px solid var(--black);
  border-radius: 999px;
  background: var(--white);
  color: var(--black);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.scope-btn.active,
.scope-btn:hover {
  background: var(--black);
  color: var(--white);
}

.results-summary {
  margin: 0;
  font-size: 12px;
  color: var(--gray);
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

.song-item {
  width: 100%;
  display: grid;
  grid-template-columns: 32px 52px minmax(0, 1fr) 200px 60px;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  height: var(--item-height);
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

.song-item:focus-visible {
  position: relative;
  z-index: 1;
  outline: 3px solid var(--accent);
  outline-offset: -3px;
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
  .liked-toolbar,
  .inline-error,
  .search-empty-state {
    flex-direction: column;
    align-items: stretch;
  }

  .songs-list {
    max-height: min(68vh, 720px);
  }

  .play-all-btn {
    width: 100%;
    justify-content: center;
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
