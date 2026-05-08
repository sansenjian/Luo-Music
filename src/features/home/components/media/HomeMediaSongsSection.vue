<script setup lang="ts">
import type { Song } from '@/platform/music/interface'

import SongDetailList from '@/components/media/SongDetailList.vue'

import HomeMediaState from './HomeMediaState.vue'
import HomeMediaTableHead from './HomeMediaTableHead.vue'

type SongContextMenuPayload = {
  clientX: number
  clientY: number
  index: number
  song: Song
}

const props = withDefaults(
  defineProps<{
    songs: Song[]
    activeSongId?: string | number | null
    loading: boolean
    errorMessage?: string | null
    showErrorState?: boolean
    emptyDescription: string
    hasMore?: boolean
    loadingMore?: boolean
    showLoadingMoreHint?: boolean
    loadMoreEnabled?: boolean
    loadingDescription?: string
    retryActionLabel?: string
  }>(),
  {
    activeSongId: null,
    errorMessage: null,
    showErrorState: false,
    hasMore: false,
    loadingMore: false,
    showLoadingMoreHint: false,
    loadMoreEnabled: false,
    loadingDescription: '正在加载歌曲...',
    retryActionLabel: '重试'
  }
)

const emit = defineEmits<{
  'play-song': [index: number]
  'song-context-menu': [payload: SongContextMenuPayload]
  'load-more': []
  retry: []
}>()
</script>

<template>
  <div class="media-songs-section">
    <template v-if="props.loading && props.songs.length === 0">
      <HomeMediaState
        class="media-songs-state"
        variant="card"
        :description="props.loadingDescription"
      />
    </template>

    <template v-else-if="props.showErrorState && props.songs.length === 0">
      <HomeMediaState
        class="media-songs-state"
        variant="card"
        tone="error"
        :description="props.errorMessage || '加载失败，请稍后重试。'"
        :action-label="props.retryActionLabel"
        @action="emit('retry')"
      />
    </template>

    <template v-else>
      <HomeMediaTableHead v-if="props.songs.length > 0" class="media-songs-table-head" />

      <HomeMediaState
        v-if="props.songs.length === 0"
        class="media-songs-empty-state"
        :description="props.emptyDescription"
      />

      <SongDetailList
        v-else
        :songs="props.songs"
        :active-song-id="props.activeSongId"
        :disable-virtualization="true"
        :infinite-scroll="props.loadMoreEnabled && props.hasMore"
        variant="table"
        @play-song="emit('play-song', $event)"
        @song-context-menu="emit('song-context-menu', $event)"
        @load-more="emit('load-more')"
      />

      <div
        v-if="props.songs.length > 0 && props.showLoadingMoreHint && props.loadingMore"
        class="media-songs-load-more"
      >
        <span class="loading-hint">正在加载更多歌曲...</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.media-songs-section {
  margin-top: 2px;
}

.media-songs-load-more {
  padding: 18px 0 0;
  display: flex;
  justify-content: center;
}

.loading-hint {
  font-size: 13px;
  color: var(--gray);
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
