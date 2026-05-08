<script setup lang="ts">
import type { MusicServerOption } from '@/features/home/composables/useHomePage'
import { uiMessages } from '@/messages/ui'

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
  <div class="search-bar" data-ui="search-bar">
    <HomeServerSelect
      class="search-server-select"
      :selected-server="props.selectedServer"
      :selected-server-label="props.selectedServerLabel"
      :servers="props.servers"
      :show-select="props.showSelect"
      @close-select="onCloseSelect"
      @select-server="onSelectServer"
      @toggle-select="onToggleSelect"
    />

    <div class="search-input-shell">
      <span class="search-leading-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>

      <input
        id="home-search-input"
        :value="props.searchKeyword"
        @input="updateKeyword"
        @keyup.enter="onSearch"
        class="cyber-input"
        type="text"
        :placeholder="uiMessages.home.search.placeholder"
        :aria-label="uiMessages.home.search.inputLabel"
      />

      <kbd class="search-shortcut" aria-hidden="true">Ctrl K</kbd>
    </div>

    <button type="button" @click="onSearch" class="exec-btn" :disabled="props.isLoading">
      <span v-if="props.isLoading" class="exec-loading" aria-hidden="true"></span>
      <span class="exec-label">
        {{ props.isLoading ? uiMessages.home.search.loading : uiMessages.home.search.submit }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.search-bar {
  display: grid;
  grid-template-columns: var(--home-search-grid-columns, auto minmax(0, 1fr) auto);
  gap: var(--home-search-gap, 8px);
  align-items: center;
  width: var(--home-search-width, auto);
  max-width: var(--home-search-max-width, none);
  -webkit-app-region: no-drag;
}

.search-server-select {
  display: var(--home-search-server-display, block);
}

.search-input-shell {
  min-width: 0;
  height: var(--home-search-input-height, auto);
  display: flex;
  align-items: center;
  gap: var(--home-search-input-gap, 0);
  padding: var(--home-search-shell-padding, 0);
  border: var(--home-search-shell-border, 0);
  border-radius: var(--home-search-shell-radius, 0);
  background: var(--home-search-shell-bg, transparent);
  box-shadow: var(--home-search-shell-shadow, none);
  overflow: hidden;
}

.search-leading-icon {
  width: var(--home-search-icon-size, 20px);
  height: var(--home-search-icon-size, 20px);
  flex-shrink: 0;
  display: var(--home-search-icon-display, none);
  align-items: center;
  justify-content: center;
  color: var(--home-search-icon-color, var(--gray));
}

.search-leading-icon svg {
  width: 100%;
  height: 100%;
  display: block;
}

.cyber-input {
  width: 100%;
  min-width: 0;
  flex: 1;
  padding: var(--home-search-input-padding, 8px 10px);
  border: var(--home-search-input-border, var(--ui-border));
  background: var(--home-search-input-bg, var(--ui-control-bg));
  color: var(--home-search-input-text, var(--black));
  font-family: inherit;
  font-size: var(--home-search-input-font-size, 16px);
  outline: none;
  border-radius: var(--home-search-input-radius, var(--ui-control-radius));
  -webkit-appearance: none;
  appearance: none;
}

.cyber-input::placeholder {
  color: var(--home-search-placeholder-text, var(--gray));
  opacity: 1;
}

.cyber-input:focus {
  border-color: var(--home-search-focus-border-color, var(--ui-focus-border));
  background: var(--home-search-focus-bg, var(--ui-control-focus-bg));
}

.search-shortcut {
  min-width: var(--home-search-shortcut-min-width, 46px);
  height: var(--home-search-shortcut-height, 28px);
  padding: var(--home-search-shortcut-padding, 0 10px);
  border: var(--home-search-shortcut-border, 1px solid var(--ui-border-subtle));
  border-radius: var(--home-search-shortcut-radius, var(--ui-radius-sm));
  display: var(--home-search-shortcut-display, none);
  align-items: center;
  justify-content: center;
  background: var(--home-search-shortcut-bg, rgba(255, 255, 255, 0.54));
  color: var(--home-search-shortcut-text, var(--gray));
  box-shadow: var(--home-search-shortcut-shadow, none);
  font-family: inherit;
  font-size: var(--home-search-shortcut-font-size, 12px);
  font-weight: var(--home-search-shortcut-font-weight, 600);
  line-height: 1;
  white-space: nowrap;
}

.exec-btn {
  padding: 8px 16px;
  border: var(--ui-border);
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.1s;
  -webkit-appearance: none;
  appearance: none;
  border-radius: var(--ui-control-radius);
  display: var(--home-search-action-display, flex);
  align-items: center;
}

.exec-btn:hover:not(:disabled),
.exec-btn:active:not(:disabled) {
  background: var(--ui-primary-hover-bg);
  color: var(--ui-primary-hover-text);
  box-shadow: var(--ui-primary-shadow);
}

.exec-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.exec-loading {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 6px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: home-search-spin 0.8s linear infinite;
}

@keyframes home-search-spin {
  to {
    transform: rotate(360deg);
  }
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
