<script setup lang="ts">
import type { LocalLibraryViewMode } from '@shared/types/localLibrary'
import { computed } from 'vue'
import { Input } from '@/components/ui/input'
import type { LocalMusicViewModeOption } from '@/features/home/composables/localMusic.types'

const props = defineProps<{
  activeView: LocalLibraryViewMode
  currentSummaryLabel: string
  currentViewTitle: string
  hasSearchValue: boolean
  searchDraft: string
  viewModes: LocalMusicViewModeOption[]
}>()

const emit = defineEmits<{
  'clear-search': []
  'submit-search': []
  'update:active-view': [view: LocalLibraryViewMode]
  'update:search-draft': [value: string]
}>()

const searchModel = computed({
  get: () => props.searchDraft,
  set: value => emit('update:search-draft', value)
})
</script>

<template>
  <div class="local-content-header">
    <div class="local-toolbar-top">
      <div class="local-view-tabs">
        <button
          v-for="view in viewModes"
          :key="view.id"
          type="button"
          class="view-tab"
          :class="{ active: activeView === view.id }"
          @click="$emit('update:active-view', view.id)"
        >
          {{ view.label }}
        </button>
      </div>
    </div>

    <div class="local-toolbar">
      <div class="local-section-copy">
        <h2>{{ currentViewTitle }}</h2>
        <p>{{ currentSummaryLabel }}</p>
      </div>
      <form class="local-search" @submit.prevent="$emit('submit-search')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="7"></circle>
          <path d="m20 20-3.5-3.5"></path>
        </svg>
        <Input
          v-model="searchModel"
          class="local-search-input"
          type="search"
          :placeholder="
            activeView === 'songs' || activeView === 'inbox'
              ? '搜索歌曲、歌手、专辑或文件名'
              : '搜索名称'
          "
        />
        <button type="submit" class="search-submit">搜索</button>
        <button
          v-if="hasSearchValue"
          type="button"
          class="search-clear"
          aria-label="清空搜索"
          @click="$emit('clear-search')"
        >
          ×
        </button>
      </form>
    </div>
  </div>
</template>
