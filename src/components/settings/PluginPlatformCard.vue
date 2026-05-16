<script setup lang="ts">
import type { PluginSettingDefinition } from '@plugin-sdk'
import type { PlatformDescriptor } from '@shared/types/platform'

import { uiMessages } from '@/messages/ui'

import { capabilityLabel, sourceLabel, statusClass, statusLabel } from './pluginManager.helpers'
import PluginSettingsForm from './PluginSettingsForm.vue'

defineProps<{
  platform: PlatformDescriptor
  isBusy: boolean
  hasEditableSettings: boolean
  isEditingSettings: boolean
  settingsSchema: PluginSettingDefinition[]
  settingValues: Record<string, unknown>
  isSavingSettings: boolean
}>()

const emit = defineEmits<{
  'toggle-enabled': [platform: PlatformDescriptor]
  uninstall: [platform: PlatformDescriptor]
  'start-editing-settings': [platform: PlatformDescriptor]
  'save-settings': []
  'cancel-editing-settings': []
  'update-setting': [key: string, value: unknown]
}>()
</script>

<template>
  <article
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
      <span class="plugin-meta-item">{{ capabilityLabel(platform) }}</span>
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
        {{ uiMessages.settings.fields.pluginCircuitTripped }} - 停用后重新{{
          uiMessages.settings.actions.enablePlugin
        }}以重置
      </span>
    </div>

    <p v-if="platform.lastError" class="plugin-card-error">{{ platform.lastError }}</p>

    <div
      class="plugin-card-actions"
      v-if="platform.source === 'external' || platform.source === 'builtin'"
    >
      <button
        type="button"
        class="plugin-pill"
        :class="platform.enabled ? 'plugin-pill-secondary' : 'plugin-pill-primary'"
        :disabled="isBusy"
        @click="emit('toggle-enabled', platform)"
      >
        {{
          platform.enabled
            ? uiMessages.settings.actions.disablePlugin
            : uiMessages.settings.actions.enablePlugin
        }}
      </button>
      <button
        v-if="hasEditableSettings && !isEditingSettings"
        type="button"
        class="plugin-pill plugin-pill-ghost"
        :disabled="isBusy"
        @click="emit('start-editing-settings', platform)"
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
        v-if="platform.source === 'external'"
        type="button"
        class="plugin-pill plugin-pill-danger"
        :disabled="isBusy"
        @click="emit('uninstall', platform)"
      >
        {{ uiMessages.settings.actions.uninstallPlugin }}
      </button>
    </div>

    <PluginSettingsForm
      v-if="isEditingSettings"
      :platform-id="platform.id"
      :settings-schema="settingsSchema"
      :setting-values="settingValues"
      :is-saving="isSavingSettings"
      @save="emit('save-settings')"
      @cancel="emit('cancel-editing-settings')"
      @update-setting="(key, value) => emit('update-setting', key, value)"
    />
  </article>
</template>

<style scoped>
.plugin-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-card-radius);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.plugin-card:hover {
  border-color: var(--ui-focus-border);
  transform: translateY(-1px);
  box-shadow: var(--ui-floating-shadow);
}

.plugin-card-disabled {
  opacity: 0.65;
}

.plugin-card-circuit {
  border-color: rgba(176, 112, 0, 0.32);
}

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
  border-radius: var(--ui-radius-md);
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
  background: var(--ui-surface-muted);
  box-shadow: inset 0 0 0 1px var(--ui-border-subtle);
}

.plugin-perm-chip svg {
  width: 12px;
  height: 12px;
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

.plugin-alert-warn {
  color: #b07000;
  background: #fffbe6;
  border: 1px solid rgba(176, 112, 0, 0.16);
}

.plugin-card-error {
  margin: 0;
  padding: 8px 12px;
  border-radius: var(--ui-radius-md);
  background: #fff1f0;
  color: #d03050;
  font-size: 12px;
  line-height: 1.5;
}

.plugin-card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 4px;
  border-top: 1px solid var(--ui-border-subtle);
}

.plugin-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: var(--ui-control-radius);
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
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
  box-shadow: var(--ui-primary-shadow);
}

.plugin-pill-primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.plugin-pill-secondary {
  background: var(--ui-surface-muted);
  color: var(--gray);
  box-shadow: inset 0 0 0 1px var(--ui-border-subtle);
}

.plugin-pill-secondary:hover:not(:disabled) {
  background: var(--ui-hover-bg);
  color: var(--black);
  transform: translateY(-1px);
}

.plugin-pill-ghost {
  background: transparent;
  color: var(--gray);
  box-shadow: inset 0 0 0 1px var(--ui-border-subtle);
}

.plugin-pill-ghost:hover:not(:disabled) {
  background: var(--ui-hover-bg);
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

@media (max-width: 640px) {
  .plugin-card-head {
    flex-direction: column;
  }

  .plugin-card-identity {
    width: 100%;
  }
}
</style>
