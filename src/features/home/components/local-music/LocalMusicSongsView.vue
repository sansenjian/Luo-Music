<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

import SongDetailList from '@/components/media/SongDetailList.vue'
import type { Song } from '@/platform/music/interface'
import type {
  LocalMusicEmptyStateModel,
  LocalMusicPlaylistOption
} from '@/features/home/composables/localMusic.types'

defineProps<{
  activeSongScopeLabel: string | null
  emptyState: LocalMusicEmptyStateModel
  footnoteSizeLabel: string
  hasMore: boolean
  localPlaylists: LocalMusicPlaylistOption[]
  pageLoading: boolean
  songs: Song[]
}>()

const emit = defineEmits<{
  'add-to-local-playlist': [song: Song, playlistId: string]
  'clear-scope': []
  'create-local-playlist': [song: Song, name: string]
  'load-more': []
  'play-song': [index: number]
}>()

type SongContextMenuPayload = {
  clientX: number
  clientY: number
  index: number
  song: Song
}

type SongContextMenuState = {
  clientX: number
  clientY: number
  song: Song | null
  visible: boolean
}

type LocalPlaylistDialogState = {
  name: string
  song: Song | null
  visible: boolean
}

const contextMenuRef = ref<HTMLElement | null>(null)
const playlistNameInputRef = ref<HTMLInputElement | null>(null)
const songContextMenu = ref<SongContextMenuState>({
  clientX: 0,
  clientY: 0,
  song: null,
  visible: false
})
const localPlaylistDialog = ref<LocalPlaylistDialogState>({
  name: '',
  song: null,
  visible: false
})

const contextMenuStyle = computed(() => ({
  left: `${songContextMenu.value.clientX}px`,
  top: `${songContextMenu.value.clientY}px`
}))

function closeSongContextMenu(): void {
  songContextMenu.value.visible = false
  songContextMenu.value.song = null
}

function closeLocalPlaylistDialog(): void {
  localPlaylistDialog.value.visible = false
  localPlaylistDialog.value.song = null
  localPlaylistDialog.value.name = ''
}

