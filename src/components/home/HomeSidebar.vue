<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

import {
  HOME_SIDEBAR_EXPLORE_ITEMS,
  HOME_SIDEBAR_LIBRARY_ITEMS
} from '@/components/home/homeSidebar.constants'
import { useProjectUi } from '@/composables/useProjectUi'
import { useHomeSidebarCollections } from '@/composables/useHomeSidebarCollections'
import { useToastStore } from '@/store/toastStore'
import { readLocalPlaylistCoverFile } from '@/utils/localPlaylistCoverImage'

import HomeBrandBadge from './HomeBrandBadge.vue'
import HomeSidebarFooter from './HomeSidebarFooter.vue'
import HomeSidebarIcon from './HomeSidebarIcon.vue'
import type { HomeSidebarCollectionSelection } from './homeSidebar.types'

type PlaylistContextMenuState = {
  clientX: number
  clientY: number
  collection: HomeSidebarCollectionSelection | null
  visible: boolean
}

const props = withDefaults(
  defineProps<{
    activeItemId?: string | null
    collapsed?: boolean
    showBrand?: boolean
  }>(),
  {
    activeItemId: undefined,
    collapsed: false,
    showBrand: true
  }
)

const emit = defineEmits<{
  'collection-select': [selection: HomeSidebarCollectionSelection]
  'item-select': [itemId: string]
}>()

const internalActiveItemId = ref<string>('home')
const { renderStyle } = useProjectUi()
const toastStore = useToastStore()
const {
  activePlaylistFilter,
  clearLocalPlaylistCustomCover,
  emptyMessage: playlistEmptyMessage,
  removeLocalPlaylist,
  resolveCollectionCoverLabel,
  resolveCollectionTone,
  selectPlaylistFilter,
  setLocalPlaylistCustomCover,
  visibleCollections
} = useHomeSidebarCollections()
const resolvedActiveItemId = computed(() =>
  props.activeItemId === null ? null : (props.activeItemId ?? internalActiveItemId.value)
)
const playlistCoverInputRef = ref<HTMLInputElement | null>(null)
const playlistCoverTarget = ref<HomeSidebarCollectionSelection | null>(null)
const playlistContextMenuRef = ref<HTMLElement | null>(null)
const playlistContextMenu = ref<PlaylistContextMenuState>({
  clientX: 0,
  clientY: 0,
  collection: null,
  visible: false
})
const playlistContextMenuStyle = computed(() => ({
  left: `${playlistContextMenu.value.clientX}px`,
  top: `${playlistContextMenu.value.clientY}px`
}))

function activateItem(itemId: string): void {
  if (props.activeItemId === undefined) {
    internalActiveItemId.value = itemId
  }

  emit('item-select', itemId)
}

function activateCollection(item: HomeSidebarCollectionSelection): void {
  activateItem(item.uiId)
  emit('collection-select', item)
}

function activateSettings(): void {
  activateItem('settings')
}

function isActive(itemId: string): boolean {
  return resolvedActiveItemId.value === itemId
}

function closePlaylistContextMenu(): void {
  playlistContextMenu.value.visible = false
  playlistContextMenu.value.collection = null
}

function clampPlaylistContextMenuPosition(): void {
  if (typeof window === 'undefined' || !playlistContextMenuRef.value) {
    return
  }

  const rect = playlistContextMenuRef.value.getBoundingClientRect()
  const padding = 8
  const maxLeft = Math.max(padding, window.innerWidth - rect.width - padding)
  const maxTop = Math.max(padding, window.innerHeight - rect.height - padding)

  playlistContextMenu.value.clientX = Math.min(playlistContextMenu.value.clientX, maxLeft)
  playlistContextMenu.value.clientY = Math.min(playlistContextMenu.value.clientY, maxTop)
}

