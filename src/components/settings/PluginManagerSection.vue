<script setup lang="ts">
import { computed, ref } from 'vue'

import { uiMessages } from '@/messages/ui'
import { usePluginManager } from '@/composables/usePluginManager'
import type { PlatformCapabilities } from '@/platform/music/descriptors'
import type { PluginCategory } from '@plugin-sdk'

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

interface PluginCategoryTab {
  value: PluginCategory
  label: string
  description: string
  emptyTitle: string
  emptyDescription: string
}

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
    label: '主题',
    description: 'UI 优化',
    emptyTitle: '当前没有主题插件',
    emptyDescription: '界面外观、视觉样式或布局优化插件会显示在这里。'
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

function getPluginCategory(platform: { category?: PluginCategory }): PluginCategory {
  return platform.category ?? 'api'
}

function countPlatformsByCategory(category: PluginCategory): number {
  return managedPlatforms.value.filter(platform => getPluginCategory(platform) === category).length
}

function isBusy(platformId: string): boolean {
  return busyPlatformIds.value.includes(platformId)
}

function isEditingSettings(platformId: string): boolean {
  return editingSettingsPlatformId.value === platformId
}

function statusClass(status?: string): string {
  switch (status) {
    case 'ready':
      return 'plugin-status-ready'
    case 'disabled':
      return 'plugin-status-disabled'
    case 'error':
      return 'plugin-status-error'
    case 'circuit-tripped':
      return 'plugin-status-circuit'
    default:
      return 'plugin-status-ready'
  }
}

function statusLabel(status?: string): string {
  switch (status) {
    case 'ready':
      return '运行中'
    case 'disabled':
      return '已停用'
    case 'error':
      return '异常'
    case 'circuit-tripped':
      return '已熔断'
    default:
      return '运行中'
  }
}

function sourceLabel(source: string): string {
  return source === 'builtin' ? '内置' : source === 'external' ? '第三方' : source
}

function capabilityCount(platform: { capabilities: PlatformCapabilities }): number {
  const baseCount = Object.entries(platform.capabilities).filter(
    ([key, value]) => key !== 'auth' && value === true
  ).length

  return baseCount + (platform.capabilities.auth?.login ? 1 : 0)
}
</script>

