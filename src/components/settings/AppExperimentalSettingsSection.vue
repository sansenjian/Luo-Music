<script setup lang="ts">
import { useExperimentalFeatures } from '@/composables/useExperimentalFeatures'
import { uiMessages } from '@/messages/ui'

import AppSettingsSectionShell from './AppSettingsSectionShell.vue'

defineProps<{
  fieldIdPrefix: string
}>()

const { waveformEnabled, setWaveformEnabled } = useExperimentalFeatures()

function handleWaveformEnabledChange(event: Event): void {
  setWaveformEnabled((event.target as HTMLInputElement).checked)
}
</script>

<template>
  <AppSettingsSectionShell :title="uiMessages.settings.sections.experimental">
    <div class="setting-item">
      <label :for="`${fieldIdPrefix}-experimental-waveform-toggle`">
        {{ uiMessages.settings.fields.waveform }}
      </label>
      <input
        :id="`${fieldIdPrefix}-experimental-waveform-toggle`"
        :aria-label="uiMessages.settings.fields.waveform"
        type="checkbox"
        :checked="waveformEnabled"
        @change="handleWaveformEnabledChange"
      />
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

.setting-item input[type='checkbox'] {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
}
</style>
