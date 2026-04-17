<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useFavoriteAlbums, type FavoriteAlbumItem } from '@/composables/useFavoriteAlbums'
import { useRenderStyle } from '@/composables/useRenderStyle'
import { useUserPlaylists, type PlaylistItem } from '@/composables/useUserPlaylists'
import { useUserStore } from '@/store/userStore'

import HomeBrandBadge from './HomeBrandBadge.vue'
import HomeSidebarFooter from './HomeSidebarFooter.vue'

type SidebarIconName =
  | 'home'
  | 'discover'
  | 'roaming'
  | 'liked'
  | 'history'
  | 'songs'
  | 'favorites'
  | 'artists'
  | 'local'
  | 'settings'

type SidebarNavItem = {
  id: string
  label: string
  icon: SidebarIconName
}

type SidebarPlaylistFilter = 'created' | 'favorites'
type SidebarCollectionKind = 'playlist' | 'album'
type SidebarCollectionItem = {
  uiId: string
  sourceId: string | number
  kind: SidebarCollectionKind
  name: string
  coverUrl: string
  summary: string
}

const exploreItems: SidebarNavItem[] = [
  { id: 'home', label: '主页', icon: 'home' },
  { id: 'discover', label: '发现', icon: 'discover' },
  { id: 'roaming', label: '漫游', icon: 'roaming' }
]

const libraryItems: SidebarNavItem[] = [
  { id: 'liked', label: '我喜欢的音乐', icon: 'liked' },
  { id: 'history', label: '最近播放', icon: 'history' },
  { id: 'songs', label: '歌曲', icon: 'songs' },
  { id: 'favorites', label: '收藏', icon: 'favorites' },
  { id: 'artists', label: '艺人', icon: 'artists' },
  { id: 'local', label: '本地音乐', icon: 'local' }
]

const iconMarkupMap: Record<SidebarIconName, string> = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M4 11.8 12 5l8 6.8V20a1 1 0 0 1-1 1h-4.8v-5.2H9.8V21H5a1 1 0 0 1-1-1z"/></svg>',
  discover:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5A8.5 8.5 0 0 0 12 3.5Zm2.9 5.6-1.8 5-5 1.8 1.8-5 5-1.8Z"/></svg>',
  roaming:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M3.8 15.8c2.1-2.5 4.7-3.8 7.8-3.8s5.7 1.3 7.8 3.8"/><path d="M7 10.4a5.2 5.2 0 0 1 10 0"/><circle cx="12" cy="17.2" r="1.1"/></svg>',
  liked:
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M12 20.2 5 13.6a4.4 4.4 0 0 1 6.2-6.2L12 8.2l.8-.8a4.4 4.4 0 0 1 6.2 6.2Z"/></svg>',
  history:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 4.2a7.8 7.8 0 1 1-6.7 3.8"/><path d="M5.3 4.8v4.4h4.4"/><path d="M12 8.2v4.2l2.8 1.8"/></svg>',
  songs:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M15.5 5.2v8.4a2.7 2.7 0 1 1-1.4-2.4V6.4l6-1.2v7.2a2.7 2.7 0 1 1-1.4-2.4V4Z"/></svg>',
  favorites:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M4.6 6.4h4l1.3 1.8h9.5a1 1 0 0 1 1 1V18a1.5 1.5 0 0 1-1.5 1.5H5.1A1.5 1.5 0 0 1 3.6 18V7.4a1 1 0 0 1 1-1Z"/></svg>',
  artists:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M8.1 11.2a2.5 2.5 0 1 0-2.5-2.5 2.5 2.5 0 0 0 2.5 2.5Zm7.8 0a2.5 2.5 0 1 0-2.5-2.5 2.5 2.5 0 0 0 2.5 2.5Z"/><path d="M3.9 18.8a4.2 4.2 0 0 1 8.4 0"/><path d="M11.7 18.8a4.2 4.2 0 0 1 8.4 0"/></svg>',
  local:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M5.2 6.2h13.6a1.2 1.2 0 0 1 1.2 1.2v9.2a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 16.6V7.4a1.2 1.2 0 0 1 1.2-1.2Z"/><path d="M8 18.8h8"/><path d="M8.6 11.6h6.8"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="m12 4.8 1 .6 1.5-.3.8 1.3 1.4.5v1.6l1 1-.7 1.4.4 1.4-1.3.8-.5 1.4h-1.6l-1 1-1.4-.7-1.4.4-.8-1.3-1.4-.5v-1.6l-1-1 .7-1.4-.4-1.4 1.3-.8.5-1.4h1.6l1-1Z"/><circle cx="12" cy="12" r="2.4"/></svg>'
}

