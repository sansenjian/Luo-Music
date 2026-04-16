<script setup lang="ts">
import { ref } from 'vue'

import { useRenderStyle } from '@/composables/useRenderStyle'

import HomeBrandBadge from './HomeBrandBadge.vue'

type SidebarNavItem = {
  id: string
  label: string
  icon: string
  helper?: string
  indicator?: string
}

const primaryItems: SidebarNavItem[] = [
  { id: 'recommend', label: '推荐', icon: 'R' },
  { id: 'curated', label: '精选', icon: 'C' },
  { id: 'podcast', label: '播客', icon: 'P' },
  { id: 'roaming', label: '漫游', icon: 'W' },
  { id: 'followed', label: '关注', icon: 'F', indicator: 'new' }
]

const libraryItems: SidebarNavItem[] = [
  { id: 'liked', label: '我喜欢的音乐', icon: 'L', helper: '99' },
  { id: 'history', label: '最近播放', icon: 'H' },
  { id: 'my-podcast', label: '我的播客', icon: 'B' },
  { id: 'favorites', label: '我的收藏', icon: 'S' },
  { id: 'downloads', label: '下载管理', icon: 'D' },
  { id: 'local', label: '本地音乐', icon: 'M' },
  { id: 'cloud', label: '我的音乐网盘', icon: 'C' }
]

const props = withDefaults(
  defineProps<{
    collapsed?: boolean
    showBrand?: boolean
  }>(),
  {
    collapsed: false,
    showBrand: true
  }
)

const activeItemId = ref<string>('recommend')
const { renderStyle } = useRenderStyle()

function activateItem(itemId: string): void {
  activeItemId.value = itemId
}

