<script setup lang="ts">
import { computed, toRef } from 'vue'

import HomeMediaHero from '@/components/home/media/HomeMediaHero.vue'
import HomeMediaPanelShell from '@/components/home/media/HomeMediaPanelShell.vue'
import HomeMediaSongsSection from '@/components/home/media/HomeMediaSongsSection.vue'
import HomeMediaToolbar from '@/components/home/media/HomeMediaToolbar.vue'
import { useHomeCollectionPanel } from '@/composables/home/useHomeCollectionPanel'

import type { HomeSidebarCollectionSelection } from './homeSidebar.types'

const props = defineProps<{
  collection: HomeSidebarCollectionSelection | null
}>()

const {
  clearSearch,
  coverUrl,
  currentSongId,
  error,
  errorMessage,
  filteredPlaybackSongs,
  hasMore,
  kicker,
  loadCollectionSongs,
  loadMoreCollectionSongs,
  loading,
  loadingMore,
  metaLabel,
  playAll,
  playCollectionAt,
  searchQuery,
  songs,
  title,
  userStore
} = useHomeCollectionPanel(toRef(props, 'collection'))

const countLabel = computed(() => {
  const trackCount = props.collection?.trackCount
  if (trackCount && trackCount > songs.value.length) {
    return `${songs.value.length} / ${trackCount} 首歌曲`
  }
  return `${songs.value.length} 首歌曲`
})
</script>

<template>
  <HomeMediaPanelShell :empty="!props.collection" empty-description="请选择一个歌单或收藏专辑。">
    <template #hero>
      <HomeMediaHero
        :kicker="kicker"
        :title="title"
        :cover-url="coverUrl"
        :cover-shell-class="'collection-cover'"
        :cover-fallback-class="'collection-cover-fallback'"
        :avatar-url="userStore.avatarUrl"
        :avatar-alt="userStore.nickname || '用户头像'"
        :avatar-fallback-label="userStore.nickname?.charAt(0) || '我'"
        :meta-label="metaLabel"
        :count-label="countLabel"
        primary-action-label="播放全部"
        @primary-action="playAll"
      />
    </template>

    <template #toolbar>
      <HomeMediaToolbar
        :search-query="searchQuery"
        :inline-message="error && !loading && songs.length > 0 ? errorMessage : null"
        :inline-action-label="error && !loading && songs.length > 0 ? '重试' : null"
        @update:search-query="value => (searchQuery = value)"
        @clear-search="clearSearch"
        @inline-action="loadCollectionSongs"
      >
        <template #tabs>
          <button type="button" class="subtab active">
            歌曲 {{ props.collection?.trackCount ?? songs.length }}
          </button>
          <button type="button" class="subtab" disabled>评论</button>
          <button type="button" class="subtab" disabled>收藏者</button>
        </template>
      </HomeMediaToolbar>
    </template>

    <HomeMediaSongsSection
      :songs="filteredPlaybackSongs"
      :active-song-id="currentSongId"
      :loading="loading"
      :error-message="errorMessage"
      :show-error-state="Boolean(error && songs.length === 0)"
      empty-description="没有找到匹配的歌曲。"
      :has-more="hasMore"
      :loading-more="loadingMore"
      :show-loading-more-hint="true"
      :load-more-enabled="hasMore"
      :loading-description="`正在加载${kicker}内容...`"
      @play-song="playCollectionAt"
      @load-more="loadMoreCollectionSongs"
      @retry="loadCollectionSongs"
    />
  </HomeMediaPanelShell>
</template>

<style scoped>
.collection-cover {
  background: linear-gradient(135deg, #d3dae7, #eef2f8);
}

.collection-cover-fallback {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0)),
    linear-gradient(160deg, #ced8e6, #eef2f8 70%, #ffffff);
}
</style>