const props = withDefaults(
  defineProps<{
    collapsed?: boolean
    showBrand?: boolean
    showFooter?: boolean
  }>(),
  {
    collapsed: false,
    showBrand: true,
    showFooter: true
  }
)

const activeItemId = ref<string>('home')
const activePlaylistFilter = ref<SidebarPlaylistFilter>('created')
const { renderStyle } = useRenderStyle()
const userStore = useUserStore()
const {
  createdPlaylists,
  favoritePlaylists,
  loading: playlistsLoading,
  loadPlaylists,
  resetPlaylists
} = useUserPlaylists()
const {
  albums: favoriteAlbums,
  loading: favoriteAlbumsLoading,
  loadFavoriteAlbums,
  resetFavoriteAlbums
} = useFavoriteAlbums()

const visibleCollections = computed<SidebarCollectionItem[]>(() =>
  activePlaylistFilter.value === 'created'
    ? createdPlaylists.value.map(playlist => mapPlaylistToCollectionItem(playlist))
    : [
        ...favoritePlaylists.value.map(playlist => mapPlaylistToCollectionItem(playlist)),
        ...favoriteAlbums.value.map(album => mapAlbumToCollectionItem(album))
      ]
)
const sidebarCollectionsLoading = computed(() =>
  activePlaylistFilter.value === 'created'
    ? playlistsLoading.value
    : playlistsLoading.value || favoriteAlbumsLoading.value
)
const playlistEmptyMessage = computed(() => {
  if (!userStore.isLoggedIn) {
    return '登录后查看歌单'
  }

  if (sidebarCollectionsLoading.value) {
    return activePlaylistFilter.value === 'created' ? '歌单加载中...' : '收藏加载中...'
  }

  return activePlaylistFilter.value === 'created' ? '暂无我的歌单' : '暂无收藏歌单'
})

watch(
  () => [userStore.isLoggedIn, userStore.userId] as const,
  ([isLoggedIn, userId]) => {
    if (isLoggedIn && userId !== null && userId !== undefined && userId !== '') {
      void loadPlaylists(userId)
      void loadFavoriteAlbums(userId)
      return
    }

    resetPlaylists()
    resetFavoriteAlbums()
  },
  { immediate: true }
)

function activateItem(itemId: string): void {
  activeItemId.value = itemId
}

function isActive(itemId: string): boolean {
  return activeItemId.value === itemId
}

function selectPlaylistFilter(filter: SidebarPlaylistFilter): void {
  activePlaylistFilter.value = filter
}

function resolveIconMarkup(iconName: SidebarIconName): string {
  return iconMarkupMap[iconName]
}

function mapPlaylistToCollectionItem(playlist: PlaylistItem): SidebarCollectionItem {
  return {
    uiId: `playlist:${playlist.id}`,
    sourceId: playlist.id,
    kind: 'playlist',
    name: playlist.name,
    coverUrl: typeof playlist.coverImgUrl === 'string' ? playlist.coverImgUrl : '',
    summary: resolvePlaylistSummary(playlist)
  }
}