function openPlaylistContextMenu(event: MouseEvent, item: HomeSidebarCollectionSelection): void {
  if (item.kind !== 'localPlaylist') {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  playlistContextMenu.value = {
    clientX: event.clientX,
    clientY: event.clientY,
    collection: item,
    visible: true
  }

  void nextTick(clampPlaylistContextMenuPosition)
}

function deleteSelectedLocalPlaylist(): void {
  const collection = playlistContextMenu.value.collection
  if (!collection) {
    closePlaylistContextMenu()
    return
  }

  const wasActive = isActive(collection.uiId)
  const removed = removeLocalPlaylist(collection)
  closePlaylistContextMenu()

  if (removed && wasActive) {
    activateItem('local')
  }
}

function choosePlaylistCover(): void {
  const collection = playlistContextMenu.value.collection
  if (!collection) {
    closePlaylistContextMenu()
    return
  }

  playlistCoverTarget.value = collection
  closePlaylistContextMenu()

  if (playlistCoverInputRef.value) {
    playlistCoverInputRef.value.value = ''
    playlistCoverInputRef.value.click()
  }
}

async function handlePlaylistCoverInputChange(event: Event): Promise<void> {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) {
    return
  }

  const file = input.files?.[0]
  const collection = playlistCoverTarget.value
  playlistCoverTarget.value = null
  input.value = ''

  if (!file || !collection) {
    return
  }

  try {
    const coverUrl = await readLocalPlaylistCoverFile(file)
    const updated = setLocalPlaylistCustomCover(collection, coverUrl)
    if (!updated) {
      toastStore.error('设置本地歌单封面失败')
      return
    }

    toastStore.success(`已更新本地歌单「${collection.name}」封面`)
  } catch (error) {
    toastStore.error(error instanceof Error ? error.message : '设置本地歌单封面失败')
  }
}

function clearSelectedLocalPlaylistCover(): void {
  const collection = playlistContextMenu.value.collection
  if (!collection) {
    closePlaylistContextMenu()
    return
  }

  const cleared = clearLocalPlaylistCustomCover(collection)
  closePlaylistContextMenu()

  if (!cleared) {
    toastStore.error('恢复默认封面失败')
    return
  }

  toastStore.success(`已恢复「${collection.name}」默认封面`)
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!playlistContextMenu.value.visible) {
    return
  }

  const target = event.target
  if (target instanceof Node && playlistContextMenuRef.value?.contains(target)) {
    return
  }

  closePlaylistContextMenu()
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closePlaylistContextMenu()
  }
}

function resolveCollectionImageLoading(index: number): 'eager' | 'lazy' {
  return index === 0 ? 'eager' : 'lazy'
}

function resolveCollectionImageFetchPriority(index: number): 'high' | 'auto' {
  return index === 0 ? 'high' : 'auto'
}

