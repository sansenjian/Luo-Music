<script setup lang="ts">
import type { MusicServerOption } from '@/composables/useHomePage'
import { useProjectUi } from '@/composables/useProjectUi'
import HomeBrandBadge from './HomeBrandBadge.vue'
import HomeSearchBar from './HomeSearchBar.vue'
import HomeWindowControls from './HomeWindowControls.vue'

const props = withDefaults(
  defineProps<{
    showBrand?: boolean
    canNavigateBack?: boolean
    canNavigateForward?: boolean
    isElectron: boolean
    isLoading: boolean
    searchKeyword: string
    selectedServer: string
    selectedServerLabel: string
    servers: MusicServerOption[]
    showSelect: boolean
  }>(),
  {
    showBrand: true,
    canNavigateBack: false,
    canNavigateForward: false
  }
)

const emit = defineEmits<{
  'close-select': []
  'close-window': []
  'maximize-window': []
  'minimize-window': []
  'navigate-back': []
  'navigate-forward': []
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

const { renderStyle } = useProjectUi()

function navigateBack(): void {
  emit('navigate-back')
}

function navigateForward(): void {
  emit('navigate-forward')
}
</script>

<template>
  <header class="titlebar" data-ui="titlebar">
    <div class="title-nav" data-ui="title-nav" aria-label="窗口导航">
      <button
        type="button"
        class="title-nav-button"
        :disabled="!props.canNavigateBack"
        aria-label="返回"
        title="返回"
        @click="navigateBack"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        class="title-nav-button"
        :disabled="!props.canNavigateForward"
        aria-label="前进"
        title="前进"
        @click="navigateForward"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>

    <div v-if="props.showBrand !== false" class="title-left" data-ui="title-brand">
      <h1 v-if="renderStyle === 'classic'" class="logo">LUO_MUSIC</h1>
      <HomeBrandBadge v-else placement="header" />
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
  margin: var(--titlebar-margin, 0);
  padding: 12px 20px;
  padding-top: calc(12px + var(--safe-top));
  padding-left: calc(20px + var(--safe-left));
  padding-right: calc(20px + var(--safe-right));
  border: var(--titlebar-border, 0);
  border-bottom: var(--titlebar-divider, var(--ui-divider));
  border-radius: var(--titlebar-radius, 0);
  background: var(--titlebar-bg, var(--ui-app-bg));
  box-shadow: var(--titlebar-shadow, none);
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

.title-nav {
  display: var(--title-nav-display, none);
  align-items: center;
  gap: var(--title-nav-gap, 8px);
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.title-nav-button {
  width: var(--title-nav-button-size, 28px);
  height: var(--title-nav-button-size, 28px);
  border: var(--title-nav-button-border, 0);
  border-radius: var(--title-nav-button-radius, var(--ui-control-radius));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--title-nav-button-bg, transparent);
  color: var(--title-nav-button-text, var(--gray));
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.title-nav-button:hover {
  background: var(--title-nav-button-hover-bg, var(--ui-hover-bg));
  color: var(--title-nav-button-hover-text, var(--black));
}

.title-nav-button:disabled {
  cursor: default;
  opacity: 0.35;
}

.title-nav-button:disabled:hover {
  background: var(--title-nav-button-bg, transparent);
  color: var(--title-nav-button-text, var(--gray));
}

.title-nav-button svg {
  width: var(--title-nav-icon-size, 18px);
  height: var(--title-nav-icon-size, 18px);
}

.logo {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0;
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
