<script setup lang="ts">
import type { HomeTab } from '@/composables/useHomeShell'
import { uiMessages } from '@/messages/ui'

const props = defineProps<{
  activeTab: HomeTab
}>()

const emit = defineEmits<{
  'change-tab': [tab: HomeTab]
}>()

function changeTab(tab: HomeTab): void {
  emit('change-tab', tab)
}
</script>

<template>
  <div class="panel-tabs" role="tablist" aria-label="Home panels">
    <button
      id="home-tab-lyric"
      class="tab"
      :class="{ active: props.activeTab === 'lyric' }"
      type="button"
      role="tab"
      :aria-selected="props.activeTab === 'lyric'"
      aria-controls="home-panel-lyric"
      @click="changeTab('lyric')"
    >
      {{ uiMessages.home.tabs.lyric }}
    </button>
    <button
      id="home-tab-playlist"
      class="tab"
      :class="{ active: props.activeTab === 'playlist' }"
      type="button"
      role="tab"
      :aria-selected="props.activeTab === 'playlist'"
      aria-controls="home-panel-playlist"
      @click="changeTab('playlist')"
    >
      {{ uiMessages.home.tabs.playlist }}
    </button>
  </div>
</template>

<style scoped>
.panel-tabs {
  display: flex;
  border-bottom: var(--tabbar-divider, var(--ui-divider));
  flex-shrink: 0;
}

.tab {
  position: relative;
  padding: 12px 20px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  border: none;
  border-right: var(--tab-border, var(--ui-divider));
  background: var(--tab-bg, var(--ui-panel-bg));
  color: var(--tab-text, var(--black));
  border-radius: 0;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.1s;
}

.tab.active {
  background: var(--tab-active-bg, var(--ui-primary-bg));
  color: var(--tab-active-text, var(--ui-primary-text));
  box-shadow: var(--tab-active-shadow, var(--ui-primary-shadow));
}

.tab.active::after {
  content: '';
  display: var(--tab-active-indicator-display, none);
  position: absolute;
  left: var(--tab-active-indicator-inset, 20px);
  right: var(--tab-active-indicator-inset, 20px);
  bottom: 0;
  height: var(--tab-active-indicator-height, 2px);
  background: var(--tab-active-indicator-color, var(--accent));
}

.tab:hover:not(.active),
.tab:active:not(.active) {
  background: var(--ui-hover-bg);
}

@media (max-width: 600px) {
  .tab {
    padding: 12px 16px;
    font-size: 11px;
  }
}
</style>
