<script setup lang="ts">
import { computed } from 'vue'
import type { PluginSettingDefinition } from '@plugin-sdk'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { uiMessages } from '@/messages/ui'

const AUDIO_OUTPUT_PLUGIN_ID = 'builtin.audio-output'

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

const visibleSettingsSchema = computed(() =>
  props.settingsSchema.filter(setting => isSettingVisible(setting.key))
)

function getAudioOutputMode(): string {
  const mode = props.settingValues.mode
  return typeof mode === 'string' ? mode : 'shared'
}

function isAudioOutputBitPerfectRequired(): boolean {
  return props.settingValues.bitPerfectRequired === true
}

function isAudioOutputDspEnabled(): boolean {
  return props.settingValues.dspEnabled === true
}

function isSettingVisible(key: string): boolean {
  if (props.platformId !== AUDIO_OUTPUT_PLUGIN_ID) {
    return true
  }

  const mode = getAudioOutputMode()

  switch (key) {
    case 'mode':
      return true
    case 'sharedDeviceId':
      return true
    case 'deviceId':
      return mode === 'shared' || mode === 'exclusive' || mode === 'voicemeeter'
    case 'bufferFrames':
      return mode === 'exclusive'
    case 'diagnosticsEnabled':
      return true
    case 'fallbackToShared':
      return mode === 'exclusive'
    case 'bitPerfectRequired':
      return mode === 'exclusive'
    case 'dspEnabled':
      return !isAudioOutputBitPerfectRequired()
    case 'dspHeadroomDb':
      return !isAudioOutputBitPerfectRequired() && isAudioOutputDspEnabled()
    case 'voicemeeterBus':
    case 'voicemeeterHardwareOutBus':
    case 'voicemeeterHardwareOutDriver':
    case 'voicemeeterHardwareOutDevice':
      return mode === 'voicemeeter'
    default:
      return true
  }
}

function settingInputId(key: string): string {
  return `plugin-setting-${props.platformId}-${key}`
}

function settingTextValue(key: string): string {
  const value = props.settingValues[key]
  return value == null ? '' : String(value)
}

function handleBooleanValue(key: string, value: boolean): void {
  emit('update-setting', key, value)
}

function handleTextInput(key: string, event: Event): void {
  const target = event.target as { value?: unknown } | null
  const value = typeof target?.value === 'string' ? target.value : ''
  emit('update-setting', key, value)
}

function handleTextValue(key: string, value: string | undefined): void {
  emit('update-setting', key, value ?? '')
}
</script>

<template>
  <div class="plugin-settings">
    <div v-for="setting in visibleSettingsSchema" :key="setting.key" class="plugin-setting-row">
      <label :for="settingInputId(setting.key)">{{ setting.label }}</label>

      <div v-if="setting.type === 'boolean'" class="plugin-toggle">
        <Switch
          :id="settingInputId(setting.key)"
          :model-value="Boolean(settingValues[setting.key])"
          :aria-label="setting.label"
          @update:model-value="handleBooleanValue(setting.key, $event)"
        />
      </div>

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

      <Input
        v-else
        :id="settingInputId(setting.key)"
        :model-value="settingTextValue(setting.key)"
        class="plugin-setting-text"
        type="text"
        @update:model-value="handleTextValue(setting.key, $event)"
      />
    </div>

    <div class="plugin-settings-footer">
      <Button
        type="button"
        size="sm"
        :disabled="isSaving"
        @click="emit('save')"
      >
        {{ isSaving ? '保存中...' : uiMessages.settings.actions.saveSettings }}
      </Button>
      <Button type="button" variant="outline" size="sm" @click="emit('cancel')">
        取消
      </Button>
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
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
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

  .plugin-setting-select {
    width: 100%;
  }
}
</style>
