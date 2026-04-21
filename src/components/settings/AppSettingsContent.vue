<script setup lang="ts">
import { computed } from 'vue'

import { useAppSettings } from '@/composables/useAppSettings'
import { uiMessages } from '@/messages/ui'

import CacheManager from '../CacheManager.vue'

type SettingsSurface = 'dialog' | 'workspace'

const props = withDefaults(
  defineProps<{
    surface?: SettingsSurface
  }>(),
  {
    surface: 'workspace'
  }
)

const {
  playerStore,
  isElectron,
  smtcEnabled,
  setBrandPlacement,
  setDockedPlayerBarLayout,
  setSMTCEnabled,
  setRenderStyle,
  isBrandPlacementActive,
  isRenderStyleActive,
  isDockedPlayerBarLayoutActive
} = useAppSettings()

const contentClassName = computed(() => `surface-${props.surface}`)
const fieldIdPrefix = computed(() => `app-settings-${props.surface}`)

function handleSMTCEnabledChange(event: Event): void {
  setSMTCEnabled((event.target as HTMLInputElement).checked)
}
</script>

<template>
  <div class="app-settings-content" :class="contentClassName">
    <section class="settings-section">
      <div class="settings-section-header">
        <h3>{{ uiMessages.settings.sections.playback }}</h3>
      </div>
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
    </section>

    <section class="settings-section">
      <div class="settings-section-header">
        <h3>{{ uiMessages.settings.sections.lyrics }}</h3>
      </div>
      <div class="setting-item">
        <label :for="`${fieldIdPrefix}-lyric-trans`">
          {{ uiMessages.settings.fields.showTranslation }}
        </label>
        <input
          :id="`${fieldIdPrefix}-lyric-trans`"
          type="checkbox"
          :checked="playerStore.lyricType.includes('trans')"
          @change="playerStore.toggleLyricType('trans')"
        />
      </div>
      <div class="setting-item">
        <label :for="`${fieldIdPrefix}-lyric-roma`">
          {{ uiMessages.settings.fields.showRomanizedLyrics }}
        </label>
        <input
          :id="`${fieldIdPrefix}-lyric-roma`"
          type="checkbox"
          :checked="playerStore.lyricType.includes('roma')"
          @change="playerStore.toggleLyricType('roma')"
        />
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-section-header">
        <h3>{{ uiMessages.settings.sections.appearance }}</h3>
      </div>
      <div class="setting-stack">
        <div class="setting-stack-block">
          <span class="setting-label">{{ uiMessages.settings.fields.renderStyle }}</span>
          <div
            class="placement-switch"
            role="group"
            :aria-label="uiMessages.settings.fields.renderStyle"
          >
            <button
              type="button"
              class="placement-option"
              :class="{ active: isRenderStyleActive('classic') }"
              @click="setRenderStyle('classic')"
            >
              {{ uiMessages.settings.options.renderStyle.classic }}
            </button>
            <button
              type="button"
              class="placement-option"
              :class="{ active: isRenderStyleActive('brand') }"
              @click="setRenderStyle('brand')"
            >
              {{ uiMessages.settings.options.renderStyle.brand }}
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
    </section>

    <section v-if="isElectron" class="settings-section">
      <div class="settings-section-header">
        <h3>{{ uiMessages.settings.sections.experimental }}</h3>
      </div>
      <div class="setting-item">
        <label :for="`${fieldIdPrefix}-experimental-smtc-toggle`">
          {{ uiMessages.settings.fields.smtc }}
        </label>
        <input
          :id="`${fieldIdPrefix}-experimental-smtc-toggle`"
          :aria-label="uiMessages.settings.fields.smtc"
          type="checkbox"
          :checked="smtcEnabled"
          @change="handleSMTCEnabledChange"
        />
      </div>
    </section>

    <CacheManager />
  </div>
</template>

<style scoped>
.app-settings-content {
  display: grid;
  gap: 12px;
}

.settings-section {
  padding: 14px;
  background: var(--bg-secondary, #f5f5f5);
  border: 2px solid var(--black);
}

.surface-dialog .settings-section {
  padding: 14px;
}

.surface-dialog .settings-section h3,
.surface-workspace .settings-section h3 {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.settings-section > * + * {
  margin-top: 12px;
}

.settings-section-header {
  margin: 0 0 12px;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  background: var(--bg, #fff);
  border: 1px solid var(--gray-light, #ddd);
}

.surface-dialog .setting-item label,
.surface-workspace .setting-item label {
  flex: 1;
  color: var(--black);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}

.setting-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.placement-switch {
  display: inline-flex;
  align-self: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.setting-stack-block {
  padding: 10px;
  background: var(--bg, #fff);
  border: 1px solid var(--gray-light, #ddd);
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

.placement-option {
  min-width: 76px;
  padding: 7px 10px;
  border: 1px solid var(--gray-light, #ddd);
  background: var(--white);
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
  background: var(--black);
  color: var(--white);
}

.placement-option:hover {
  border-color: var(--black);
}

.surface-dialog .setting-select,
.surface-workspace .setting-select {
  padding: 6px 10px;
  border: 1px solid var(--gray-light, #ddd);
  background: var(--white);
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

.setting-item input[type='checkbox'] {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
}
</style>
