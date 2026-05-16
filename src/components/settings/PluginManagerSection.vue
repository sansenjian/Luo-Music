<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PluginCategory } from '@plugin-sdk'

import { usePluginManager } from '@/composables/usePluginManager'
import { uiMessages } from '@/messages/ui'

import PluginCategoryTabs from './PluginCategoryTabs.vue'
import PluginInstallToolbar from './PluginInstallToolbar.vue'
import PluginPlatformCard from './PluginPlatformCard.vue'
import { getPluginCategory } from './pluginManager.helpers'
import type { PluginCategoryTab } from './pluginManager.types'

const {
  installPath,
  managedPlatforms,
  hasPlatforms,
  isElectron,
  isLoading,
  isInstalling,
  busyPlatformIds,
  errorMessage,
  editingSettingsPlatformId,
  editingSettingsValues,
  isSavingSettings,
  refresh,
  install,
  browseInstallPath,
  toggleEnabled,
  uninstall,
  getSettingsSchema,
  hasEditableSettings,
  startEditingSettings,
  cancelEditingSettings,
  saveSettings
} = usePluginManager()

const pluginCategoryTabs: PluginCategoryTab[] = [
  {
    value: 'api',
    label: 'API',
    description: '平台 API 功能',
    emptyTitle: '当前没有平台 API 插件',
    emptyDescription: '安装音乐平台插件后，会在这里显示搜索、播放、歌词等平台能力。'
  },
  {
    value: 'extension',
    label: '拓展',
    description: '播放器优化功能',
    emptyTitle: '当前没有播放器拓展',
    emptyDescription: '播放器体验、播放控制或系统集成功能插件会显示在这里。'
  },
  {
    value: 'theme',
    label: '主题插件',
    description: '主题资源包',
    emptyTitle: '当前没有主题插件',
    emptyDescription: '启用主题资源包后，对应渲染风格会出现在界面设置里。'
  }
]

const activeCategory = ref<PluginCategory>('api')
const canInstall = computed(() => installPath.value.trim().length > 0 && !isInstalling.value)
const categoryCounts = computed<Record<PluginCategory, number>>(() => ({
  api: countPlatformsByCategory('api'),
  extension: countPlatformsByCategory('extension'),
  theme: countPlatformsByCategory('theme')
}))
const filteredPlatforms = computed(() =>
  managedPlatforms.value.filter(platform => getPluginCategory(platform) === activeCategory.value)
)
const hasFilteredPlatforms = computed(() => filteredPlatforms.value.length > 0)
const activeCategoryTab = computed(
  () => pluginCategoryTabs.find(tab => tab.value === activeCategory.value) ?? pluginCategoryTabs[0]
)

watch(
  categoryCounts,
  counts => {
    if (counts[activeCategory.value] > 0) {
      return
    }

    const nextCategory = pluginCategoryTabs.find(tab => counts[tab.value] > 0)?.value
    if (nextCategory) {
      activeCategory.value = nextCategory
    }
  },
  { immediate: true }
)

function countPlatformsByCategory(category: PluginCategory): number {
  return managedPlatforms.value.filter(platform => getPluginCategory(platform) === category).length
}

function isBusy(platformId: string): boolean {
  return busyPlatformIds.value.includes(platformId)
}

function isEditingSettings(platformId: string): boolean {
  return editingSettingsPlatformId.value === platformId
}

function updateSettingValue(key: string, value: unknown): void {
  editingSettingsValues[key] = value
}
</script>

<template>
  <section class="plugin-section">
    <PluginInstallToolbar
      v-if="isElectron"
      v-model="installPath"
      :can-install="canInstall"
      :is-installing="isInstalling"
      :is-loading="isLoading"
      @browse-install-path="browseInstallPath"
      @install="install"
      @refresh="refresh"
    />

    <div v-if="errorMessage" class="plugin-alert plugin-alert-error">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{{ errorMessage }}</span>
    </div>

    <div v-if="isLoading" class="plugin-loading">
      <div class="plugin-loading-spinner" />
      <span>{{ uiMessages.settings.states.loadingPlugins }}</span>
    </div>

    <PluginCategoryTabs
      v-if="!isLoading && hasPlatforms"
      v-model="activeCategory"
      :tabs="pluginCategoryTabs"
      :counts="categoryCounts"
    />

    <div v-if="!isLoading && hasFilteredPlatforms" class="plugin-grid">
      <PluginPlatformCard
        v-for="platform in filteredPlatforms"
        :key="platform.id"
        :platform="platform"
        :is-busy="isBusy(platform.id)"
        :has-editable-settings="hasEditableSettings(platform)"
        :is-editing-settings="isEditingSettings(platform.id)"
        :settings-schema="getSettingsSchema(platform)"
        :setting-values="editingSettingsValues"
        :is-saving-settings="isSavingSettings"
        @toggle-enabled="toggleEnabled"
        @uninstall="uninstall"
        @start-editing-settings="startEditingSettings"
        @save-settings="saveSettings"
        @cancel-editing-settings="cancelEditingSettings"
        @update-setting="updateSettingValue"
      />
    </div>

    <div v-else-if="!isLoading && hasPlatforms" class="plugin-empty plugin-empty-compact">
      <div class="plugin-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path
            d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
          />
          <path d="M7.5 8.5h9" />
          <path d="M7.5 12h9" />
          <path d="M7.5 15.5h5" />
        </svg>
      </div>
      <h3>{{ activeCategoryTab.emptyTitle }}</h3>
      <p>{{ activeCategoryTab.emptyDescription }}</p>
    </div>

    <div v-else-if="!isLoading" class="plugin-empty">
      <div class="plugin-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path
            d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
          />
          <polyline points="7.5 4.21 12 6.3 16.5 4.21" />
          <polyline points="7.5 4.21 7.5 8.37" />
          <line x1="12" y1="22.08" x2="12" y2="6.3" />
        </svg>
      </div>
      <h3>{{ uiMessages.settings.states.noPluginsInstalled }}</h3>
      <p>安装第三方插件来扩展音乐源、歌词获取等能力。</p>
    </div>
  </section>
</template>

<style scoped>
.plugin-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.plugin-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--ui-radius-md);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}

.plugin-alert svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.plugin-alert-error {
  color: #d03050;
  background: #fff1f0;
  border: 1px solid rgba(208, 48, 80, 0.16);
}

.plugin-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 0;
  color: var(--gray);
  font-size: 13px;
}

.plugin-loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--ui-border-subtle);
  border-top-color: var(--ui-focus-border);
  border-radius: 50%;
  animation: plugin-spin 0.6s linear infinite;
}

@keyframes plugin-spin {
  to {
    transform: rotate(360deg);
  }
}

.plugin-empty {
  display: grid;
  place-items: center;
  text-align: center;
  padding: 64px 24px;
  color: var(--gray);
}

.plugin-empty-icon {
  width: 62px;
  height: 62px;
  margin-bottom: 16px;
  display: grid;
  place-items: center;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-card-radius);
  background: var(--ui-surface-muted);
}

.plugin-empty-icon svg {
  width: 28px;
  height: 28px;
  color: var(--accent);
}

.plugin-empty h3 {
  margin: 0;
  font-size: 20px;
  color: var(--black);
}

.plugin-empty p {
  max-width: 380px;
  margin: 8px auto 0;
  line-height: 1.7;
  font-size: 13px;
}

.plugin-empty-compact {
  padding: 44px 24px;
}

.plugin-grid {
  display: grid;
  gap: 12px;
}
</style>
