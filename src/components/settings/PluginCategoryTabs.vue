<script setup lang="ts">
import type { PluginCategory } from '@plugin-sdk'

import type { PluginCategoryTab } from './pluginManager.types'

const activeCategory = defineModel<PluginCategory>({ required: true })

defineProps<{
  tabs: PluginCategoryTab[]
  counts: Record<PluginCategory, number>
}>()

function selectCategory(category: PluginCategory): void {
  activeCategory.value = category
}
</script>

<template>
  <div class="plugin-category-tabs" role="tablist" aria-label="插件分类">
    <button
      v-for="category in tabs"
      :key="category.value"
      type="button"
      role="tab"
      class="plugin-category-tab"
      :class="{ 'plugin-category-tab-active': activeCategory === category.value }"
      :aria-selected="activeCategory === category.value"
      @click="selectCategory(category.value)"
    >
      <span class="plugin-category-label">{{ category.label }}</span>
      <span class="plugin-category-description">{{ category.description }}</span>
      <span class="plugin-category-count">{{ counts[category.value] }}</span>
    </button>
  </div>
</template>

<style scoped>
.plugin-category-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 4px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-card-radius);
  background: var(--ui-surface-muted);
}

.plugin-category-tab {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 3px 10px;
  min-width: 0;
  min-height: 54px;
  padding: 8px 12px;
  border: none;
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--gray);
  text-align: left;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.plugin-category-tab:hover {
  background: var(--ui-hover-bg);
  color: var(--black);
}

.plugin-category-tab-active {
  background: var(--ui-surface-soft);
  color: var(--black);
  box-shadow: var(--ui-shadow);
}

.plugin-category-label {
  min-width: 0;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.2;
}

.plugin-category-description {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--gray);
}

.plugin-category-tab-active .plugin-category-description {
  color: var(--accent);
}

.plugin-category-count {
  grid-column: 2;
  grid-row: 1 / span 2;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: var(--ui-surface-soft);
  color: var(--gray);
  font-size: 11px;
  font-weight: 800;
  box-shadow: inset 0 0 0 1px var(--ui-border-subtle);
}

.plugin-category-tab-active .plugin-category-count {
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
  box-shadow: none;
}

@media (max-width: 640px) {
  .plugin-category-tabs {
    grid-template-columns: 1fr;
  }
}
</style>