function resolveCollectionImageDecoding(index: number): 'sync' | 'async' {
  return index === 0 ? 'sync' : 'async'
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
  <aside
    class="sidebar-shell"
    :class="[`is-${renderStyle}`, { 'is-collapsed': props.collapsed }]"
    aria-label="主侧边栏"
  >
    <div class="sidebar-scroll">
      <header v-if="props.showBrand" class="sidebar-brand">
        <HomeBrandBadge placement="sidebar" :icon-only="props.collapsed" />
      </header>

      <section
        class="sidebar-section"
        :aria-labelledby="!props.collapsed ? 'sidebar-explore-title' : undefined"
        :aria-label="props.collapsed ? '探索' : undefined"
      >
        <p v-if="!props.collapsed" id="sidebar-explore-title" class="section-title">探索</p>
        <button
          v-for="item in HOME_SIDEBAR_EXPLORE_ITEMS"
          :key="item.id"
          type="button"
          class="sidebar-link"
          :class="{ active: isActive(item.id) }"
          :aria-current="isActive(item.id) ? 'page' : undefined"
          :aria-label="item.label"
          @click="activateItem(item.id)"
        >
          <span class="sidebar-icon" aria-hidden="true"><HomeSidebarIcon :icon="item.icon" /></span>
          <span v-if="!props.collapsed" class="sidebar-label">{{ item.label }}</span>
        </button>
      </section>

      <section
        class="sidebar-section"
        :aria-labelledby="!props.collapsed ? 'sidebar-library-title' : undefined"
        :aria-label="props.collapsed ? '资料库' : undefined"
      >
        <p v-if="!props.collapsed" id="sidebar-library-title" class="section-title">资料库</p>
        <button
          v-for="item in HOME_SIDEBAR_LIBRARY_ITEMS"
          :key="item.id"
          type="button"
          class="sidebar-link sidebar-link-muted"
          :class="{ active: isActive(item.id) }"
          :aria-current="isActive(item.id) ? 'page' : undefined"
          :aria-label="item.label"
          @click="activateItem(item.id)"
        >
          <span class="sidebar-icon" aria-hidden="true"><HomeSidebarIcon :icon="item.icon" /></span>
          <span v-if="!props.collapsed" class="sidebar-label">{{ item.label }}</span>
        </button>
      </section>

      <section
        class="sidebar-section"
        :aria-labelledby="!props.collapsed ? 'sidebar-playlists-title' : undefined"
        :aria-label="props.collapsed ? '歌单' : undefined"
      >
        <p v-if="!props.collapsed" id="sidebar-playlists-title" class="section-title">歌单</p>

        <div v-if="!props.collapsed" class="playlist-filters" role="tablist" aria-label="歌单分组">
          <button
            type="button"
            class="playlist-filter"
            :class="{ active: activePlaylistFilter === 'created' }"
            :aria-pressed="activePlaylistFilter === 'created'"
            @click="selectPlaylistFilter('created')"
          >
            我的歌单
          </button>
          <button
            type="button"
            class="playlist-filter"
            :class="{ active: activePlaylistFilter === 'favorites' }"
            :aria-pressed="activePlaylistFilter === 'favorites'"
            @click="selectPlaylistFilter('favorites')"
          >
            收藏歌单
          </button>
        </div>

        <div class="playlist-list">
          <p
            v-if="!props.collapsed && visibleCollections.length === 0"
            class="playlist-empty-state"
            aria-live="polite"
          >
            {{ playlistEmptyMessage }}
          </p>

          <button
            v-for="(item, index) in visibleCollections"
            :key="item.uiId"
            type="button"
            class="playlist-card"
            :class="{ active: isActive(item.uiId) }"
            :aria-label="item.name"
            @click="activateCollection(item)"
            @contextmenu="openPlaylistContextMenu($event, item)"
          >
            <span
              class="playlist-cover"
              :class="`tone-${resolveCollectionTone(item.uiId)}`"
              aria-hidden="true"
            >
              <img
                v-if="item.coverUrl"
                :src="item.coverUrl"
                :alt="item.name"
                class="playlist-cover-image"
                width="54"
                height="54"
                :loading="resolveCollectionImageLoading(index)"
                :fetchpriority="resolveCollectionImageFetchPriority(index)"
                :decoding="resolveCollectionImageDecoding(index)"
              />
              <template v-else>
                <span class="playlist-cover-glow"></span>
                <span class="playlist-cover-disc"></span>
                <span class="playlist-cover-bars">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
                <span class="playlist-cover-label">{{ resolveCollectionCoverLabel(item) }}</span>
              </template>
            </span>
            <span v-if="!props.collapsed" class="playlist-copy">
              <strong>{{ item.name }}</strong>
              <span>{{ item.summary }}</span>
            </span>
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="playlistContextMenu.visible"
      ref="playlistContextMenuRef"
      class="playlist-context-menu"
      :style="playlistContextMenuStyle"
      role="menu"
      aria-label="本地歌单菜单"
    >
      <button
        type="button"
        class="playlist-context-menu-item playlist-context-menu-cover"
        role="menuitem"
        @click="choosePlaylistCover"
      >
        自定义封面
      </button>
      <button
        v-if="playlistContextMenu.collection?.hasCustomCover"
        type="button"
        class="playlist-context-menu-item playlist-context-menu-reset-cover"
        role="menuitem"
        @click="clearSelectedLocalPlaylistCover"
      >
        恢复默认封面
      </button>
      <button
        type="button"
        class="playlist-context-menu-item playlist-context-menu-remove"
        role="menuitem"
        @click="deleteSelectedLocalPlaylist"
      >
        删除本地歌单
      </button>
    </div>

    <input
      ref="playlistCoverInputRef"
      class="playlist-cover-file-input"
      type="file"
      accept="image/*"
      tabindex="-1"
      aria-hidden="true"
      @change="handlePlaylistCoverInputChange"
    />

    <footer class="sidebar-footer">
      <HomeSidebarFooter
        :collapsed="props.collapsed"
        :settings-active="isActive('settings')"
        @open-settings="activateSettings"
      />
    </footer>
  </aside>
</template>

<style scoped>
.sidebar-shell {
  margin: var(--sidebar-shell-margin, 0);
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: var(--sidebar-shell-border, 0);
  border-right: var(--sidebar-shell-divider, var(--ui-divider));
  border-radius: var(--sidebar-shell-radius, 0);
  background:
    radial-gradient(circle at top left, var(--sidebar-shell-glow), transparent 28%),
    var(--sidebar-shell-bg);
  box-shadow: var(--sidebar-shell-shadow, none);
  overflow: hidden;
}

.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 18px 14px 14px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.sidebar-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.sidebar-brand {
  margin-bottom: 18px;
}

.sidebar-section + .sidebar-section {
  margin-top: 22px;
}

.section-title {
  margin: 0 0 10px;
  padding-left: 6px;
  font-size: 14px;
  font-weight: 800;
  color: var(--gray-light);
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--sidebar-link-radius);
  background: transparent;
  color: var(--black);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.sidebar-link:hover {
  background: var(--sidebar-link-hover-bg);
  transform: translateX(2px);
}

.sidebar-link.active {
  background: var(--sidebar-active-bg);
  color: var(--sidebar-active-text, var(--white));
  box-shadow: var(--sidebar-active-shadow);
}

.sidebar-link-muted {
  color: var(--gray);
}

.sidebar-link-muted.active {
  color: var(--sidebar-active-text, var(--white));
}

.sidebar-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.sidebar-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sidebar-label {
  min-width: 0;
  flex: 1;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
}

.playlist-filters {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.playlist-filter {
  padding: 8px 14px;
  border: 0;
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--gray);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.playlist-filter:hover {
  transform: translateY(-1px);
}

.playlist-filter.active {
  background: var(--sidebar-active-bg);
  color: var(--white);
}

.playlist-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.playlist-empty-state {
  margin: 0;
  padding: 14px 12px;
  border-radius: calc(var(--sidebar-link-radius) + 4px);
  background: var(--surface-muted);
  color: var(--gray);
  font-size: 13px;
  font-weight: 600;
}

.playlist-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 6px 4px;
  border: 0;
  border-radius: calc(var(--sidebar-link-radius) + 4px);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.18s ease,
    transform 0.18s ease;
}

.playlist-card:hover {
  background: var(--sidebar-link-hover-bg);
  transform: translateX(2px);
}

.playlist-card.active {
  background: color-mix(in srgb, var(--sidebar-link-hover-bg) 70%, transparent);
}

.playlist-cover {
  position: relative;
  width: 54px;
  height: 54px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: var(--white);
  background: var(--playlist-cover-bg);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.16),
    inset 0 -16px 28px rgba(0, 0, 0, 0.18);
}

