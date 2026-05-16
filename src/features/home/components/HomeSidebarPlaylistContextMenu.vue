<script setup lang="ts">
import type { HomeSidebarCollectionSelection } from './homeSidebar.types'

defineProps<{
  collection: HomeSidebarCollectionSelection | null
  menuStyle: Record<string, string>
}>()

const emit = defineEmits<{
  'choose-cover': []
  'clear-cover': []
  remove: []
}>()
</script>

<template>
  <div class="playlist-context-menu" :style="menuStyle" role="menu" aria-label="本地歌单菜单">
    <button
      type="button"
      class="playlist-context-menu-item playlist-context-menu-cover"
      role="menuitem"
      @click="emit('choose-cover')"
    >
      自定义封面
    </button>
    <button
      v-if="collection?.hasCustomCover"
      type="button"
      class="playlist-context-menu-item playlist-context-menu-reset-cover"
      role="menuitem"
      @click="emit('clear-cover')"
    >
      恢复默认封面
    </button>
    <button
      type="button"
      class="playlist-context-menu-item playlist-context-menu-remove"
      role="menuitem"
      @click="emit('remove')"
    >
      删除本地歌单
    </button>
  </div>
</template>

<style scoped>
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
</style>
