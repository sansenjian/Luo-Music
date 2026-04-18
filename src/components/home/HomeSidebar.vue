<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  HOME_SIDEBAR_EXPLORE_ITEMS,
  HOME_SIDEBAR_LIBRARY_ITEMS
} from '@/components/home/homeSidebar.constants'
import { useHomeSidebarCollections } from '@/composables/useHomeSidebarCollections'
import { useRenderStyle } from '@/composables/useRenderStyle'

import HomeBrandBadge from './HomeBrandBadge.vue'
import HomeSidebarFooter from './HomeSidebarFooter.vue'
import HomeSidebarIcon from './HomeSidebarIcon.vue'
import type { HomeSidebarCollectionSelection } from './homeSidebar.types'

const props = withDefaults(
  defineProps<{
    activeItemId?: string
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
const { renderStyle } = useRenderStyle()
const {
  activePlaylistFilter,
  emptyMessage: playlistEmptyMessage,
  resolveCollectionCoverLabel,
  resolveCollectionTone,
  selectPlaylistFilter,
  visibleCollections
} = useHomeSidebarCollections()
const resolvedActiveItemId = computed(() => props.activeItemId ?? internalActiveItemId.value)

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

function resolveCollectionImageLoading(index: number): 'eager' | 'lazy' {
  return index === 0 ? 'eager' : 'lazy'
}

function resolveCollectionImageFetchPriority(index: number): 'high' | 'auto' {
  return index === 0 ? 'high' : 'auto'
}

function resolveCollectionImageDecoding(index: number): 'sync' | 'async' {
  return index === 0 ? 'sync' : 'async'
}
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
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 3px solid var(--black);
  background:
    radial-gradient(circle at top left, var(--sidebar-shell-glow), transparent 28%),
    var(--sidebar-shell-bg);
  overflow: hidden;
}

.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 18px 14px 14px;
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
  color: var(--white);
  box-shadow: var(--sidebar-active-shadow);
}

.sidebar-link-muted {
  color: var(--gray);
}

.sidebar-link-muted.active {
  color: var(--white);
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
    radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.25), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(0, 0, 0, 0.18));
}

.playlist-cover-label {
  position: relative;
  z-index: 1;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.tone-mono {
  background: linear-gradient(135deg, #303744 0%, #11161f 100%);
}

.tone-violet {
  background: linear-gradient(135deg, #7c6ef7 0%, #5442b6 100%);
}

.tone-mist {
  background: linear-gradient(135deg, #8f9bb5 0%, #565f76 100%);
}

.tone-ocean {
  background: linear-gradient(135deg, #4d7cff 0%, #2740a3 100%);
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

.sidebar-footer {
  border-top: 1px solid var(--gray-lighter);
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