<template>
  <section class="plugin-section" v-if="isElectron">
    <div class="plugin-toolbar">
      <label class="plugin-install-field">
        <svg
          class="plugin-install-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <input
          v-model="installPath"
          class="plugin-install-input"
          type="text"
          :placeholder="uiMessages.settings.fields.pluginInstallPath"
        />
      </label>

      <div class="plugin-toolbar-actions">
        <button class="plugin-pill plugin-pill-secondary" type="button" @click="browseInstallPath">
          {{ uiMessages.settings.actions.browsePluginPath }}
        </button>
        <button
          class="plugin-pill plugin-pill-primary"
          type="button"
          :disabled="!canInstall"
          @click="install"
        >
          {{
            isInstalling
              ? uiMessages.settings.actions.installingPlugin
              : uiMessages.settings.actions.installPlugin
          }}
        </button>
        <button
          class="plugin-pill plugin-pill-ghost"
          type="button"
          :disabled="isLoading"
          @click="refresh"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            class="plugin-refresh-icon"
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>
    </div>

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

    <div
      v-if="!isLoading && hasPlatforms"
      class="plugin-category-tabs"
      role="tablist"
      aria-label="插件分类"
    >
      <button
        v-for="category in pluginCategoryTabs"
        :key="category.value"
        type="button"
        role="tab"
        class="plugin-category-tab"
        :class="{ 'plugin-category-tab-active': activeCategory === category.value }"
        :aria-selected="activeCategory === category.value"
        @click="activeCategory = category.value"
      >
        <span class="plugin-category-label">{{ category.label }}</span>
        <span class="plugin-category-description">{{ category.description }}</span>
        <span class="plugin-category-count">{{ categoryCounts[category.value] }}</span>
      </button>
    </div>

    <div v-if="!isLoading && hasFilteredPlatforms" class="plugin-grid">
      <article
        v-for="platform in filteredPlatforms"
        :key="platform.id"
        class="plugin-card"
        :class="{
          'plugin-card-disabled': !platform.enabled,
          'plugin-card-circuit': platform.status === 'circuit-tripped'
        }"
      >
        <div class="plugin-card-head">
          <div class="plugin-card-identity">
            <div class="plugin-card-icon" :class="`plugin-icon-${platform.source}`">
              {{ platform.displayName.charAt(0) }}
            </div>
            <div class="plugin-card-title">
              <h4>{{ platform.displayName }}</h4>
              <span class="plugin-card-desc">
                {{ platform.description || uiMessages.settings.states.noPluginDescription }}
              </span>
            </div>
          </div>

          <div class="plugin-card-badges">
            <span class="plugin-badge" :class="`badge-${platform.source}`">
              {{ sourceLabel(platform.source) }}
            </span>
            <span class="plugin-status-dot" :class="statusClass(platform.status)" />
          </div>
        </div>

        <div class="plugin-card-meta">
          <span class="plugin-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            {{ uiMessages.settings.fields.pluginVersion }} {{ platform.version || '—' }}
          </span>
          <span class="plugin-meta-item">
            {{ statusLabel(platform.status) }}
          </span>
          <span class="plugin-meta-item">{{ capabilityCount(platform) }} 项能力</span>
        </div>

        <div v-if="platform.source === 'external' && platform.permissions" class="plugin-perms">
          <span v-if="platform.permissions.networkDomains?.length" class="plugin-perm-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path
                d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"
              />
            </svg>
            网络
          </span>
          <span v-if="platform.permissions.storage" class="plugin-perm-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path
                d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
              />
            </svg>
            存储
          </span>
        </div>

        <div v-if="platform.status === 'circuit-tripped'" class="plugin-alert plugin-alert-warn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path
              d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            {{ uiMessages.settings.fields.pluginCircuitTripped }} — 停用后重新{{
              uiMessages.settings.actions.enablePlugin
            }}以重置
          </span>
        </div>

        <p v-if="platform.lastError" class="plugin-card-error">{{ platform.lastError }}</p>

        <div class="plugin-card-actions" v-if="platform.source === 'external'">
          <button
            type="button"
            class="plugin-pill"
            :class="platform.enabled ? 'plugin-pill-secondary' : 'plugin-pill-primary'"
            :disabled="isBusy(platform.id)"
            @click="toggleEnabled(platform)"
          >
            {{
              platform.enabled
                ? uiMessages.settings.actions.disablePlugin
                : uiMessages.settings.actions.enablePlugin
            }}
          </button>
          <button
            v-if="hasEditableSettings(platform) && !isEditingSettings(platform.id)"
            type="button"
            class="plugin-pill plugin-pill-ghost"
            :disabled="isBusy(platform.id)"
            @click="startEditingSettings(platform)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
              />
            </svg>
            设置
          </button>
          <button
            type="button"
            class="plugin-pill plugin-pill-danger"
            :disabled="isBusy(platform.id)"
            @click="uninstall(platform)"
          >
            {{ uiMessages.settings.actions.uninstallPlugin }}
          </button>
        </div>

        <div v-if="isEditingSettings(platform.id)" class="plugin-settings">
          <div
            v-for="setting in getSettingsSchema(platform)"
            :key="setting.key"
            class="plugin-setting-row"
          >
            <label :for="`plugin-setting-${platform.id}-${setting.key}`">{{ setting.label }}</label>

            <label v-if="setting.type === 'boolean'" class="plugin-toggle">
              <input
                :id="`plugin-setting-${platform.id}-${setting.key}`"
                type="checkbox"
                v-model="editingSettingsValues[setting.key]"
              />
              <span class="plugin-toggle-track" />
            </label>

            <select
              v-else-if="setting.type === 'select'"
              :id="`plugin-setting-${platform.id}-${setting.key}`"
              v-model="editingSettingsValues[setting.key]"
              class="plugin-setting-select"
            >
              <option v-for="option in setting.options" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>

            <input
              v-else
              :id="`plugin-setting-${platform.id}-${setting.key}`"
              type="text"
              v-model="editingSettingsValues[setting.key]"
              class="plugin-setting-text"
            />
          </div>

          <div class="plugin-settings-footer">
            <button
              type="button"
              class="plugin-pill plugin-pill-primary"
              :disabled="isSavingSettings"
              @click="saveSettings"
            >
              {{ isSavingSettings ? '保存中…' : uiMessages.settings.actions.saveSettings }}
            </button>
            <button
              type="button"
              class="plugin-pill plugin-pill-ghost"
              @click="cancelEditingSettings"
            >
              取消
            </button>
          </div>
        </div>
      </article>
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

