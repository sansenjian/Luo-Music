<script setup lang="ts">
import type { PlaylistItem } from '@/composables/useUserPlaylists'
import type { Song } from '@/platform/music/interface'

import SongDetailList from '@/components/media/SongDetailList.vue'

interface PlaylistDetailPanelProps {
  playlist: PlaylistItem | null
  songs: Song[]
  loading?: boolean
  hasMore?: boolean
  loadingMore?: boolean
  // eslint-disable-next-line vue/require-default-prop
  error?: unknown
}

const props = withDefaults(defineProps<PlaylistDetailPanelProps>(), {
  loading: false,
  hasMore: false,
  loadingMore: false
})

const emit = defineEmits<{
  close: []
  retry: []
  'play-all': []
  'play-song': [index: number]
  'load-more': []
}>()
</script>

<template>
  <section class="playlist-detail-panel">
    <div class="detail-header">
      <div class="detail-copy">
        <p class="detail-eyebrow">歌单详情</p>
        <h3 class="detail-title">{{ props.playlist?.name ?? '已选择歌单' }}</h3>
        <p class="detail-meta">
          <template
            v-if="props.playlist?.trackCount && props.playlist.trackCount > props.songs.length"
          >
            {{ props.songs.length }} / {{ props.playlist.trackCount }} 首歌曲
          </template>
          <template v-else>{{ props.songs.length }} 首歌曲</template>
        </p>
      </div>

      <div class="detail-actions">
        <button type="button" class="detail-action primary" @click="emit('play-all')">
          播放全部
        </button>
        <button type="button" class="detail-action" @click="emit('close')">收起</button>
      </div>
    </div>

    <div v-if="props.error" class="detail-state detail-state-error" role="alert">
      <div>
        <strong>歌单详情加载失败</strong>
        <p>请重新请求该歌单内容。</p>
      </div>
      <button type="button" class="detail-action" @click="emit('retry')">重试</button>
    </div>

    <div v-else-if="props.loading" class="detail-state">
      <p>歌单详情加载中...</p>
    </div>

    <div v-else-if="props.songs.length === 0" class="detail-state">
      <p>当前歌单暂无可播放歌曲。</p>
    </div>

    <SongDetailList
      v-else
      :songs="props.songs"
      :infinite-scroll="props.hasMore"
      @play-song="emit('play-song', $event)"
      @load-more="emit('load-more')"
    />

    <div v-if="props.loadingMore" class="detail-loading-more">
      <span class="detail-loading-spinner"></span>
      <span>正在加载更多歌曲...</span>
    </div>
  </section>
</template>

<style scoped>
.playlist-detail-panel {
  margin-bottom: 24px;
  padding: 20px;
  border: 2px solid var(--black);
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(255, 112, 59, 0.1), transparent 55%), var(--white);
  box-shadow: 6px 6px 0 var(--black);
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.detail-copy {
  min-width: 0;
}

.detail-eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--accent);
}

.detail-title {
  margin: 0;
  font-size: 24px;
  color: var(--black);
}

.detail-meta {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--gray);
}

.detail-actions {
  display: flex;
  gap: 10px;
}

.detail-action {
  padding: 10px 16px;
  border: 2px solid var(--black);
  border-radius: 10px;
  background: var(--white);
  color: var(--black);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.detail-action:hover {
  background: var(--black);
  color: var(--white);
}

.detail-action.primary {
  background: var(--accent);
  color: var(--white);
}

.detail-action.primary:hover {
  background: #e55a2b;
}

.detail-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  padding: 20px;
  border: 2px dashed var(--gray-light);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.7);
  text-align: center;
}

.detail-state p,
.detail-state strong {
  margin: 0;
}

.detail-state-error {
  justify-content: space-between;
  gap: 16px;
  text-align: left;
}

@media (max-width: 768px) {
  .detail-header,
  .detail-state-error {
    flex-direction: column;
    align-items: stretch;
  }

  .detail-actions {
    width: 100%;
  }

  .detail-action {
    flex: 1;
  }
}

.detail-loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 0;
  color: var(--gray);
  font-size: 13px;
}

.detail-loading-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--gray-light, #ddd);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
