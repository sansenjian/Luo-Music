<script setup lang="ts">
import SongDetailList from '@/components/user/SongDetailList.vue'
import type { Song } from '@/platform/music/interface'
import type { LocalMusicEmptyStateModel } from '@/composables/home/localMusic.types'

defineProps<{
  activeSongScopeLabel: string | null
  emptyState: LocalMusicEmptyStateModel
  footnoteSizeLabel: string
  hasMore: boolean
  pageLoading: boolean
  songs: Song[]
}>()

defineEmits<{
  'clear-scope': []
  'load-more': []
  'play-song': [index: number]
}>()
</script>

<template>
  <template v-if="activeSongScopeLabel">
    <div class="active-scope">
      <span>当前筛选：{{ activeSongScopeLabel }}</span>
      <button type="button" class="scope-clear" @click="$emit('clear-scope')">查看全部歌曲</button>
    </div>
  </template>

  <div v-if="songs.length === 0" class="local-empty-state">
    <div class="empty-icon">{{ emptyState.icon }}</div>
    <h2>{{ emptyState.title }}</h2>
    <p>{{ emptyState.description }}</p>
  </div>

  <template v-else>
    <SongDetailList :songs="songs" fallback-cover="" @play-song="$emit('play-song', $event)" />

    <div v-if="hasMore" class="load-more-row">
      <button type="button" class="hero-action" :disabled="pageLoading" @click="$emit('load-more')">
        {{ pageLoading ? '加载中...' : '加载更多' }}
      </button>
    </div>

    <div class="local-footnote">
      <span>当前列表使用分页查询加载，本地封面会按需懒加载并缓存。</span>
      <span>当前页文件大小约 {{ footnoteSizeLabel }}</span>
    </div>
  </template>
</template>
