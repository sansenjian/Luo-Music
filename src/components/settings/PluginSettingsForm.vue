<script setup lang="ts">
import type { PluginSettingDefinition } from '@plugin-sdk'

import { uiMessages } from '@/messages/ui'

const props = defineProps<{
  platformId: string
  settingsSchema: PluginSettingDefinition[]
  settingValues: Record<string, unknown>
  isSaving: boolean
}>()

const emit = defineEmits<{
  save: []
  cancel: []
  'update-setting': [key: string, value: unknown]
}>()

function settingInputId(key: string): string {
  return `plugin-setting-${props.platformId}-${key}`
}

function settingTextValue(key: string): string {
  const value = props.settingValues[key]
  return value == null ? '' : String(value)
}

function handleBooleanInput(key: string, event: Event): void {
  const target = event.target
  emit('update-setting', key, target instanceof HTMLInputElement ? target.checked : false)
}

function handleTextInput(key: string, event: Event): void {
  const target = event.target as { value?: unknown } | null
  const value = typeof target?.value === 'string' ? target.value : ''
  emit('update-setting', key, value)
}
</script>

<template>
  <div class="plugin-settings">
    <div v-for="setting in settingsSchema" :key="setting.key" class="plugin-setting-row">
      <label :for="settingInputId(setting.key)">{{ setting.label }}</label>

      <label v-if="setting.type === 'boolean'" class="plugin-toggle">
        <input
          :id="settingInputId(setting.key)"
          type="checkbox"
          :checked="Boolean(settingValues[setting.key])"
          @change="handleBooleanInput(setting.key, $event)"
        />
        <span class="plugin-toggle-track" />
      </label>

      <select
        v-else-if="setting.type === 'select'"
        :id="settingInputId(setting.key)"
        :value="settingTextValue(setting.key)"
        class="plugin-setting-select"
        @change="handleTextInput(setting.key, $event)"
      >
        <option v-for="option in setting.options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>

      <input
        v-else
        :id="settingInputId(setting.key)"
        type="text"
        :value="settingTextValue(setting.key)"
        class="plugin-setting-text"
        @input="handleTextInput(setting.key, $event)"
      />
    </div>

    <div class="plugin-settings-footer">
      <button
        type="button"
        class="plugin-pill plugin-pill-primary"
        :disabled="isSaving"
        @click="emit('save')"
      >
        {{ isSaving ? '保存中...' : uiMessages.settings.actions.saveSettings }}
      </button>
      <button type="button" class="plugin-pill plugin-pill-ghost" @click="emit('cancel')">
        取消
      </button>
    </div>
  </div>
</template>

<style scoped>
.plugin-settings {
  padding: 14px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
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
  background: var(--ui-border-subtle);
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
  background: var(--ui-surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s ease;
}

.plugin-toggle input:checked + .plugin-toggle-track {
  background: var(--ui-primary-bg);
}

.plugin-toggle input:checked + .plugin-toggle-track::after {
  transform: translateX(18px);
}

.plugin-setting-text,
.plugin-setting-select {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-control-radius);
  background: var(--ui-control-bg);
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
  border-color: var(--ui-focus-border);
}

.plugin-settings-footer {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  padding-top: 10px;
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

.plugin-pill-primary {
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
  box-shadow: var(--ui-primary-shadow);
}

.plugin-pill-primary:hover:not(:disabled) {
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

.plugin-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

@media (max-width: 640px) {
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