/* ---- toolbar ---- */
.plugin-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.plugin-install-field {
  flex: 1 1 280px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  min-height: 42px;
  border: 1px solid var(--sidebar-note-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-soft) 90%, var(--white));
}

.plugin-install-icon {
  width: 16px;
  height: 16px;
  color: var(--gray-light);
  flex-shrink: 0;
}

.plugin-install-input {
  flex: 1;
  min-width: 0;
  min-height: 38px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--black);
}

.plugin-toolbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* ---- pill buttons ---- */
.plugin-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.plugin-pill svg {
  width: 15px;
  height: 15px;
}

.plugin-pill-primary {
  background: var(--sidebar-active-bg);
  color: var(--white);
  box-shadow: var(--sidebar-active-shadow);
}

.plugin-pill-primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.plugin-pill-secondary {
  background: var(--surface-muted);
  color: var(--gray);
  box-shadow: inset 0 0 0 1px var(--sidebar-note-border);
}

.plugin-pill-secondary:hover:not(:disabled) {
  background: var(--sidebar-link-hover-bg);
  color: var(--black);
  transform: translateY(-1px);
}

.plugin-pill-ghost {
  background: transparent;
  color: var(--gray);
  box-shadow: inset 0 0 0 1px var(--sidebar-note-border);
}

.plugin-pill-ghost:hover:not(:disabled) {
  background: var(--sidebar-link-hover-bg);
  color: var(--black);
}

.plugin-pill-danger {
  background: transparent;
  color: #d03050;
  box-shadow: inset 0 0 0 1px rgba(208, 48, 80, 0.3);
}

.plugin-pill-danger:hover:not(:disabled) {
  background: #fff1f0;
}

.plugin-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.plugin-refresh-icon {
  width: 16px;
  height: 16px;
}

/* ---- alerts ---- */
.plugin-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: calc(var(--sidebar-link-radius, 8px) + 4px);
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

.plugin-alert-warn {
  color: #b07000;
  background: #fffbe6;
  border: 1px solid rgba(176, 112, 0, 0.16);
}

/* ---- loading ---- */
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
  border: 2px solid var(--sidebar-note-border);
  border-top-color: var(--sidebar-active-bg);
  border-radius: 50%;
  animation: plugin-spin 0.6s linear infinite;
}

@keyframes plugin-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---- category tabs ---- */
.plugin-category-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 4px;
  border: 1px solid var(--sidebar-note-border);
  border-radius: calc(var(--sidebar-link-radius, 8px) + 8px);
  background: var(--surface-muted);
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
  border-radius: calc(var(--sidebar-link-radius, 8px) + 4px);
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
  background: var(--sidebar-link-hover-bg);
  color: var(--black);
}

.plugin-category-tab-active {
  background: var(--surface-soft);
  color: var(--black);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
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
  color: var(--sidebar-note-text);
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
  background: color-mix(in srgb, var(--surface-soft) 75%, var(--white));
  color: var(--gray);
  font-size: 11px;
  font-weight: 800;
  box-shadow: inset 0 0 0 1px var(--sidebar-note-border);
}

.plugin-category-tab-active .plugin-category-count {
  background: var(--sidebar-active-bg);
  color: var(--white);
  box-shadow: none;
}

/* ---- empty state ---- */
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
  border: 1px solid var(--sidebar-note-border);
  border-radius: calc(var(--sidebar-link-radius, 8px) + 8px);
  background: var(--surface-muted);
}

.plugin-empty-icon svg {
  width: 28px;
  height: 28px;
  color: var(--sidebar-note-text);
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

/* ---- card grid ---- */
.plugin-grid {
  display: grid;
  gap: 12px;
}

.plugin-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--sidebar-note-border);
  border-radius: calc(var(--sidebar-link-radius, 8px) + 8px);
  background: color-mix(in srgb, var(--surface-soft) 92%, var(--white));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.plugin-card:hover {
  border-color: color-mix(in srgb, var(--sidebar-note-border) 60%, var(--black));
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

.plugin-card-disabled {
  opacity: 0.65;
}

.plugin-card-circuit {
  border-color: rgba(176, 112, 0, 0.32);
}

/* ---- card header ---- */
.plugin-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.plugin-card-identity {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-width: 0;
}

.plugin-card-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: calc(var(--sidebar-link-radius, 8px) + 4px);
  font-size: 16px;
  font-weight: 800;
  flex-shrink: 0;
}

