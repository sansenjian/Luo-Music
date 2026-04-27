<script setup lang="ts">
import { computed } from 'vue'

import { useAppSettings } from '@/composables/useAppSettings'
import { useDesktopLyricSettings } from '@/composables/useDesktopLyricSettings'
import { uiMessages } from '@/messages/ui'
import {
  DESKTOP_LYRIC_ALIGN_OPTIONS,
  DESKTOP_LYRIC_COLOR_PRESET_OPTIONS,
  DESKTOP_LYRIC_FLOW_OPTIONS,
  DESKTOP_LYRIC_FONT_OPTIONS,
  DESKTOP_LYRIC_FONT_SIZE_OPTIONS,
  DESKTOP_LYRIC_FONT_WEIGHT_OPTIONS,
  DESKTOP_LYRIC_LINE_MODE_OPTIONS,
  DESKTOP_LYRIC_PREVIEW,
  DESKTOP_LYRIC_STROKE_OPTIONS,
  resolveDesktopLyricAlignItems,
  resolveDesktopLyricFontWeight,
  resolveDesktopLyricLineClamp,
  resolveDesktopLyricWritingMode
} from '@/utils/player/desktopLyricSettings'

import CacheManager from '@/components/CacheManager.vue'

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
  waveformEnabled,
  setBrandPlacement,
  setDockedPlayerBarLayout,
  setWaveformEnabled,
  setRenderStyle,
  isBrandPlacementActive,
  isRenderStyleActive,
  isDockedPlayerBarLayoutActive
} = useAppSettings()
const {
  desktopLyricSettings,
  setLyricSetting,
  setLyricColorPreset,
  toggleDesktopLyricEnabled,
  setDesktopLyricOnTop
} = useDesktopLyricSettings()

const contentClassName = computed(() => `surface-${props.surface}`)
const fieldIdPrefix = computed(() => `app-settings-${props.surface}`)

function handleWaveformEnabledChange(event: Event): void {
  setWaveformEnabled((event.target as HTMLInputElement).checked)
}

function handleDesktopLyricEnabledChange(event: Event): void {
  void toggleDesktopLyricEnabled((event.target as HTMLInputElement).checked)
}

function handleDesktopLyricAlwaysOnTopChange(event: Event): void {
  void setDesktopLyricOnTop((event.target as HTMLInputElement).checked)
}

function handleDesktopLyricBooleanChange(
  key: 'showTranslation' | 'showRomanizedLyrics',
  event: Event
): void {
  void setLyricSetting(key, (event.target as HTMLInputElement).checked)
}

function handleDesktopLyricSelectChange(
  key:
    | 'lyricFontFamily'
    | 'lyricFontSize'
    | 'lyricFontWeight'
    | 'lyricStrokeStyle'
    | 'lyricLineMode'
    | 'lyricFlowDirection'
    | 'lyricTextAlign',
  event: Event
): void {
  const target = event.target as HTMLSelectElement
  const nextValue = key === 'lyricFontSize' ? Number(target.value) : target.value
  void setLyricSetting(key, nextValue as never)
}

function handleDesktopLyricPresetChange(event: Event): void {
  const target = event.target as HTMLSelectElement
  void setLyricColorPreset(target.value as typeof desktopLyricSettings.value.lyricColorPreset)
}

function handleDesktopLyricColorChange(
  key: 'lyricPlayedColor' | 'lyricUnplayedColor',
  event: Event
): void {
  void setLyricSetting(key, (event.target as HTMLInputElement).value)
}

