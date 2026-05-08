<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

import {
  HOME_SIDEBAR_EXPLORE_ITEMS,
  HOME_SIDEBAR_LIBRARY_ITEMS
} from '@/features/home/components/homeSidebar.constants'
import { useProjectUi } from '@/composables/useProjectUi'
import { useHomeSidebarCollections } from '@/features/home/composables/useHomeSidebarCollections'
import { useToastStore } from '@/store/toastStore'
import { readLocalPlaylistCoverFile } from '@/utils/localPlaylistCoverImage'

import HomeBrandBadge from './HomeBrandBadge.vue'
import HomeSidebarFooter from './HomeSidebarFooter.vue'
import HomeSidebarNavSection from './HomeSidebarNavSection.vue'
import HomeSidebarPlaylistContextMenu from './HomeSidebarPlaylistContextMenu.vue'
import HomeSidebarPlaylistsSection from './HomeSidebarPlaylistsSection.vue'
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
const playlistContextMenuRef = ref<{ $el: HTMLElement } | null>(null)
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
  const menuElement = playlistContextMenuRef.value?.$el
  if (typeof window === 'undefined' || !menuElement) {
    return
  }

  const rect = menuElement.getBoundingClientRect()
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
  if (target instanceof Node && playlistContextMenuRef.value?.$el.contains(target)) {
    return
  }

  closePlaylistContextMenu()
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closePlaylistContextMenu()
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
  <aside
    class="sidebar-shell"
    data-ui="sidebar"
    :class="[`is-${renderStyle}`, { 'is-collapsed': props.collapsed }]"
    aria-label="主侧边栏"
  >
    <div class="sidebar-scroll">
      <header v-if="props.showBrand" class="sidebar-brand">
        <HomeBrandBadge placement="sidebar" :icon-only="props.collapsed" />
      </header>

      <HomeSidebarNavSection
        title="探索"
        title-id="sidebar-explore-title"
        :collapsed="props.collapsed"
        :items="HOME_SIDEBAR_EXPLORE_ITEMS"
        :is-active="isActive"
        @select="activateItem"
      />

      <HomeSidebarNavSection
        title="资料库"
        title-id="sidebar-library-title"
        :collapsed="props.collapsed"
        :items="HOME_SIDEBAR_LIBRARY_ITEMS"
        :is-active="isActive"
        muted
        @select="activateItem"
      />

      <HomeSidebarPlaylistsSection
        :collapsed="props.collapsed"
        :active-playlist-filter="activePlaylistFilter"
        :empty-message="playlistEmptyMessage"
        :visible-collections="visibleCollections"
        :is-active="isActive"
        :resolve-collection-cover-label="resolveCollectionCoverLabel"
        :resolve-collection-tone="resolveCollectionTone"
        @select-filter="selectPlaylistFilter"
        @select-collection="activateCollection"
        @open-context-menu="openPlaylistContextMenu"
      />
    </div>

    <HomeSidebarPlaylistContextMenu
      v-if="playlistContextMenu.visible"
      ref="playlistContextMenuRef"
      :collection="playlistContextMenu.collection"
      :menu-style="playlistContextMenuStyle"
      @choose-cover="choosePlaylistCover"
      @clear-cover="clearSelectedLocalPlaylistCover"
      @remove="deleteSelectedLocalPlaylist"
    />

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

.sidebar-shell.is-collapsed .sidebar-brand {
  display: flex;
  justify-content: center;
}

@media (max-width: 960px) {
  .sidebar-scroll {
    padding-inline: 10px;
  }
}
</style>