.playlist-cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.playlist-cover-glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 18% 16%, rgba(255, 255, 255, 0.34), transparent 28%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.14), transparent 44%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(0, 0, 0, 0.2));
}

.playlist-cover-disc {
  position: absolute;
  right: -9px;
  bottom: -7px;
  width: 43px;
  height: 43px;
  border-radius: 999px;
  background:
    repeating-radial-gradient(
      circle,
      transparent 0 4px,
      rgba(0, 0, 0, 0.1) 4px 5px,
      transparent 5px 9px
    ),
    radial-gradient(
      circle,
      var(--playlist-cover-accent) 0 4px,
      rgba(255, 255, 255, 0.92) 4.5px 7px,
      rgba(255, 255, 255, 0.24) 7.5px 9px,
      rgba(255, 255, 255, 0.82) 9.5px 100%
    );
  box-shadow: -8px -8px 18px rgba(0, 0, 0, 0.16);
}

.playlist-cover-disc::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: inherit;
}

.playlist-cover-bars {
  position: absolute;
  left: 11px;
  bottom: 10px;
  display: flex;
  align-items: end;
  gap: 3px;
}

.playlist-cover-bars span {
  width: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.16);
}

.playlist-cover-bars span:nth-child(1) {
  height: 12px;
}

.playlist-cover-bars span:nth-child(2) {
  height: 18px;
}

