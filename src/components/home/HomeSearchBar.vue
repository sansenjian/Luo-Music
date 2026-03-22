<script setup lang="ts">
import type { MusicServerOption } from '@/composables/useHomePage'

import HomeServerSelect from './HomeServerSelect.vue'

const props = defineProps<{
  isLoading: boolean
  searchKeyword: string
  selectedServer: string
  selectedServerLabel: string
  servers: MusicServerOption[]
  showSelect: boolean
}>()

const emit = defineEmits<{
  'close-select': []
  search: []
  'search-keyword-change': [value: string]
  'select-server': [value: string]
  'toggle-select': []
}>()

function onSearch(): void {
  emit('search')
}

function updateKeyword(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('search-keyword-change', target?.value ?? '')
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
  <div class="search-bar">
    <HomeServerSelect
      :selected-server="props.selectedServer"
      :selected-server-label="props.selectedServerLabel"
      :servers="props.servers"
      :show-select="props.showSelect"
      @close-select="onCloseSelect"
      @select-server="onSelectServer"
      @toggle-select="onToggleSelect"
    />

    <input
      :value="props.searchKeyword"
      @input="updateKeyword"
      @keyup.enter="onSearch"
      class="cyber-input"
      type="text"
      placeholder="Search..."
    />

    <button @click="onSearch" class="exec-btn" :disabled="props.isLoading">
      <span v-if="props.isLoading" class="loading"></span>
      <span v-else>Execute</span>
    </button>
  </div>
</template>

<style scoped>
.search-bar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  -webkit-app-region: no-drag;
}

.cyber-input {
  flex: 1;
  padding: 8px 10px;
  border: 2px solid var(--black);
  background: var(--white);
  font-family: inherit;
  font-size: 16px;
  outline: none;
  border-radius: 0;
  -webkit-appearance: none;
  appearance: none;
}

.cyber-input:focus {
  background: var(--bg);
}

.exec-btn {
  padding: 8px 16px;
  border: 2px solid var(--black);
  background: var(--black);
  color: var(--white);
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.1s;
  -webkit-appearance: none;
  appearance: none;
  border-radius: 0;
  display: flex;
  align-items: center;
}

.exec-btn:hover:not(:disabled),
.exec-btn:active:not(:disabled) {
  background: var(--white);
  color: var(--black);
}

.exec-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .search-bar {
    max-width: 300px;
  }
}

@media (max-width: 600px) {
  .search-bar {
    max-width: none;
    flex: 1;
    margin: 0;
    min-width: 0;
  }

  .cyber-input {
    padding: 8px 10px;
    font-size: 14px;
    min-width: 0;
  }

  .exec-btn {
    padding: 8px 12px;
    font-size: 10px;
    flex-shrink: 0;
    white-space: nowrap;
  }
}

@media (max-width: 390px) {
  .exec-btn {
    padding: 6px 10px;
    font-size: 9px;
  }

  .cyber-input {
    padding: 6px 8px;
  }
}
</style>
