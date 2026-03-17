<script setup lang="ts">
import type { HomeTab } from '../../composables/useHomeShell'

import HomeTabBar from './HomeTabBar.vue'

const props = defineProps<{
  activeTab: HomeTab
}>()

const emit = defineEmits<{
  'change-tab': [tab: HomeTab]
}>()

function handleTabChange(tab: HomeTab): void {
  emit('change-tab', tab)
}
</script>

<template>
  <section class="right-panel">
    <HomeTabBar :active-tab="props.activeTab" @change-tab="handleTabChange" />

    <div class="content-area">
      <div v-show="props.activeTab === 'lyric'" class="lyric-view">
        <slot name="lyric" />
      </div>
      <div v-show="props.activeTab === 'playlist'" class="playlist-view">
        <slot name="playlist" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.right-panel {
  background: var(--bg);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  min-width: 0;
}

.content-area {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
  -webkit-overflow-scrolling: touch;
}

.content-area > * {
  flex: 1;
  min-height: 0;
}

.lyric-view,
.playlist-view {
  min-height: 0;
}
</style>
