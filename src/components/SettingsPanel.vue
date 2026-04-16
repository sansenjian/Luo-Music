<script setup>
import { computed, ref } from 'vue'
import { services } from '../services'
import { useHomeBrandPlacement } from '../composables/useHomeBrandPlacement'
import { useRenderStyle } from '../composables/useRenderStyle'
import { usePlayerStore } from '../store/playerStore.ts'
import CacheManager from './CacheManager.vue'

const playerStore = usePlayerStore()
const platformService = services.platform()
const showSettings = ref(false)
const { brandPlacement, setBrandPlacement } = useHomeBrandPlacement()
const { renderStyle, setRenderStyle } = useRenderStyle()

const isElectron = computed(() => {
  return platformService.isElectron()
})

function toggleSettings() {
  showSettings.value = !showSettings.value
}

function closeSettings() {
  showSettings.value = false
}

function isBrandPlacementActive(placement) {
  return brandPlacement.value === placement
}

function isRenderStyleActive(style) {
  return renderStyle.value === style
}
</script>

<template>
  <div class="settings-wrapper">
    <button class="settings-btn" @click="toggleSettings" title="Settings">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="3"></circle>
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
        ></path>
      </svg>
    </button>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showSettings" class="settings-overlay" @click.self="closeSettings">
          <div class="settings-panel">
            <div class="settings-header">
              <h2>设置</h2>
              <button class="close-btn" @click="closeSettings">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div class="settings-content">
              <section class="settings-section">
                <h3>播放设置</h3>
                <div class="setting-item">
                  <label>播放模式</label>
                  <select v-model="playerStore.playMode" class="setting-select">
                    <option :value="0">顺序播放</option>
                    <option :value="1">列表循环</option>
                    <option :value="2">单曲循环</option>
                    <option :value="3">随机播放</option>
                  </select>
                </div>
                <div class="setting-item">
                  <label>音量</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    v-model.number="playerStore.volume"
                    class="setting-range"
                  />
                  <span class="volume-value">{{ Math.round(playerStore.volume * 100) }}%</span>
                </div>
              </section>

              <section class="settings-section">
                <h3>歌词设置</h3>
                <div class="setting-item">
                  <label>显示翻译</label>
                  <input
                    type="checkbox"
                    :checked="playerStore.lyricType.includes('trans')"
                    @change="playerStore.toggleLyricType('trans')"
                  />
                </div>
                <div class="setting-item">
                  <label>显示罗马音</label>
                  <input
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
                      经典配色
                    </button>
                    <button
                      type="button"
                      class="placement-option"
                      :class="{ active: isRenderStyleActive('red') }"
                      @click="setRenderStyle('red')"
                    >
                      红色风格
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
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.settings-btn {
  width: 28px;
  height: 28px;
  border: 2px solid var(--black);
  background: var(--white);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--black);
  transition: all 0.1s;
  flex-shrink: 0;
}

.settings-btn:hover {
  background: var(--black);
  color: var(--white);
}

.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-panel {
  background: var(--bg);
  border: 3px solid var(--black);
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 3px solid var(--black);
  background: var(--black);
  color: var(--white);
}

.settings-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--white);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.close-btn:hover {
  opacity: 1;
}

.settings-content {
  padding: 16px;
}

.settings-section {
  margin-bottom: 20px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.settings-section h3 {
  margin: 0 0 12px 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gray);
  padding-bottom: 8px;
  border-bottom: 2px solid var(--black);
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
  font-size: 13px;
}

.setting-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-label {
  font-size: 13px;
  font-weight: 600;
}

.placement-switch {
  display: inline-flex;
  gap: 8px;
  align-self: flex-start;
  padding: 4px;
  border: 2px solid var(--black);
  background: var(--white);
}

.placement-option {
  min-width: 76px;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: var(--black);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.placement-option.active {
  background: var(--black);
  color: var(--white);
}

.setting-select {
  padding: 6px 10px;
  border: 2px solid var(--black);
  background: var(--white);
  font-size: 13px;
  cursor: pointer;
}

.setting-range {
  width: 80px;
}

.volume-value {
  font-size: 11px;
  color: var(--gray);
  min-width: 36px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.cache-unavailable {
  padding: 16px;
  background: var(--bg-secondary, #f5f5f5);
  border: 2px dashed var(--gray, #999);
  text-align: center;
}

.cache-unavailable p {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: var(--gray, #666);
}

.cache-unavailable .cache-hint {
  font-size: 11px;
  margin: 0;
}

.cache-unavailable code {
  background: var(--bg, #fff);
  padding: 2px 6px;
  border: 1px solid var(--gray-light, #ddd);
  font-size: 11px;
}
</style>
