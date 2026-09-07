<script setup lang="ts">
import { useExperimentalFeatures } from '@/composables/useExperimentalFeatures'
import { Switch } from '@/components/ui/switch'
import { uiMessages } from '@/messages/ui'

import AppSettingsControlRow from './AppSettingsControlRow.vue'
import AppSettingsSectionShell from './AppSettingsSectionShell.vue'

defineProps<{
  fieldIdPrefix: string
}>()

const { waveformEnabled, setWaveformEnabled } = useExperimentalFeatures()
</script>

<template>
  <AppSettingsSectionShell :title="uiMessages.settings.sections.experimental">
    <AppSettingsControlRow
      :label="uiMessages.settings.fields.waveform"
      :for-id="`${fieldIdPrefix}-experimental-waveform-toggle`"
    >
      <div class="flex justify-start">
        <Switch
          :id="`${fieldIdPrefix}-experimental-waveform-toggle`"
          :model-value="waveformEnabled"
          :aria-label="uiMessages.settings.fields.waveform"
          @update:model-value="setWaveformEnabled"
        />
      </div>
    </AppSettingsControlRow>
  </AppSettingsSectionShell>
</template>