function mapAlbumToCollectionItem(album: FavoriteAlbumItem): SidebarCollectionItem {
  return {
    uiId: `album:${album.id}`,
    sourceId: album.id,
    kind: 'album',
    name: album.name,
    coverUrl: album.picUrl,
    summary: resolveAlbumSummary(album)
  }
}

function resolvePlaylistSummary(playlist: PlaylistItem): string {
  const trackCount = Number(playlist.trackCount)
  if (Number.isFinite(trackCount) && trackCount > 0) {
    return `${trackCount} 首歌`
  }

  return '歌单'
}

function resolveAlbumSummary(album: FavoriteAlbumItem): string {
  const size = Number(album.size)
  if (album.artistName && Number.isFinite(size) && size > 0) {
    return `${album.artistName} · ${size} 首歌`
  }

  if (album.artistName) {
    return album.artistName
  }

  if (Number.isFinite(size) && size > 0) {
    return `${size} 首歌`
  }

  return '收藏'
}

function resolveCollectionCoverLabel(item: SidebarCollectionItem): string {
  return item.name.trim().charAt(0).toUpperCase() || '歌'
}

function resolveCollectionTone(collectionId: string): 'mono' | 'violet' | 'mist' | 'ocean' {
  const tones = ['mono', 'violet', 'mist', 'ocean'] as const
  let hash = 0

  for (const character of collectionId) {
    hash = (hash + character.charCodeAt(0)) % tones.length
  }

  return tones[hash]
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

      <section class="sidebar-section" aria-labelledby="sidebar-explore-title">
        <p v-if="!props.collapsed" id="sidebar-explore-title" class="section-title">探索</p>
        <button
          v-for="item in exploreItems"
          :key="item.id"
          type="button"
          class="sidebar-link"
          :class="{ active: isActive(item.id) }"
          :aria-current="isActive(item.id) ? 'page' : undefined"
          :aria-label="item.label"
          @click="activateItem(item.id)"
        >
          <span
            class="sidebar-icon"
            aria-hidden="true"
            v-html="resolveIconMarkup(item.icon)"
          ></span>
          <span v-if="!props.collapsed" class="sidebar-label">{{ item.label }}</span>
        </button>
      </section>

      <section class="sidebar-section" aria-labelledby="sidebar-library-title">
        <p v-if="!props.collapsed" id="sidebar-library-title" class="section-title">资料库</p>
        <button
          v-for="item in libraryItems"
          :key="item.id"
          type="button"
          class="sidebar-link sidebar-link-muted"
          :class="{ active: isActive(item.id) }"
          :aria-current="isActive(item.id) ? 'page' : undefined"
          :aria-label="item.label"
          @click="activateItem(item.id)"
        >
          <span
            class="sidebar-icon"
            aria-hidden="true"
            v-html="resolveIconMarkup(item.icon)"
          ></span>
          <span v-if="!props.collapsed" class="sidebar-label">{{ item.label }}</span>
        </button>
      </section>

      <section class="sidebar-section" aria-labelledby="sidebar-playlists-title">
        <p v-if="!props.collapsed" id="sidebar-playlists-title" class="section-title">歌单</p>

        <div v-if="!props.collapsed" class="playlist-filters" role="tablist" aria-label="歌单分组">
          <button
            type="button"
            class="playlist-filter"
            :class="{ active: activePlaylistFilter === 'created' }"
            aria-pressed="true"
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
            v-for="item in visibleCollections"
            :key="item.uiId"
            type="button"
            class="playlist-card"
            :class="{ active: isActive(item.uiId) }"
            :aria-label="item.name"
            @click="activateItem(item.uiId)"
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
                loading="lazy"
                decoding="async"
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

    <footer v-if="props.showFooter" class="sidebar-footer">
      <HomeSidebarFooter :collapsed="props.collapsed" />
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

.sidebar-icon,
.settings-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.sidebar-icon :deep(svg),
.settings-icon :deep(svg) {
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
