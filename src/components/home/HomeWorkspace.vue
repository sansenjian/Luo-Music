<script setup lang="ts">
import { ref, watch } from 'vue'

import type { HomeTab } from '@/composables/useHomeShell'

import HomeTabBar from './HomeTabBar.vue'

const props = defineProps<{
  activeTab: HomeTab
}>()

const emit = defineEmits<{
  'change-tab': [tab: HomeTab]
}>()

const mountedPanels = ref<Record<HomeTab, boolean>>({
  lyric: props.activeTab === 'lyric',
  playlist: props.activeTab === 'playlist'
})

watch(
  () => props.activeTab,
  activeTab => {
    mountedPanels.value[activeTab] = true
  },
  { immediate: true }
)

function handleTabChange(tab: HomeTab): void {
  emit('change-tab', tab)
}
</script>

<template>
  <section class="right-panel">
    <HomeTabBar :active-tab="props.activeTab" @change-tab="handleTabChange" />

    <div class="content-area">
      <div
        v-if="mountedPanels.lyric"
        id="home-panel-lyric"
        v-show="props.activeTab === 'lyric'"
        class="lyric-view"
        role="tabpanel"
        aria-labelledby="home-tab-lyric"
      >
        <slot name="lyric" />
      </div>
      <div
        v-if="mountedPanels.playlist"
        id="home-panel-playlist"
        v-show="props.activeTab === 'playlist'"
        class="playlist-view"
        role="tabpanel"
        aria-labelledby="home-tab-playlist"
      >
        <slot name="playlist" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.right-panel {
  margin: var(--workspace-panel-margin, 0);
  border: var(--workspace-panel-border, 0);
  border-radius: var(--workspace-panel-radius, 0);
  background: var(--workspace-panel-bg, var(--ui-panel-bg));
  box-shadow: var(--workspace-panel-shadow, none);
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
