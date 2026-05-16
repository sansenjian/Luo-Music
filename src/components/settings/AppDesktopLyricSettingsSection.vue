<script setup lang="ts">
import { computed } from 'vue'
import type { LyricColorPreset } from '@shared/contracts/config'

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

import AppSettingsSectionShell from './AppSettingsSectionShell.vue'

defineProps<{
  fieldIdPrefix: string
}>()

type DesktopLyricBooleanKey = 'showTranslation' | 'showRomanizedLyrics'
type DesktopLyricSelectKey =
  | 'lyricFontFamily'
  | 'lyricFontSize'
  | 'lyricFontWeight'
  | 'lyricStrokeStyle'
  | 'lyricLineMode'
  | 'lyricFlowDirection'
  | 'lyricTextAlign'

const {
  isElectron,
  desktopLyricSettings,
  setLyricSetting,
  setLyricColorPreset,
  toggleDesktopLyricEnabled,
  setDesktopLyricOnTop
} = useDesktopLyricSettings()

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

function handleDesktopLyricEnabledChange(event: Event): void {
  void toggleDesktopLyricEnabled((event.target as HTMLInputElement).checked)
}

function handleDesktopLyricAlwaysOnTopChange(event: Event): void {
  void setDesktopLyricOnTop((event.target as HTMLInputElement).checked)
}

function handleDesktopLyricBooleanChange(key: DesktopLyricBooleanKey, event: Event): void {
  void setLyricSetting(key, (event.target as HTMLInputElement).checked)
}

function handleDesktopLyricSelectChange(key: DesktopLyricSelectKey, event: Event): void {
  const target = event.target as HTMLSelectElement
  const nextValue = key === 'lyricFontSize' ? Number(target.value) : target.value
  void setLyricSetting(key, nextValue as never)
}

function handleDesktopLyricPresetChange(event: Event): void {
  const target = event.target as HTMLSelectElement
  void setLyricColorPreset(target.value as LyricColorPreset)
}

function handleDesktopLyricColorChange(
  key: 'lyricPlayedColor' | 'lyricUnplayedColor',
  event: Event
): void {
  void setLyricSetting(key, (event.target as HTMLInputElement).value)
}
</script>

<template>
  <AppSettingsSectionShell :title="uiMessages.settings.sections.lyrics">
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
  </AppSettingsSectionShell>
</template>

<style scoped>
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
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-control-radius);
  background: var(--ui-control-bg);
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
  background: var(--ui-surface);
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
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
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-control-radius);
  background: var(--ui-control-bg);
  color: var(--black);
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
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-control-radius);
  background: var(--ui-control-bg);
  color: var(--black);
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
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-card-radius);
  background: var(--ui-surface);
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
  background: var(--ui-surface);
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
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

@media (max-width: 720px) {
  .desktop-lyric-color-row {
    grid-template-columns: 1fr;
  }

  .preset-field {
    max-width: none;
  }
}
</style>
