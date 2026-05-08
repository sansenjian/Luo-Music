<script setup lang="ts">
import HomeSidebarPlaylistCard from './HomeSidebarPlaylistCard.vue'
import type {
  HomeSidebarCollectionSelection,
  HomeSidebarCollectionTone,
  HomeSidebarPlaylistFilter
} from './homeSidebar.types'

defineProps<{
  collapsed: boolean
  activePlaylistFilter: HomeSidebarPlaylistFilter
  emptyMessage: string
  visibleCollections: HomeSidebarCollectionSelection[]
  isActive: (itemId: string) => boolean
  resolveCollectionCoverLabel: (item: HomeSidebarCollectionSelection) => string
  resolveCollectionTone: (collectionId: string) => HomeSidebarCollectionTone
}>()

const emit = defineEmits<{
  'select-filter': [filter: HomeSidebarPlaylistFilter]
  'select-collection': [item: HomeSidebarCollectionSelection]
  'open-context-menu': [event: MouseEvent, item: HomeSidebarCollectionSelection]
}>()
</script>

<template>
  <section
    class="sidebar-section"
    :class="{ 'is-collapsed': collapsed, 'is-expanded': !collapsed }"
    :aria-labelledby="!collapsed ? 'sidebar-playlists-title' : undefined"
    :aria-label="collapsed ? '歌单' : undefined"
  >
    <p v-if="!collapsed" id="sidebar-playlists-title" class="section-title">歌单</p>

    <div v-if="!collapsed" class="playlist-filters" role="tablist" aria-label="歌单分组">
      <button
        type="button"
        class="playlist-filter"
        :class="{ active: activePlaylistFilter === 'created' }"
        :aria-pressed="activePlaylistFilter === 'created'"
        @click="emit('select-filter', 'created')"
      >
        我的歌单
      </button>
      <button
        type="button"
        class="playlist-filter"
        :class="{ active: activePlaylistFilter === 'favorites' }"
        :aria-pressed="activePlaylistFilter === 'favorites'"
        @click="emit('select-filter', 'favorites')"
      >
        收藏歌单
      </button>
    </div>

    <div class="playlist-list">
      <p
        v-if="!collapsed && visibleCollections.length === 0"
        class="playlist-empty-state"
        aria-live="polite"
      >
        {{ emptyMessage }}
      </p>

      <HomeSidebarPlaylistCard
        v-for="(item, index) in visibleCollections"
        :key="item.uiId"
        :item="item"
        :index="index"
        :collapsed="collapsed"
        :active="isActive(item.uiId)"
        :tone="resolveCollectionTone(item.uiId)"
        :cover-label="resolveCollectionCoverLabel(item)"
        @select="emit('select-collection', $event)"
        @open-context-menu="(event, collection) => emit('open-context-menu', event, collection)"
      />
    </div>
  </section>
</template>

<style scoped>
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

.sidebar-section.is-collapsed .section-title,
.sidebar-section.is-collapsed .playlist-filters {
  display: none;
}
</style>