function isActive(itemId: string): boolean {
  return activeItemId.value === itemId
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

      <section class="sidebar-section" aria-label="发现">
        <button
          v-for="item in primaryItems"
          :key="item.id"
          type="button"
          class="sidebar-link"
          :class="{ active: isActive(item.id) }"
          :aria-current="isActive(item.id) ? 'page' : undefined"
          @click="activateItem(item.id)"
        >
          <span class="sidebar-icon" aria-hidden="true">{{ item.icon }}</span>
          <span v-if="!props.collapsed" class="sidebar-label">{{ item.label }}</span>
          <span v-if="!props.collapsed && item.indicator" class="sidebar-indicator">
            {{ item.indicator }}
          </span>
        </button>
      </section>

      <div class="sidebar-divider" aria-hidden="true"></div>

      <section class="sidebar-section" aria-label="我的">
        <p v-if="!props.collapsed" class="section-title">我的</p>
        <button
          v-for="item in libraryItems"
          :key="item.id"
          type="button"
          class="sidebar-link muted"
          :class="{ active: isActive(item.id) }"
          :aria-current="isActive(item.id) ? 'page' : undefined"
          @click="activateItem(item.id)"
        >
          <span class="sidebar-icon" aria-hidden="true">{{ item.icon }}</span>
          <span v-if="!props.collapsed" class="sidebar-label">{{ item.label }}</span>
          <span v-if="!props.collapsed && item.helper" class="sidebar-helper">
            {{ item.helper }}
          </span>
        </button>
      </section>

      <div class="sidebar-divider" aria-hidden="true"></div>

      <section class="sidebar-section" aria-label="歌单占位">
        <div class="section-header">
          <p v-if="!props.collapsed" class="section-title">收藏</p>
          <span v-if="!props.collapsed" class="section-note">Soon</span>
        </div>

        <button type="button" class="sidebar-link muted" @click="activateItem('recent-save')">
          <span class="sidebar-icon" aria-hidden="true">A</span>
          <span v-if="!props.collapsed" class="sidebar-label">最近加入</span>
        </button>

        <div class="section-header playlists-header">
          <p v-if="!props.collapsed" class="section-title">创建的歌单 1</p>
          <button type="button" class="ghost-action" aria-label="添加歌单">+</button>
        </div>

        <button
          type="button"
          class="playlist-card"
          :class="{ active: isActive('local-playlist') }"
          @click="activateItem('local-playlist')"
        >
          <span class="playlist-art" aria-hidden="true">LP</span>
          <span v-if="!props.collapsed" class="playlist-copy">
            <strong>sansenjian 的本地音乐歌单</strong>
            <span>侧边栏占位示例</span>
          </span>
        </button>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-shell {
  min-height: 0;
  border-right: 3px solid var(--black);
  background:
    radial-gradient(circle at top left, var(--sidebar-shell-glow), transparent 28%),
    var(--sidebar-shell-bg);
  overflow: hidden;
}

.sidebar-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 18px 16px 24px;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-title {
  margin: 0 0 8px;
  padding-left: 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8c92a2;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.section-note {
  border: 1px solid var(--sidebar-note-border);
  border-radius: 999px;
  padding: 3px 8px;
  background: var(--sidebar-note-bg);
  font-size: 10px;
  font-weight: 700;
  color: var(--sidebar-note-text);
}

.playlists-header {
  margin-top: 8px;
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 12px;
  border: 0;
  border-radius: var(--sidebar-link-radius);
  background: transparent;
  color: var(--black);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    color 0.18s ease;
}

.sidebar-link:hover {
  background: var(--sidebar-link-hover-bg);
  transform: translateX(2px);
}

.sidebar-link.active {
  background: var(--sidebar-active-bg);
  color: #fff;
  box-shadow: var(--sidebar-active-shadow);
}

.sidebar-link.muted {
  color: #4f5668;
}

.sidebar-link.muted.active {
  color: #fff;
}

.sidebar-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--sidebar-icon-bg);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.sidebar-link.active .sidebar-icon {
  background: var(--sidebar-icon-active-bg);
}

.sidebar-label {
  min-width: 0;
  flex: 1;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}

.sidebar-indicator,
.sidebar-helper {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.sidebar-indicator {
  border-radius: 999px;
  padding: 3px 7px;
  background: rgba(255, 255, 255, 0.16);
  text-transform: uppercase;
}

.sidebar-helper {
  color: rgba(17, 24, 39, 0.45);
}

.sidebar-link.active .sidebar-helper {
  color: rgba(255, 255, 255, 0.74);
}

.sidebar-shell.is-collapsed .sidebar-brand {
  justify-content: center;
}

.sidebar-shell.is-collapsed .sidebar-label,
.sidebar-shell.is-collapsed .sidebar-helper,
.sidebar-shell.is-collapsed .sidebar-indicator,
.sidebar-shell.is-collapsed .section-note,
.sidebar-shell.is-collapsed .playlist-copy {
  display: none;
}

.sidebar-shell.is-collapsed .section-title {
  padding-left: 0;
  text-align: center;
}

.sidebar-shell.is-collapsed .sidebar-link,
.sidebar-shell.is-collapsed .playlist-card {
  justify-content: center;
  padding-inline: 10px;
}

.sidebar-shell.is-collapsed .section-header {
  justify-content: center;
}

.sidebar-shell.is-classic {
  background: var(--white);
}

.sidebar-shell.is-classic .sidebar-scroll {
  padding: 0 0 12px;
}

.sidebar-shell.is-classic .sidebar-brand {
  margin-bottom: 8px;
  padding: 12px 10px 8px;
  border-bottom: 2px solid var(--black);
}

.sidebar-shell.is-classic .section-title {
  margin-bottom: 8px;
  padding-left: 10px;
  padding-bottom: 6px;
  border-bottom: 2px solid var(--black);
  color: var(--gray);
}

.sidebar-shell.is-classic .sidebar-link {
  padding: 12px;
  border: 2px solid transparent;
  border-radius: 0;
  box-shadow: none;
  width: 100%;
  margin-inline: 0;
}

.sidebar-shell.is-classic .sidebar-link:hover {
  transform: none;
  border-color: rgba(17, 24, 39, 0.14);
}

.sidebar-shell.is-classic .sidebar-link.active {
  border-color: var(--black);
  box-shadow: none;
}

.sidebar-shell.is-classic .sidebar-icon {
  border-radius: 0;
  background: #e2e4e8;
}

.sidebar-shell.is-classic .sidebar-link.active .sidebar-icon {
  background: rgba(255, 255, 255, 0.14);
}

.sidebar-shell.is-classic .sidebar-indicator {
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  padding: 0;
  border-radius: 0;
}

.sidebar-shell.is-classic .section-note {
  border: 2px solid var(--black);
  border-radius: 0;
  background: var(--white);
  padding: 2px 6px;
  letter-spacing: 0.08em;
}

.sidebar-shell.is-classic .ghost-action {
  border: 2px solid var(--black);
  border-radius: 0;
  background: var(--white);
  color: var(--black);
}

.sidebar-shell.is-classic .playlist-card {
  border: 2px solid rgba(17, 24, 39, 0.14);
  border-radius: 0;
  box-shadow: none;
  background: var(--white);
  transform: none;
  width: 100%;
  margin-inline: 0;
}

.sidebar-shell.is-classic .playlist-card.active {
  background: var(--black);
  border-color: var(--black);
  box-shadow: none;
}

.sidebar-shell.is-classic .playlist-card.active .playlist-art {
  background: rgba(255, 255, 255, 0.12);
  color: var(--white);
}

.sidebar-shell.is-classic .playlist-card.active .playlist-copy strong,
.sidebar-shell.is-classic .playlist-card.active .playlist-copy span {
  color: var(--white);
}

.sidebar-shell.is-classic .playlist-art {
  border: 2px solid rgba(17, 24, 39, 0.12);
  border-radius: 0;
  background: #eceff3;
}

.sidebar-shell.is-classic .sidebar-divider {
  margin: 12px 10px;
  background: rgba(17, 24, 39, 0.14);
}

.sidebar-divider {
  height: 1px;
  margin: 18px 4px;
  background: linear-gradient(90deg, transparent, rgba(17, 24, 39, 0.14), transparent);
}

.ghost-action {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 10px;
  background: var(--surface-muted);
  color: #6a7285;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.playlist-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin-top: 10px;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 18px;
  background: var(--surface-soft);
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.playlist-card:hover {
  transform: translateY(-1px);
  border-color: rgba(17, 24, 39, 0.08);
  box-shadow: 0 12px 24px rgba(17, 24, 39, 0.08);
}

.playlist-card.active {
  border-color: var(--sidebar-card-active-border);
  box-shadow: var(--sidebar-card-active-shadow);
}

.playlist-art {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, rgba(17, 24, 39, 0.12), rgba(17, 24, 39, 0.04));
  font-size: 12px;
  font-weight: 800;
  color: #596177;
  letter-spacing: 0.08em;
}

.playlist-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.playlist-copy strong,
.playlist-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-copy strong {
  font-size: 13px;
  font-weight: 800;
  color: var(--black);
  white-space: normal;
  line-height: 1.35;
}

.playlist-copy span {
  font-size: 11px;
  color: #7d8598;
  white-space: nowrap;
}

@media (max-width: 1200px) {
  .sidebar-scroll {
    padding-inline: 12px;
  }
}

@media (max-width: 960px) {
  .sidebar-scroll {
    padding-inline: 10px;
  }
}
</style>