const desktopLyricPreviewStyle = computed(() => {
  const config = desktopLyricSettings.value
  const weights = resolveDesktopLyricFontWeight(config.lyricFontWeight)
  const isOutline = config.lyricStrokeStyle === 'outline'
  const { writingMode, textOrientation } = resolveDesktopLyricWritingMode(config.lyricFlowDirection)

  return {
    '--desktop-preview-font-family': config.lyricFontFamily,
    '--desktop-preview-main-size': `${config.lyricFontSize}px`,
    '--desktop-preview-sub-size': `${Math.max(16, Math.round(config.lyricFontSize * 0.5))}px`,
    '--desktop-preview-main-weight': String(weights.main),
    '--desktop-preview-sub-weight': String(weights.sub),
    '--desktop-preview-played-color': config.lyricPlayedColor,
    '--desktop-preview-unplayed-color': config.lyricUnplayedColor,
    '--desktop-preview-main-stroke': isOutline ? '2px rgba(10, 10, 10, 0.9)' : '0px transparent',
    '--desktop-preview-sub-stroke': isOutline ? '1px rgba(255, 255, 255, 0.9)' : '0px transparent',
    '--desktop-preview-main-shadow': isOutline ? '4px 4px 0 rgba(10, 10, 10, 0.88)' : 'none',
    '--desktop-preview-sub-shadow': isOutline ? '2px 2px 0 rgba(255, 255, 255, 0.92)' : 'none',
    '--desktop-preview-line-clamp': String(resolveDesktopLyricLineClamp(config.lyricLineMode)),
    '--desktop-preview-writing-mode': writingMode,
    '--desktop-preview-text-orientation': textOrientation,
    '--desktop-preview-text-align': config.lyricTextAlign,
    '--desktop-preview-align-items': resolveDesktopLyricAlignItems(config.lyricTextAlign)
  }
})
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
      <template v-if="isElectron">
        <div class="desktop-lyric-switches">
          <label class="toggle-chip" :for="`${fieldIdPrefix}-desktop-lyric-enabled`">
            <input
              :id="`${fieldIdPrefix}-desktop-lyric-enabled`"
              type="checkbox"
              :checked="desktopLyricSettings.enableDesktopLyric"
              @change="handleDesktopLyricEnabledChange"
            />
            <span>{{ uiMessages.settings.fields.enableDesktopLyric }}</span>
          </label>

          <label class="toggle-chip" :for="`${fieldIdPrefix}-desktop-lyric-topmost`">
            <input
              :id="`${fieldIdPrefix}-desktop-lyric-topmost`"
              type="checkbox"
              :checked="desktopLyricSettings.alwaysOnTop"
              @change="handleDesktopLyricAlwaysOnTopChange"
            />
            <span>{{ uiMessages.settings.fields.desktopLyricAlwaysOnTop }}</span>
          </label>

          <label class="toggle-chip" :for="`${fieldIdPrefix}-desktop-lyric-translation`">
            <input
              :id="`${fieldIdPrefix}-desktop-lyric-translation`"
              type="checkbox"
              :checked="desktopLyricSettings.showTranslation"
              @change="handleDesktopLyricBooleanChange('showTranslation', $event)"
            />
            <span>{{ uiMessages.settings.fields.showTranslation }}</span>
          </label>

          <label class="toggle-chip" :for="`${fieldIdPrefix}-desktop-lyric-romanized`">
            <input
              :id="`${fieldIdPrefix}-desktop-lyric-romanized`"
              type="checkbox"
              :checked="desktopLyricSettings.showRomanizedLyrics"
              @change="handleDesktopLyricBooleanChange('showRomanizedLyrics', $event)"
            />
            <span>{{ uiMessages.settings.fields.showRomanizedLyrics }}</span>
          </label>
        </div>

        <div class="desktop-lyric-settings-grid">
          <label class="desktop-lyric-field">
            <span>{{ uiMessages.settings.fields.lyricFont }}</span>
            <select
              class="desktop-lyric-select"
              :value="desktopLyricSettings.lyricFontFamily"
              @change="handleDesktopLyricSelectChange('lyricFontFamily', $event)"
            >
              <option
                v-for="option in DESKTOP_LYRIC_FONT_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="desktop-lyric-field">
            <span>{{ uiMessages.settings.fields.lyricFontSize }}</span>
            <select
              class="desktop-lyric-select"
              :value="desktopLyricSettings.lyricFontSize"
              @change="handleDesktopLyricSelectChange('lyricFontSize', $event)"
            >
              <option v-for="size in DESKTOP_LYRIC_FONT_SIZE_OPTIONS" :key="size" :value="size">
                {{ size }}
              </option>
            </select>
          </label>

          <label class="desktop-lyric-field">
            <span>{{ uiMessages.settings.fields.lyricFontWeight }}</span>
            <select
              class="desktop-lyric-select"
              :value="desktopLyricSettings.lyricFontWeight"
              @change="handleDesktopLyricSelectChange('lyricFontWeight', $event)"
            >
              <option
                v-for="option in DESKTOP_LYRIC_FONT_WEIGHT_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="desktop-lyric-field">
            <span>{{ uiMessages.settings.fields.lyricStrokeStyle }}</span>
            <select
              class="desktop-lyric-select"
              :value="desktopLyricSettings.lyricStrokeStyle"
              @change="handleDesktopLyricSelectChange('lyricStrokeStyle', $event)"
            >
              <option
                v-for="option in DESKTOP_LYRIC_STROKE_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="desktop-lyric-field">
            <span>{{ uiMessages.settings.fields.lyricLineMode }}</span>
            <select
              class="desktop-lyric-select"
              :value="desktopLyricSettings.lyricLineMode"
              @change="handleDesktopLyricSelectChange('lyricLineMode', $event)"
            >
              <option
                v-for="option in DESKTOP_LYRIC_LINE_MODE_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="desktop-lyric-field">
            <span>{{ uiMessages.settings.fields.lyricFlowDirection }}</span>
            <select
              class="desktop-lyric-select"
              :value="desktopLyricSettings.lyricFlowDirection"
              @change="handleDesktopLyricSelectChange('lyricFlowDirection', $event)"
            >
              <option
                v-for="option in DESKTOP_LYRIC_FLOW_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="desktop-lyric-field">
            <span>{{ uiMessages.settings.fields.lyricTextAlign }}</span>
            <select
              class="desktop-lyric-select"
              :value="desktopLyricSettings.lyricTextAlign"
              @change="handleDesktopLyricSelectChange('lyricTextAlign', $event)"
            >
              <option
                v-for="option in DESKTOP_LYRIC_ALIGN_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>

        <div class="desktop-lyric-section-block">
          <span class="setting-label">{{ uiMessages.settings.fields.lyricColorPreset }}</span>
          <div class="desktop-lyric-color-row">
            <label class="desktop-lyric-field preset-field">
              <select
                class="desktop-lyric-select"
                :value="desktopLyricSettings.lyricColorPreset"
                @change="handleDesktopLyricPresetChange"
              >
                <option
                  v-for="option in DESKTOP_LYRIC_COLOR_PRESET_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label class="color-chip">
              <input
                class="color-chip-input"
                type="color"
                :value="desktopLyricSettings.lyricPlayedColor"
                @input="handleDesktopLyricColorChange('lyricPlayedColor', $event)"
              />
              <span
                class="color-chip-swatch"
                :style="{ backgroundColor: desktopLyricSettings.lyricPlayedColor }"
              ></span>
              <span>{{ uiMessages.settings.fields.lyricPlayedColor }}</span>
            </label>

            <label class="color-chip">
              <input
                class="color-chip-input"
                type="color"
                :value="desktopLyricSettings.lyricUnplayedColor"
                @input="handleDesktopLyricColorChange('lyricUnplayedColor', $event)"
              />
              <span
                class="color-chip-swatch"
                :style="{ backgroundColor: desktopLyricSettings.lyricUnplayedColor }"
              ></span>
              <span>{{ uiMessages.settings.fields.lyricUnplayedColor }}</span>
            </label>
          </div>
        </div>

        <div class="desktop-lyric-section-block">
          <span class="setting-label">{{ uiMessages.settings.fields.lyricPreview }}</span>
          <div class="desktop-lyric-preview" :style="desktopLyricPreviewStyle">
            <div class="desktop-lyric-preview-inner">
              <div
                v-if="desktopLyricSettings.showRomanizedLyrics"
                class="desktop-lyric-preview-sub desktop-lyric-preview-roma"
              >
                {{ DESKTOP_LYRIC_PREVIEW.romanized }}
              </div>
              <div class="desktop-lyric-preview-main">
                {{ DESKTOP_LYRIC_PREVIEW.original }}
              </div>
              <div
                v-if="desktopLyricSettings.showTranslation"
                class="desktop-lyric-preview-sub desktop-lyric-preview-trans"
              >
                {{ DESKTOP_LYRIC_PREVIEW.translation }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="settings-note">桌面歌词设置仅在 Electron 桌面端可用。</div>
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

    <section class="settings-section">
      <div class="settings-section-header">
        <h3>{{ uiMessages.settings.sections.experimental }}</h3>
      </div>
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
    </section>

    <CacheManager v-if="isElectron" />
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

.desktop-lyric-switches {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.toggle-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--gray-light, #ddd);
  background: var(--bg, #fff);
  color: var(--black);
  font-size: 13px;
  font-weight: 600;
}

.toggle-chip input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: #ff4d4f;
}

.desktop-lyric-settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.desktop-lyric-section-block {
  display: grid;
  gap: 12px;
  padding: 10px;
  background: var(--bg, #fff);
  border: 1px solid var(--gray-light, #ddd);
}

.desktop-lyric-field {
  display: grid;
  gap: 8px;
  color: var(--black);
  font-size: 12px;
  font-weight: 600;
}

.desktop-lyric-select {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid #d8dee8;
  border-radius: 999px;
  background: #f8fbff;
  color: #243047;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.desktop-lyric-color-row {
  display: grid;
  grid-template-columns: minmax(180px, 220px) repeat(2, minmax(180px, 1fr));
  gap: 12px;
  align-items: center;
}

.preset-field {
  max-width: 220px;
}

.color-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid #d8dee8;
  border-radius: 999px;
  background: #f8fbff;
  color: #344054;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.color-chip-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.color-chip-swatch {
  width: 22px;
  height: 22px;
  border: 1px solid rgba(15, 23, 42, 0.24);
  border-radius: 4px;
  flex-shrink: 0;
}

.desktop-lyric-preview {
  min-height: 180px;
  padding: 22px 24px;
  border: 1px solid #d8dee8;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.92)), #fff;
  overflow: hidden;
}

.desktop-lyric-preview-inner {
  min-height: 136px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: var(--desktop-preview-align-items);
  justify-content: center;
  text-align: var(--desktop-preview-text-align);
  font-family: var(--desktop-preview-font-family);
}

.desktop-lyric-preview-main {
  display: -webkit-box;
  max-width: 100%;
  font-size: var(--desktop-preview-main-size);
  font-weight: var(--desktop-preview-main-weight);
  color: var(--desktop-preview-played-color);
  -webkit-text-stroke: var(--desktop-preview-main-stroke);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--desktop-preview-line-clamp);
  paint-order: stroke fill;
  text-shadow: var(--desktop-preview-main-shadow);
  line-height: 1.2;
  overflow: hidden;
  writing-mode: var(--desktop-preview-writing-mode);
  text-orientation: var(--desktop-preview-text-orientation);
}

.desktop-lyric-preview-sub {
  display: -webkit-box;
  max-width: 100%;
  font-size: var(--desktop-preview-sub-size);
  font-weight: var(--desktop-preview-sub-weight);
  color: var(--desktop-preview-unplayed-color);
  -webkit-text-stroke: var(--desktop-preview-sub-stroke);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--desktop-preview-line-clamp);
  paint-order: stroke fill;
  text-shadow: var(--desktop-preview-sub-shadow);
  line-height: 1.35;
  overflow: hidden;
  writing-mode: var(--desktop-preview-writing-mode);
  text-orientation: var(--desktop-preview-text-orientation);
}

.desktop-lyric-preview-roma {
  letter-spacing: 0.08em;
  text-transform: lowercase;
}

.settings-note {
  padding: 12px;
  background: var(--bg, #fff);
  border: 1px solid var(--gray-light, #ddd);
  color: var(--gray, #666);
  font-size: 13px;
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

@media (max-width: 720px) {
  .desktop-lyric-color-row {
    grid-template-columns: 1fr;
  }

  .preset-field {
    max-width: none;
  }
}
</style>
