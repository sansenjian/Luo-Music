<script setup lang="ts">
import { computed } from 'vue'

import {
  createEventViewModel,
  type EventFilter,
  type EventItem,
  type EventViewModel
} from '@/composables/useUserEvents'
import type { Song } from '@/platform/music/interface'

interface EventsViewProps {
  events: EventItem[]
  loading?: boolean
  loadingMore?: boolean
  hasMore?: boolean
  // eslint-disable-next-line vue/require-default-prop
  error?: unknown
  activeFilter?: EventFilter
}

const props = withDefaults(defineProps<EventsViewProps>(), {
  loading: false,
  loadingMore: false,
  hasMore: false,
  activeFilter: 'all'
})

const emit = defineEmits<{
  retry: []
  loadMore: []
  'update:filter': [filter: EventFilter]
  'play-song': [song: Song, event: EventItem]
}>()

const errorMessage = computed(() => {
  if (!props.error) {
    return ''
  }

  if (props.error instanceof Error && props.error.message) {
    return props.error.message
  }

  return '动态加载失败，请重试'
})

const showBlockingError = computed(
  () => Boolean(props.error) && props.events.length === 0 && !props.loading
)
const showInlineError = computed(() => Boolean(props.error) && props.events.length > 0)
const emptyMessage = computed(() => (props.activeFilter === 'song' ? '暂无音乐动态' : '暂无动态'))
const eventViewModels = computed<EventViewModel[]>(() => {
  const now = new Date()
  return props.events.map((event, index) => createEventViewModel(event, index, now))
})

const updateFilter = (filter: EventFilter): void => {
  if (props.activeFilter === filter) {
    return
  }

  emit('update:filter', filter)
}

const retry = (): void => {
  emit('retry')
}

const loadMore = (): void => {
  emit('loadMore')
}

const playSong = (event: EventItem): void => {
  if (!event.playableSong) {
    return
  }

  emit('play-song', event.playableSong, event)
}
</script>

<template>
  <div class="events-section">
    <div class="events-toolbar">
      <div class="event-filters" role="tablist" aria-label="动态筛选">
        <button
          type="button"
          class="filter-chip"
          :class="{ active: props.activeFilter === 'all' }"
          @click="updateFilter('all')"
        >
          全部动态
        </button>
        <button
          type="button"
          class="filter-chip"
          :class="{ active: props.activeFilter === 'song' }"
          @click="updateFilter('song')"
        >
          音乐动态
        </button>
      </div>
    </div>

    <div v-if="props.loading && props.events.length === 0" class="loading-container">
      <p>加载中...</p>
    </div>

    <div v-else-if="showBlockingError" class="error-state">
      <p>{{ errorMessage }}</p>
      <button type="button" class="action-button" @click="retry">重新加载</button>
    </div>

    <div v-else-if="props.events.length === 0" class="empty-state">
      <p>{{ emptyMessage }}</p>
    </div>

    <div v-else class="events-list">
      <div v-if="showInlineError" class="error-banner">
        <span>{{ errorMessage }}</span>
        <button type="button" class="inline-action" @click="retry">重试</button>
      </div>

      <div v-for="eventItem in eventViewModels" :key="eventItem.key" class="event-item">
        <div class="event-header">
          <img
            class="event-user-avatar"
            :src="eventItem.userAvatarUrl"
            :alt="eventItem.userAvatarAlt"
            loading="lazy"
            decoding="async"
          />
          <div class="event-user-info">
            <span class="event-user-name">{{ eventItem.userName }}</span>
            <span class="event-time">{{ eventItem.formattedTime }}</span>
          </div>
        </div>
        <div v-if="eventItem.message" class="event-content">
          <p>{{ eventItem.message }}</p>
        </div>
        <div v-if="eventItem.displaySong" class="event-song">
          <img
            class="event-song-cover"
            :src="eventItem.songCoverUrl"
            :alt="eventItem.songName"
            loading="lazy"
            decoding="async"
          />
          <div class="event-song-info">
            <span class="event-song-name">{{ eventItem.songName }}</span>
            <span class="event-song-artist">{{ eventItem.artistText }}</span>
          </div>
          <button
            v-if="eventItem.playableSong"
            type="button"
            class="event-song-play"
            @click="playSong(eventItem.event)"
          >
            播放
          </button>
        </div>
      </div>

      <div v-if="props.hasMore" class="load-more-section">
        <button type="button" class="action-button" :disabled="props.loadingMore" @click="loadMore">
          {{ props.loadingMore ? '加载更多中...' : '加载更多动态' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.events-section {
  background: var(--white);
  border: 2px solid var(--black);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 4px 4px 0 var(--black);
}

.events-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 2px solid var(--black);
  background: var(--bg);
}

.event-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-chip {
  padding: 8px 14px;
  border: 2px solid var(--black);
  border-radius: 999px;
  background: var(--white);
  color: var(--black);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.filter-chip:hover {
  transform: translate(-1px, -1px);
  box-shadow: 2px 2px 0 var(--black);
}

.filter-chip.active {
  background: var(--black);
  color: var(--white);
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
}

.error-state p,
.empty-state p {
  margin: 0;
  font-size: 16px;
  color: var(--gray);
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.events-list {
  padding: 16px;
}

.error-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px 16px;
  border: 2px solid var(--black);
  border-radius: 10px;
  background: #fff4e8;
  color: var(--black);
}

.event-item {
  padding: 20px;
  border-bottom: 1px solid var(--bg-dark);
  contain: layout paint style;
  contain-intrinsic-size: 168px;
  content-visibility: auto;
  transition: background 0.2s ease;
}

.event-item:hover {
  background: var(--bg);
}

.event-item:last-child {
  border-bottom: none;
}

.event-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.event-user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--black);
  box-shadow: 2px 2px 0 var(--black);
}

.event-user-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event-user-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--black);
}

.event-time {
  font-size: 12px;
  color: var(--gray);
}

.event-content {
  margin-bottom: 12px;
}

.event-content p {
  margin: 0;
  font-size: 14px;
  color: var(--black);
  line-height: 1.6;
}

.event-song {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg);
  border-radius: 8px;
  border: 2px solid var(--black);
  transition: all 0.2s ease;
}

.event-song:hover {
  background: var(--white);
  box-shadow: 2px 2px 0 var(--black);
}

.event-song-cover {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  object-fit: cover;
}

.event-song-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.event-song-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--black);
}

.event-song-artist {
  font-size: 12px;
  color: var(--gray);
}

.event-song-play,
.action-button,
.inline-action {
  border: 2px solid var(--black);
  background: var(--white);
  color: var(--black);
  cursor: pointer;
  font-weight: 600;
}

.event-song-play {
  padding: 8px 12px;
  border-radius: 999px;
}

.action-button,
.inline-action {
  padding: 10px 16px;
  border-radius: 10px;
}

.action-button:disabled {
  cursor: wait;
  opacity: 0.7;
}

.load-more-section {
  display: flex;
  justify-content: center;
  padding: 24px 0 8px;
}
</style>