.playlist-cover-bars span:nth-child(3) {
  height: 9px;
}

.playlist-cover-label {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 2;
  min-width: 21px;
  height: 21px;
  padding: 0 5px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.16);
  box-shadow: 0 8px 14px rgba(0, 0, 0, 0.14);
  backdrop-filter: blur(8px);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0;
}

.tone-mono {
  --playlist-cover-bg: linear-gradient(135deg, #323946 0%, #11161f 100%);
  --playlist-cover-accent: #ffbf57;
}

.tone-violet {
  --playlist-cover-bg: linear-gradient(135deg, #7f5cf4 0%, #d9507f 100%);
  --playlist-cover-accent: #ffdf6e;
}

.tone-mist {
  --playlist-cover-bg: linear-gradient(135deg, #5d7189 0%, #28a89c 100%);
  --playlist-cover-accent: #ffd166;
}

.tone-ocean {
  --playlist-cover-bg: linear-gradient(135deg, #2f7cf6 0%, #19b6d2 100%);
  --playlist-cover-accent: #ff8f5a;
}

.playlist-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.playlist-copy strong,
.playlist-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-copy strong {
  font-size: 14px;
  font-weight: 800;
  color: var(--black);
}

.playlist-copy span {
  font-size: 12px;
  color: var(--gray);
}

.playlist-context-menu {
  position: fixed;
  z-index: 80;
  min-width: 148px;
  max-width: min(260px, calc(100vw - 16px));
  padding: 6px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  box-shadow: var(--ui-floating-shadow);
  backdrop-filter: blur(12px);
}

.playlist-context-menu-item {
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

.playlist-context-menu-item:hover,
.playlist-context-menu-item:focus-visible {
  background: var(--ui-hover-bg);
  color: var(--black);
  outline: none;
}

.playlist-context-menu-remove {
  margin-top: 4px;
  border-top: 1px solid var(--ui-border-subtle);
}

.playlist-context-menu-remove:hover,
.playlist-context-menu-remove:focus-visible {
  background: rgba(255, 66, 89, 0.1);
  color: var(--accent);
  outline: none;
}

.playlist-cover-file-input {
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.sidebar-footer {
  border-top: 1px solid var(--ui-border-subtle);
}

.sidebar-shell.is-collapsed .section-title,
.sidebar-shell.is-collapsed .playlist-filters,
.sidebar-shell.is-collapsed .playlist-copy {
  display: none;
}

.sidebar-shell.is-collapsed .sidebar-brand {
  display: flex;
  justify-content: center;
}

.sidebar-shell.is-collapsed .sidebar-link,
.sidebar-shell.is-collapsed .playlist-card {
  justify-content: center;
}

@media (max-width: 960px) {
  .sidebar-scroll {
    padding-inline: 10px;
  }
}
</style>
