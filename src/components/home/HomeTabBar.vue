<script setup lang="ts">
import type { HomeTab } from '../../composables/useHomeShell'

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
  <div class="panel-tabs">
    <button
      class="tab"
      :class="{ active: props.activeTab === 'lyric' }"
      @click="changeTab('lyric')"
    >
      Lyrics
    </button>
    <button
      class="tab"
      :class="{ active: props.activeTab === 'playlist' }"
      @click="changeTab('playlist')"
    >
      Playlist
    </button>
  </div>
</template>

<style scoped>
.panel-tabs {
  display: flex;
  border-bottom: var(--border);
  flex-shrink: 0;
}

.tab {
  padding: 12px 20px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  border: none;
  border-right: var(--border);
  background: var(--bg);
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.1s;
}

.tab.active {
  background: var(--black);
  color: var(--white);
}

.tab:hover:not(.active),
.tab:active:not(.active) {
  background: var(--bg-dark);
}

@media (max-width: 600px) {
  .tab {
    padding: 12px 16px;
    font-size: 11px;
  }
}
</style>