.plugin-icon-builtin {
  background: #eef6ff;
  color: #3b82f6;
}

.plugin-icon-external {
  background: #fff3e8;
  color: #f59e0b;
}

.plugin-icon-core {
  background: #f0fdf4;
  color: #22c55e;
}

.plugin-card-title {
  min-width: 0;
}

.plugin-card-title h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--black);
}

.plugin-card-desc {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: var(--gray);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- badges ---- */
.plugin-card-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.plugin-badge {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.badge-builtin {
  background: #eef6ff;
  color: #3b82f6;
}

.badge-external {
  background: #fff3e8;
  color: #d97706;
}

.badge-core {
  background: #f0fdf4;
  color: #16a34a;
}

/* ---- status dot ---- */
.plugin-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.plugin-status-ready {
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
}

.plugin-status-disabled {
  background: var(--gray-light);
}

.plugin-status-error {
  background: #ef4444;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.4);
}

.plugin-status-circuit {
  background: #f59e0b;
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);
  animation: plugin-pulse 2s ease-in-out infinite;
}

@keyframes plugin-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

/* ---- meta row ---- */
.plugin-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.plugin-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--gray);
}

.plugin-meta-item svg {
  width: 13px;
  height: 13px;
  opacity: 0.6;
}

/* ---- permissions ---- */
.plugin-perms {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.plugin-perm-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--gray);
  background: var(--surface-muted);
  box-shadow: inset 0 0 0 1px var(--sidebar-note-border);
}

.plugin-perm-chip svg {
  width: 12px;
  height: 12px;
}

/* ---- card error ---- */
.plugin-card-error {
  margin: 0;
  padding: 8px 12px;
  border-radius: calc(var(--sidebar-link-radius, 8px) + 2px);
  background: #fff1f0;
  color: #d03050;
  font-size: 12px;
  line-height: 1.5;
}

/* ---- card actions ---- */
.plugin-card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 4px;
  border-top: 1px solid var(--sidebar-note-border);
}

/* ---- settings form ---- */
.plugin-settings {
  padding: 14px;
  border-radius: calc(var(--sidebar-link-radius, 8px) + 4px);
  background: color-mix(in srgb, var(--surface-muted) 60%, transparent);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.plugin-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.plugin-setting-row label {
  font-size: 13px;
  font-weight: 500;
  color: var(--black);
}

/* toggle switch */
.plugin-toggle {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.plugin-toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.plugin-toggle-track {
  display: block;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: var(--gray-light);
  position: relative;
  transition: background 0.2s ease;
}

.plugin-toggle-track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--white);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s ease;
}

.plugin-toggle input:checked + .plugin-toggle-track {
  background: var(--sidebar-active-bg);
}

.plugin-toggle input:checked + .plugin-toggle-track::after {
  transform: translateX(18px);
}

.plugin-setting-text,
.plugin-setting-select {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--sidebar-note-border);
  border-radius: 999px;
  background: var(--surface-soft);
  font-size: 13px;
  color: var(--black);
  outline: none;
  transition: border-color 0.18s ease;
}

.plugin-setting-text {
  flex: 0 1 200px;
}

.plugin-setting-text:focus,
.plugin-setting-select:focus {
  border-color: var(--sidebar-active-bg);
}

.plugin-settings-footer {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--sidebar-note-border);
}

@media (max-width: 640px) {
  .plugin-toolbar {
    flex-direction: column;
  }

  .plugin-install-field {
    flex-basis: auto;
    width: 100%;
  }

  .plugin-toolbar-actions {
    width: 100%;
  }

  .plugin-toolbar-actions .plugin-pill {
    flex: 1;
  }

  .plugin-category-tabs {
    grid-template-columns: 1fr;
  }

  .plugin-card-head {
    flex-direction: column;
  }

  .plugin-card-identity {
    width: 100%;
  }

  .plugin-setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .plugin-setting-text {
    flex: 1 1 100%;
    width: 100%;
  }
}
</style>
