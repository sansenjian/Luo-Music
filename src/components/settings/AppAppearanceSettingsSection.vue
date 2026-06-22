<script setup lang="ts">
import { useDockedPlayerBarLayout } from '@/composables/useDockedPlayerBarLayout'
import { useProjectUi } from '@/composables/useProjectUi'
import { Button } from '@/components/ui/button'
import { useHomeBrandPlacement } from '@/features/home'
import { uiMessages } from '@/messages/ui'

import AppSettingsControlRow from './AppSettingsControlRow.vue'
import AppSettingsSectionShell from './AppSettingsSectionShell.vue'

const { brandPlacement, setBrandPlacement } = useHomeBrandPlacement()
const { dockedPlayerBarLayout, setDockedPlayerBarLayout } = useDockedPlayerBarLayout()
const { setRenderStyle, availableRenderStyleOptions, isRenderStyleActive } = useProjectUi()

const brandPlacementOptions = [
  {
    value: 'header',
    label: uiMessages.settings.options.brandPlacement.header
  },
  {
    value: 'sidebar',
    label: uiMessages.settings.options.brandPlacement.sidebar
  }
] as const

const dockedPlayerLayoutOptions = [
  {
    value: 'full',
    label: uiMessages.settings.options.dockedPlayerLayout.full
  },
  {
    value: 'with-sidebar',
    label: uiMessages.settings.options.dockedPlayerLayout.withSidebar
  }
] as const

function isBrandPlacementActive(placement: 'header' | 'sidebar'): boolean {
  return brandPlacement.value === placement
}

function isDockedPlayerBarLayoutActive(layout: 'full' | 'with-sidebar'): boolean {
  return dockedPlayerBarLayout.value === layout
}
</script>

<template>
  <AppSettingsSectionShell :title="uiMessages.settings.sections.appearance">
    <div class="setting-stack grid gap-3">
      <AppSettingsControlRow :label="uiMessages.settings.fields.renderStyle">
        <div
          class="placement-switch inline-flex min-w-0 flex-wrap gap-2"
          role="group"
          :aria-label="uiMessages.settings.fields.renderStyle"
        >
          <Button
            v-for="option in availableRenderStyleOptions"
            :key="option.value"
            type="button"
            size="sm"
            :variant="isRenderStyleActive(option.value) ? 'default' : 'outline'"
            class="placement-option min-w-[76px] uppercase tracking-normal"
            :class="{ active: isRenderStyleActive(option.value) }"
            @click="setRenderStyle(option.value)"
          >
            {{ option.label }}
          </Button>
        </div>
      </AppSettingsControlRow>

      <AppSettingsControlRow :label="uiMessages.settings.fields.brandPlacement">
        <div
          class="placement-switch inline-flex min-w-0 flex-wrap gap-2"
          role="group"
          :aria-label="uiMessages.settings.fields.brandPlacement"
        >
          <Button
            v-for="option in brandPlacementOptions"
            :key="option.value"
            type="button"
            size="sm"
            :variant="isBrandPlacementActive(option.value) ? 'default' : 'outline'"
            class="placement-option min-w-[76px] uppercase tracking-normal"
            :class="{ active: isBrandPlacementActive(option.value) }"
            @click="setBrandPlacement(option.value)"
          >
            {{ option.label }}
          </Button>
        </div>
      </AppSettingsControlRow>

      <AppSettingsControlRow :label="uiMessages.settings.fields.dockedPlayerLayout">
        <div
          class="placement-switch inline-flex min-w-0 flex-wrap gap-2"
          role="group"
          :aria-label="uiMessages.settings.fields.dockedPlayerLayout"
        >
          <Button
            v-for="option in dockedPlayerLayoutOptions"
            :key="option.value"
            type="button"
            size="sm"
            :variant="isDockedPlayerBarLayoutActive(option.value) ? 'default' : 'outline'"
            class="placement-option min-w-[104px] uppercase tracking-normal"
            :class="{ active: isDockedPlayerBarLayoutActive(option.value) }"
            @click="setDockedPlayerBarLayout(option.value)"
          >
            {{ option.label }}
          </Button>
        </div>
      </AppSettingsControlRow>
    </div>
  </AppSettingsSectionShell>
</template>
