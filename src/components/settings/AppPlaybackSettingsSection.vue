<script setup lang="ts">
import { computed } from 'vue'

import { Button } from '@/components/ui/button'
import { uiMessages } from '@/messages/ui'
import { usePlayerStore } from '@/store/playerStore'
import type { StorePlayMode } from '@/store/player/playerPersistence'

import AppSettingsControlRow from './AppSettingsControlRow.vue'
import AppSettingsSectionShell from './AppSettingsSectionShell.vue'

defineProps<{
  fieldIdPrefix: string
}>()

const playerStore = usePlayerStore()

const playModeOptions = [
  {
    value: 0,
    label: uiMessages.settings.options.playMode.sequential
  },
  {
    value: 1,
    label: uiMessages.settings.options.playMode.loop
  },
  {
    value: 2,
    label: uiMessages.settings.options.playMode.single
  },
  {
    value: 3,
    label: uiMessages.settings.options.playMode.shuffle
  }
] as const

const volumePercent = computed(() => Math.round(playerStore.volume * 100))

function isPlayModeActive(mode: StorePlayMode): boolean {
  return playerStore.playMode === mode
}

function handleVolumeInput(event: Event): void {
  playerStore.setVolume(Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <AppSettingsSectionShell :title="uiMessages.settings.sections.playback">
    <div class="grid gap-3">
      <AppSettingsControlRow :label="uiMessages.settings.fields.playMode">
        <div
          class="setting-play-mode-options grid min-w-0 grid-cols-[repeat(auto-fit,minmax(92px,1fr))] gap-2"
          role="group"
          :aria-label="uiMessages.settings.fields.playMode"
        >
          <Button
            v-for="option in playModeOptions"
            :key="option.value"
            type="button"
            size="sm"
            :variant="isPlayModeActive(option.value) ? 'default' : 'outline'"
            class="setting-play-mode-option min-w-0"
            :class="{ active: isPlayModeActive(option.value) }"
            @click="playerStore.setPlayMode(option.value)"
          >
            {{ option.label }}
          </Button>
        </div>
      </AppSettingsControlRow>

      <AppSettingsControlRow
        :label="uiMessages.settings.fields.volume"
        :for-id="`${fieldIdPrefix}-volume`"
      >
        <template #meta>
          <span class="min-w-[42px] text-right text-xs font-semibold text-muted-foreground">
            {{ volumePercent }}%
          </span>
        </template>
        <input
          :id="`${fieldIdPrefix}-volume`"
          :value="playerStore.volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          class="h-2 w-full cursor-pointer accent-[var(--ui-primary-color)]"
          :aria-label="uiMessages.settings.fields.volume"
          @input="handleVolumeInput"
        />
      </AppSettingsControlRow>
      <select
        :id="`${fieldIdPrefix}-play-mode`"
        :value="playerStore.playMode"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
      >
        <option v-for="option in playModeOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>
  </AppSettingsSectionShell>
</template>
