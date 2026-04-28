<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, toRef } from 'vue'

import HomeMediaHero from '@/components/home/media/HomeMediaHero.vue'
import HomeMediaPanelShell from '@/components/home/media/HomeMediaPanelShell.vue'
import HomeMediaSongsSection from '@/components/home/media/HomeMediaSongsSection.vue'
import HomeMediaToolbar from '@/components/home/media/HomeMediaToolbar.vue'
import { useHomeCollectionPanel } from '@/composables/home/useHomeCollectionPanel'
import type { Song } from '@/platform/music/interface'

import type { HomeSidebarCollectionSelection } from './homeSidebar.types'

type CollectionSongContextMenuPayload = {
  clientX: number
  clientY: number
  index: number
  song: Song
}

type CollectionSongContextMenuState = {
  clientX: number
  clientY: number
  song: Song | null
  visible: boolean
}

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
  removeLocalPlaylistSong,
  searchQuery,
  songs,
  title,
  isLocalPlaylistCollection,
  userStore
} = useHomeCollectionPanel(toRef(props, 'collection'))

const contextMenuRef = ref<HTMLElement | null>(null)
const songContextMenu = ref<CollectionSongContextMenuState>({
  clientX: 0,
  clientY: 0,
  song: null,
  visible: false
})

const contextMenuStyle = computed(() => ({
  left: `${songContextMenu.value.clientX}px`,
  top: `${songContextMenu.value.clientY}px`
}))

const countLabel = computed(() => {
  if (isLocalPlaylistCollection.value) {
    return `${songs.value.length} 首歌曲`
  }

  const trackCount = props.collection?.trackCount
  if (trackCount && trackCount > songs.value.length) {
    return `${songs.value.length} / ${trackCount} 首歌曲`
  }
  return `${songs.value.length} 首歌曲`
})

const songTabCount = computed(() =>
  isLocalPlaylistCollection.value
    ? songs.value.length
    : (props.collection?.trackCount ?? songs.value.length)
)

function closeSongContextMenu(): void {
  songContextMenu.value.visible = false
  songContextMenu.value.song = null
}

function clampContextMenuPosition(): void {
  if (typeof window === 'undefined' || !contextMenuRef.value) {
    return
  }

  const rect = contextMenuRef.value.getBoundingClientRect()
  const padding = 8
  const maxLeft = Math.max(padding, window.innerWidth - rect.width - padding)
  const maxTop = Math.max(padding, window.innerHeight - rect.height - padding)

  songContextMenu.value.clientX = Math.min(songContextMenu.value.clientX, maxLeft)
  songContextMenu.value.clientY = Math.min(songContextMenu.value.clientY, maxTop)
}

function openSongContextMenu(payload: CollectionSongContextMenuPayload): void {
  if (!isLocalPlaylistCollection.value) {
    return
  }

  songContextMenu.value = {
    clientX: payload.clientX,
    clientY: payload.clientY,
    song: payload.song,
    visible: true
  }

  void nextTick(clampContextMenuPosition)
}

function handleRemoveLocalPlaylistSong(): void {
  const song = songContextMenu.value.song
  if (!song) {
    closeSongContextMenu()
    return
  }

  removeLocalPlaylistSong(song)
  closeSongContextMenu()
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!songContextMenu.value.visible) {
    return
  }

  const target = event.target
  if (target instanceof Node && contextMenuRef.value?.contains(target)) {
    return
  }

  closeSongContextMenu()
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeSongContextMenu()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  document.removeEventListener('keydown', handleDocumentKeydown)
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
          <button type="button" class="subtab active">歌曲 {{ songTabCount }}</button>
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
      @song-context-menu="openSongContextMenu"
      @load-more="loadMoreCollectionSongs"
      @retry="loadCollectionSongs"
    />

    <div
      v-if="songContextMenu.visible"
      ref="contextMenuRef"
      class="collection-song-context-menu"
      :style="contextMenuStyle"
      role="menu"
      aria-label="本地歌单歌曲菜单"
    >
      <button
        type="button"
        class="collection-menu-item collection-menu-remove-song"
        role="menuitem"
        @click="handleRemoveLocalPlaylistSong"
      >
        从本地歌单移除
      </button>
    </div>
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

.collection-song-context-menu {
  position: fixed;
  z-index: 80;
  min-width: 168px;
  max-width: min(280px, calc(100vw - 16px));
  padding: 6px;
  border: 1px solid rgba(17, 24, 39, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 44px rgba(17, 24, 39, 0.18);
  backdrop-filter: blur(12px);
}

.collection-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--black);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.collection-menu-item:hover,
.collection-menu-item:focus-visible {
  background: rgba(255, 66, 89, 0.1);
  color: var(--accent);
  outline: none;
}
</style>
