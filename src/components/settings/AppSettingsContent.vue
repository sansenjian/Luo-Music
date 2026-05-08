<script setup lang="ts">
import { computed } from 'vue'

import { useAppSettings } from '@/composables/useAppSettings'

import CacheManager from '@/components/CacheManager.vue'

import AppAppearanceSettingsSection from './AppAppearanceSettingsSection.vue'
import AppDesktopLyricSettingsSection from './AppDesktopLyricSettingsSection.vue'
import AppExperimentalSettingsSection from './AppExperimentalSettingsSection.vue'
import AppPlaybackSettingsSection from './AppPlaybackSettingsSection.vue'

type SettingsSurface = 'dialog' | 'workspace'

const props = withDefaults(
  defineProps<{
    surface?: SettingsSurface
  }>(),
  {
    surface: 'workspace'
  }
)

const { isElectron } = useAppSettings()

const contentClassName = computed(() => `surface-${props.surface}`)
const fieldIdPrefix = computed(() => `app-settings-${props.surface}`)
</script>

<template>
  <div class="app-settings-content" :class="contentClassName">
    <AppPlaybackSettingsSection :field-id-prefix="fieldIdPrefix" />
    <AppDesktopLyricSettingsSection :field-id-prefix="fieldIdPrefix" />
    <AppAppearanceSettingsSection />
    <AppExperimentalSettingsSection :field-id-prefix="fieldIdPrefix" />

    <CacheManager v-if="isElectron" />
  </div>
</template>

<style scoped>
.app-settings-content {
  display: grid;
  gap: 12px;
}
</style>
