<script setup lang="ts">
import type { MusicServerOption } from '@/composables/useHomePage'

import HomeSearchBar from './HomeSearchBar.vue'
import HomeWindowControls from './HomeWindowControls.vue'

const props = defineProps<{
  isElectron: boolean
  isLoading: boolean
  searchKeyword: string
  selectedServer: string
  selectedServerLabel: string
  servers: MusicServerOption[]
  showSelect: boolean
}>()

const emit = defineEmits<{
  'close-select': []
  'close-window': []
  'maximize-window': []
  'minimize-window': []
  search: []
  'search-keyword-change': [value: string]
  'select-server': [value: string]
  'toggle-select': []
}>()

function onSearch(): void {
  emit('search')
}

function onSearchKeywordChange(value: string): void {
  emit('search-keyword-change', value)
}

function onSelectServer(value: string): void {
  emit('select-server', value)
}

function onCloseSelect(): void {
  emit('close-select')
}

function onToggleSelect(): void {
  emit('toggle-select')
}
</script>

<template>
  <header class="titlebar">
    <div class="title-left">
      <h1 class="logo">luo_music</h1>
    </div>

    <HomeSearchBar
      :is-loading="props.isLoading"
      :search-keyword="props.searchKeyword"
      :selected-server="props.selectedServer"
      :selected-server-label="props.selectedServerLabel"
      :servers="props.servers"
      :show-select="props.showSelect"
      @close-select="onCloseSelect"
      @search="onSearch"
      @search-keyword-change="onSearchKeywordChange"
      @select-server="onSelectServer"
      @toggle-select="onToggleSelect"
    />

    <HomeWindowControls
      :is-electron="props.isElectron"
      @close-window="emit('close-window')"
      @maximize-window="emit('maximize-window')"
      @minimize-window="emit('minimize-window')"
    />
  </header>
</template>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  padding-top: calc(12px + var(--safe-top));
  padding-left: calc(20px + var(--safe-left));
  padding-right: calc(20px + var(--safe-right));
  border-bottom: var(--border);
  background: var(--bg);
  flex-shrink: 0;
  transition: all 0.3s ease;
  -webkit-app-region: drag;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.logo {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.02em;
  text-transform: uppercase;
}

@media (max-width: 900px) {
  .titlebar {
    gap: 8px;
    padding: 8px 12px;
    padding-top: calc(8px + var(--safe-top));
    padding-left: calc(12px + var(--safe-left));
    padding-right: calc(12px + var(--safe-right));
  }

  .title-left {
    gap: 8px;
  }

  .logo {
    font-size: 14px;
  }
}

@media (max-width: 600px) {
  .titlebar {
    padding: 8px 12px;
    padding-top: calc(8px + var(--safe-top));
    padding-left: calc(12px + var(--safe-left));
    padding-right: calc(12px + var(--safe-right));
    gap: 8px;
  }

  .logo {
    font-size: 12px;
  }
}

@media (max-width: 390px) {
  .titlebar {
    padding: 6px 8px;
    gap: 6px;
  }

  .logo {
    font-size: 11px;
  }
}
</style>
