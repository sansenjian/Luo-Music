<script setup lang="ts">
import { useDockedPlayerBarLayout } from '@/composables/useDockedPlayerBarLayout'
import { useProjectUi } from '@/composables/useProjectUi'
import { useHomeBrandPlacement } from '@/features/home'
import { uiMessages } from '@/messages/ui'

import AppSettingsSectionShell from './AppSettingsSectionShell.vue'

const { brandPlacement, setBrandPlacement } = useHomeBrandPlacement()
const { dockedPlayerBarLayout, setDockedPlayerBarLayout } = useDockedPlayerBarLayout()
const { setRenderStyle, availableRenderStyleOptions, isRenderStyleActive } = useProjectUi()

function isBrandPlacementActive(placement: 'header' | 'sidebar'): boolean {
  return brandPlacement.value === placement
}

function isDockedPlayerBarLayoutActive(layout: 'full' | 'with-sidebar'): boolean {
  return dockedPlayerBarLayout.value === layout
}
</script>

<template>
  <AppSettingsSectionShell :title="uiMessages.settings.sections.appearance">
    <div class="setting-stack">
      <div class="setting-stack-block">
        <span class="setting-label">{{ uiMessages.settings.fields.renderStyle }}</span>
        <div
          class="placement-switch"
          role="group"
          :aria-label="uiMessages.settings.fields.renderStyle"
        >
          <button
            v-for="option in availableRenderStyleOptions"
            :key="option.value"
            type="button"
            class="placement-option"
            :class="{ active: isRenderStyleActive(option.value) }"
            @click="setRenderStyle(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="setting-stack-block">
        <span class="setting-label">{{ uiMessages.settings.fields.brandPlacement }}</span>
        <div
          class="placement-switch"
          role="group"
          :aria-label="uiMessages.settings.fields.brandPlacement"
        >
          <button
            type="button"
            class="placement-option"
            :class="{ active: isBrandPlacementActive('header') }"
            @click="setBrandPlacement('header')"
          >
            {{ uiMessages.settings.options.brandPlacement.header }}
          </button>
          <button
            type="button"
            class="placement-option"
            :class="{ active: isBrandPlacementActive('sidebar') }"
            @click="setBrandPlacement('sidebar')"
          >
            {{ uiMessages.settings.options.brandPlacement.sidebar }}
          </button>
        </div>
      </div>

      <div class="setting-stack-block">
        <span class="setting-label">{{ uiMessages.settings.fields.dockedPlayerLayout }}</span>
        <div
          class="placement-switch"
          role="group"
          :aria-label="uiMessages.settings.fields.dockedPlayerLayout"
        >
          <button
            type="button"
            class="placement-option"
            :class="{ active: isDockedPlayerBarLayoutActive('full') }"
            @click="setDockedPlayerBarLayout('full')"
          >
            {{ uiMessages.settings.options.dockedPlayerLayout.full }}
          </button>
          <button
            type="button"
            class="placement-option"
            :class="{ active: isDockedPlayerBarLayoutActive('with-sidebar') }"
            @click="setDockedPlayerBarLayout('with-sidebar')"
          >
            {{ uiMessages.settings.options.dockedPlayerLayout.withSidebar }}
          </button>
        </div>
      </div>
    </div>
  </AppSettingsSectionShell>
</template>

<style scoped>
.setting-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setting-stack-block {
  padding: 10px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
}

.setting-stack-block > * + * {
  margin-top: 8px;
}

.setting-label {
  display: block;
  color: var(--gray, #666);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.placement-switch {
  display: inline-flex;
  align-self: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.placement-option {
  min-width: 76px;
  padding: 7px 10px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-control-radius);
  background: var(--ui-control-bg);
  color: var(--black);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease;
}

.placement-option.active {
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
  box-shadow: var(--ui-primary-shadow);
}

.placement-option:hover {
  border-color: var(--ui-focus-border);
}
</style>
