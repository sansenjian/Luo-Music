<script setup lang="ts">
import { useAppSettings } from '@/composables/useAppSettings'

import CacheManager from '../CacheManager.vue'

const {
  playerStore,
  isElectron,
  setBrandPlacement,
  setDockedPlayerBarLayout,
  setRenderStyle,
  isBrandPlacementActive,
  isRenderStyleActive,
  isDockedPlayerBarLayoutActive
} = useAppSettings()
</script>

<template>
  <section class="workspace-settings-shell" aria-labelledby="workspace-settings-title">
    <header class="workspace-settings-header">
      <div>
        <p class="workspace-settings-eyebrow">工作区设置</p>
        <h2 id="workspace-settings-title">设置</h2>
      </div>
      <p class="workspace-settings-caption">这里显示在工作区，播放栏设置仍保持悬浮窗。</p>
    </header>

    <div class="workspace-settings-content">
      <section class="settings-section">
        <h3>播放设置</h3>
        <div class="setting-item">
          <label for="workspace-play-mode">播放模式</label>
          <select id="workspace-play-mode" v-model="playerStore.playMode" class="setting-select">
            <option :value="0">顺序播放</option>
            <option :value="1">列表循环</option>
            <option :value="2">单曲循环</option>
            <option :value="3">随机播放</option>
          </select>
        </div>
        <div class="setting-item">
          <label for="workspace-volume">音量</label>
          <input
            id="workspace-volume"
            v-model.number="playerStore.volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            class="setting-range"
            aria-label="播放器音量"
          />
          <span class="volume-value">{{ Math.round(playerStore.volume * 100) }}%</span>
        </div>
      </section>

      <section class="settings-section">
        <h3>歌词设置</h3>
        <div class="setting-item">
          <label for="workspace-lyric-trans">显示翻译</label>
          <input
            id="workspace-lyric-trans"
            type="checkbox"
            :checked="playerStore.lyricType.includes('trans')"
            @change="playerStore.toggleLyricType('trans')"
          />
        </div>
        <div class="setting-item">
          <label for="workspace-lyric-roma">显示罗马音</label>
          <input
            id="workspace-lyric-roma"
            type="checkbox"
            :checked="playerStore.lyricType.includes('roma')"
            @change="playerStore.toggleLyricType('roma')"
          />
        </div>
      </section>

      <section class="settings-section">
        <h3>界面设置</h3>
        <div class="setting-stack">
          <span class="setting-label">渲染风格</span>
          <div class="placement-switch" role="group" aria-label="渲染风格">
            <button
              type="button"
              class="placement-option"
              :class="{ active: isRenderStyleActive('classic') }"
              @click="setRenderStyle('classic')"
            >
              经典风格
            </button>
            <button
              type="button"
              class="placement-option"
              :class="{ active: isRenderStyleActive('brand') }"
              @click="setRenderStyle('brand')"
            >
              品牌风格
            </button>
          </div>

          <span class="setting-label">品牌标识位置</span>
          <div class="placement-switch" role="group" aria-label="品牌标识位置">
            <button
              type="button"
              class="placement-option"
              :class="{ active: isBrandPlacementActive('header') }"
              @click="setBrandPlacement('header')"
            >
              顶栏
            </button>
            <button
              type="button"
              class="placement-option"
              :class="{ active: isBrandPlacementActive('sidebar') }"
              @click="setBrandPlacement('sidebar')"
            >
              侧边栏
            </button>
          </div>

          <span class="setting-label">紧贴底栏播放器布局</span>
          <div class="placement-switch" role="group" aria-label="紧贴底栏播放器布局">
            <button
              type="button"
              class="placement-option"
              :class="{ active: isDockedPlayerBarLayoutActive('full') }"
              @click="setDockedPlayerBarLayout('full')"
            >
              铺满底栏
            </button>
            <button
              type="button"
              class="placement-option"
              :class="{ active: isDockedPlayerBarLayoutActive('with-sidebar') }"
              @click="setDockedPlayerBarLayout('with-sidebar')"
            >
              给侧边栏留位
            </button>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <h3>缓存管理</h3>
        <CacheManager v-if="isElectron" />
        <div v-else class="cache-unavailable">
          <p>缓存管理功能仅在 Electron 桌面应用中可用。</p>
          <p class="cache-hint">
            请使用
            <code>npm run dev</code>
            启动 Electron 应用，或打包后的桌面应用。
          </p>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.workspace-settings-shell {
  height: 100%;
  padding: 24px 28px;
  overflow-y: auto;
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.7), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(246, 247, 249, 0.98));
}

.workspace-settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.workspace-settings-eyebrow {
  margin: 0 0 6px;
  color: var(--gray);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-settings-header h2 {
  margin: 0;
  font-size: 28px;
  font-weight: 900;
  color: var(--black);
}

.workspace-settings-caption {
  margin: 4px 0 0;
  max-width: 280px;
  color: var(--gray);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  text-align: right;
}

.workspace-settings-content {
  display: grid;
  gap: 18px;
}

.settings-section {
  padding: 18px 20px;
  border: 2px solid color-mix(in srgb, var(--black) 12%, transparent);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.05);
}

.settings-section h3 {
  margin: 0 0 14px;
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gray);
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-item label {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--black);
}

.setting-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--black);
}

.placement-switch {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
}

.placement-option {
  min-width: 88px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--black) 14%, transparent);
  border-radius: 999px;
  background: var(--white);
  color: var(--black);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.placement-option:hover {
  transform: translateY(-1px);
}

.placement-option.active {
  background: var(--black);
  color: var(--white);
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.16);
}

.setting-select {
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--black) 16%, transparent);
  border-radius: 12px;
  background: var(--white);
  font-size: 13px;
  font-weight: 600;
}

.setting-range {
  width: 120px;
}

.volume-value {
  min-width: 42px;
  color: var(--gray);
  font-size: 12px;
  font-weight: 700;
}

.cache-unavailable {
  padding: 16px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-muted) 88%, var(--white));
  color: var(--gray);
}

.cache-unavailable p {
  margin: 0 0 8px;
  font-size: 13px;
}

.cache-unavailable .cache-hint {
  margin-bottom: 0;
}

.cache-unavailable code {
  padding: 2px 6px;
  border-radius: 8px;
  background: var(--white);
}

@media (max-width: 960px) {
  .workspace-settings-shell {
    padding: 18px;
  }

  .workspace-settings-header {
    flex-direction: column;
  }

  .workspace-settings-caption {
    max-width: none;
    text-align: left;
  }
}
</style>