function resolveDefaultLocalPlaylistName(song: Song): string {
  return `${song.name || '本地音乐'}歌单`
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

function openSongContextMenu(payload: SongContextMenuPayload): void {
  songContextMenu.value = {
    clientX: payload.clientX,
    clientY: payload.clientY,
    song: payload.song,
    visible: true
  }

  void nextTick(clampContextMenuPosition)
}

function openLocalPlaylistDialog(): void {
  const song = songContextMenu.value.song
  if (!song) {
    closeSongContextMenu()
    return
  }

  localPlaylistDialog.value = {
    name: resolveDefaultLocalPlaylistName(song),
    song,
    visible: true
  }
  closeSongContextMenu()

  void nextTick(() => {
    playlistNameInputRef.value?.focus()
    playlistNameInputRef.value?.select()
  })
}

function addSongToLocalPlaylist(playlistId: string): void {
  const song = songContextMenu.value.song
  if (!song) {
    closeSongContextMenu()
    return
  }

  emit('add-to-local-playlist', song, playlistId)
  closeSongContextMenu()
}

function submitLocalPlaylistDialog(): void {
  const song = localPlaylistDialog.value.song
  if (!song) {
    closeLocalPlaylistDialog()
    return
  }

  const playlistName =
    localPlaylistDialog.value.name.trim() || resolveDefaultLocalPlaylistName(song)

  emit('create-local-playlist', song, playlistName)
  closeLocalPlaylistDialog()
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
    if (localPlaylistDialog.value.visible) {
      closeLocalPlaylistDialog()
      return
    }

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
    <div class="local-songs-table-shell">
      <div class="local-songs-table-head">
        <span class="col-index">#</span>
        <span class="col-title">标题</span>
        <span class="col-album">专辑</span>
        <span class="col-duration">时长</span>
      </div>

      <SongDetailList
        :songs="songs"
        fallback-cover=""
        variant="table"
        @play-song="$emit('play-song', $event)"
        @song-context-menu="openSongContextMenu"
      />

      <div
        v-if="songContextMenu.visible"
        ref="contextMenuRef"
        class="local-song-context-menu"
        :style="contextMenuStyle"
        role="menu"
        aria-label="本地音乐菜单"
      >
        <button
          type="button"
          class="local-menu-item local-menu-create-playlist"
          role="menuitem"
          @click="openLocalPlaylistDialog"
        >
          创建本地歌单
        </button>

        <template v-if="localPlaylists.length > 0">
          <div class="local-menu-divider" role="presentation"></div>
          <p class="local-menu-section-title">添加到已有歌单</p>
          <button
            v-for="playlist in localPlaylists"
            :key="playlist.id"
            type="button"
            class="local-menu-item local-menu-playlist-item"
            role="menuitem"
            @click="addSongToLocalPlaylist(playlist.id)"
          >
            <span>{{ playlist.name }}</span>
            <small>{{ playlist.songCount }} 首</small>
          </button>
        </template>
      </div>
    </div>

    <div
      v-if="localPlaylistDialog.visible"
      class="local-playlist-dialog-backdrop"
      @pointerdown.self="closeLocalPlaylistDialog"
    >
      <form class="local-playlist-dialog" @submit.prevent="submitLocalPlaylistDialog">
        <h3>创建本地歌单</h3>
        <label class="local-playlist-field">
          <span>歌单名称</span>
          <input
            ref="playlistNameInputRef"
            v-model="localPlaylistDialog.name"
            type="text"
            class="local-playlist-name-input"
            maxlength="48"
            autocomplete="off"
          />
        </label>
        <div class="local-playlist-dialog-actions">
          <button type="button" class="dialog-action" @click="closeLocalPlaylistDialog">
            取消
          </button>
          <button type="submit" class="dialog-action dialog-action-primary">创建</button>
        </div>
      </form>
    </div>

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

<style scoped>
.local-song-context-menu {
  position: fixed;
  z-index: 80;
  min-width: 168px;
  max-width: min(280px, calc(100vw - 16px));
  max-height: min(420px, calc(100vh - 16px));
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  box-shadow: var(--ui-floating-shadow);
  backdrop-filter: blur(12px);
}

.local-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--black);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.local-menu-item:hover,
.local-menu-item:focus-visible {
  background: var(--ui-hover-bg);
  outline: none;
}

.local-menu-divider {
  height: 1px;
  margin: 6px 2px;
  background: var(--ui-border-subtle);
}

.local-menu-section-title {
  margin: 0;
  padding: 6px 10px 4px;
  color: var(--gray);
  font-size: 12px;
  font-weight: 800;
}

.local-menu-playlist-item {
  justify-content: space-between;
  gap: 14px;
}

.local-menu-playlist-item span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-menu-playlist-item small {
  flex-shrink: 0;
  color: var(--gray);
  font-size: 12px;
  font-weight: 700;
}

.local-playlist-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 18px;
  background: var(--ui-overlay-bg);
}

.local-playlist-dialog {
  width: min(360px, 100%);
  padding: 18px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-card-radius);
  background: var(--ui-surface);
  box-shadow: var(--ui-floating-shadow);
}

.local-playlist-dialog h3 {
  margin: 0 0 14px;
  color: var(--black);
  font-size: 18px;
  font-weight: 800;
}

.local-playlist-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--gray);
  font-size: 13px;
  font-weight: 700;
}

.local-playlist-name-input {
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-control-radius);
  background: var(--ui-control-bg);
  color: var(--black);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
}

.local-playlist-name-input:focus {
  border-color: var(--ui-focus-border);
  outline: 2px solid var(--ui-border-subtle);
}

.local-playlist-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.dialog-action {
  min-height: 36px;
  padding: 8px 14px;
  border: 0;
  border-radius: var(--ui-control-radius);
  background: var(--ui-hover-bg);
  color: var(--black);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.dialog-action:hover,
.dialog-action:focus-visible {
  outline: none;
  transform: translateY(-1px);
}

.dialog-action-primary {
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
  box-shadow: var(--ui-primary-shadow);
}
</style>
