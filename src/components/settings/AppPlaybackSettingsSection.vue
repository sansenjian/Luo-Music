<script setup lang="ts">
import { uiMessages } from '@/messages/ui'
import { usePlayerStore } from '@/store/playerStore'

import AppSettingsSectionShell from './AppSettingsSectionShell.vue'

defineProps<{
  fieldIdPrefix: string
}>()

const playerStore = usePlayerStore()
</script>

<template>
  <AppSettingsSectionShell :title="uiMessages.settings.sections.playback">
    <div class="setting-item">
      <label :for="`${fieldIdPrefix}-play-mode`">{{ uiMessages.settings.fields.playMode }}</label>
      <select
        :id="`${fieldIdPrefix}-play-mode`"
        v-model="playerStore.playMode"
        class="setting-select"
      >
        <option :value="0">{{ uiMessages.settings.options.playMode.sequential }}</option>
        <option :value="1">{{ uiMessages.settings.options.playMode.loop }}</option>
        <option :value="2">{{ uiMessages.settings.options.playMode.single }}</option>
        <option :value="3">{{ uiMessages.settings.options.playMode.shuffle }}</option>
      </select>
    </div>
    <div class="setting-item">
      <label :for="`${fieldIdPrefix}-volume`">{{ uiMessages.settings.fields.volume }}</label>
      <input
        :id="`${fieldIdPrefix}-volume`"
        v-model.number="playerStore.volume"
        type="range"
        min="0"
        max="1"
        step="0.01"
        class="setting-range"
        :aria-label="uiMessages.settings.fields.volume"
      />
      <span class="volume-value">{{ Math.round(playerStore.volume * 100) }}%</span>
    </div>
  </AppSettingsSectionShell>
</template>

<style scoped>
.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
}

.setting-item label {
  flex: 1;
  color: var(--black);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}

.setting-select {
  padding: 6px 10px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-control-radius);
  background: var(--ui-control-bg);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.setting-range {
  width: 108px;
}

.volume-value {
  min-width: 42px;
  color: var(--gray);
  font-size: 11px;
  font-weight: 600;
}
</style>
