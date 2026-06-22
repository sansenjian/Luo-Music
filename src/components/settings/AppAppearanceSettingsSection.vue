<script setup lang="ts">
import { useDockedPlayerBarLayout } from '@/composables/useDockedPlayerBarLayout'
import { useProjectUi } from '@/composables/useProjectUi'
import { Button } from '@/components/ui/button'
import { useHomeBrandPlacement } from '@/features/home'
import { uiMessages } from '@/messages/ui'

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
      <fieldset class="setting-stack-block rounded-md border border-border bg-card p-3 shadow-sm">
        <legend class="setting-label px-1 text-xs font-semibold uppercase text-muted-foreground">
          {{ uiMessages.settings.fields.renderStyle }}
        </legend>
        <div
          class="placement-switch inline-flex flex-wrap gap-2"
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
      </fieldset>

      <fieldset class="setting-stack-block rounded-md border border-border bg-card p-3 shadow-sm">
        <legend class="setting-label px-1 text-xs font-semibold uppercase text-muted-foreground">
          {{ uiMessages.settings.fields.brandPlacement }}
        </legend>
        <div
          class="placement-switch inline-flex flex-wrap gap-2"
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
      </fieldset>

      <fieldset class="setting-stack-block rounded-md border border-border bg-card p-3 shadow-sm">
        <legend class="setting-label px-1 text-xs font-semibold uppercase text-muted-foreground">
          {{ uiMessages.settings.fields.dockedPlayerLayout }}
        </legend>
        <div
          class="placement-switch inline-flex flex-wrap gap-2"
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
      </fieldset>
    </div>
  </AppSettingsSectionShell>
</template>
