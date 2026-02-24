<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { usePlayerStore } from '../store/playerStore'
import { animate, animateButtonClick, animatePlayPause, animateAlbumCover, animateLoopMode } from '../composables/useAnimations.js'
import SettingsPanel from './SettingsPanel.vue'

const props = defineProps({
  compact: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})

const playerStore = usePlayerStore()

// Refs
const playButtonRef = ref(null)
const prevButtonRef = ref(null)
const nextButtonRef = ref(null)
const loopButtonRef = ref(null)
const coverImgRef = ref(null)
const progressFillRef = ref(null)
const volumeFillRef = ref(null)

const defaultCover = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 300%22%3E%3Crect fill=%22%23d1d5d8%22 width=%22300%22 height=%22300%22/%3E%3C/svg%3E'

// Computed
const currentSong = computed(() => playerStore.currentSongInfo)
const progressPercent = computed(() => playerStore.duration ? (playerStore.progress / playerStore.duration) * 100 : 0)
const volumePercent = computed(() => playerStore.volume * 100)

const coverUrl = computed(() => {
  const url = currentSong.value?.cover
  if (!url) return defaultCover
  if (url.startsWith('data:')) return url
  try {
    return new URL(url).protocol.match(/^https?:$/) ? url : defaultCover
  } catch {
    return defaultCover
  }
})

const playModeSvg = computed(() => {
  const modes = [
    [{ d: 'M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z' }, { d: 'M17 10l5 5-5 5V10z' }],
    [{ d: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z' }],
    [{ d: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z' }, { circle: { cx: 12, cy: 12, r: 2 } }],
    [{ d: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z' }]
  ]
  return modes[Math.max(0, Math.min(playerStore.playMode, 3))] || modes[0]
})

const playModeText = computed(() => ['顺序播放', '列表循环', '单曲循环', '随机播放'][playerStore.playMode] || '顺序播放')

// Drag state
const isDraggingProgress = ref(false)
const isDraggingVolume = ref(false)
let progressRect = null
let volumeRect = null
let rafId = null

// Progress handlers
function handleProgressPointerDown(e) {
  if (e.button !== 0) return
  isDraggingProgress.value = true
  progressRect = e.currentTarget.getBoundingClientRect()
  e.currentTarget.setPointerCapture?.(e.pointerId)
  updateProgressFromEvent(e)
}

function handleProgressPointerMove(e) {
  if (!isDraggingProgress.value || !progressRect) return
  e.preventDefault()
  // 使用 RAF 节流
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    updateProgressFromEvent(e)
    rafId = null
  })
}

function handleProgressPointerUp(e) {
  if (!isDraggingProgress.value) return
  isDraggingProgress.value = false
  progressRect = null
  e.currentTarget.releasePointerCapture?.(e.pointerId)
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

function updateProgressFromEvent(e) {
  if (!progressRect?.width) return
  const percent = Math.max(0, Math.min(1, (e.clientX - progressRect.left) / progressRect.width))
  playerStore.seek(percent * playerStore.duration)
}

// Volume handlers
function handleVolumePointerDown(e) {
  if (e.button !== 0) return
  isDraggingVolume.value = true
  volumeRect = e.currentTarget.getBoundingClientRect()
  e.currentTarget.setPointerCapture?.(e.pointerId)
  updateVolumeFromEvent(e)
}

function handleVolumePointerMove(e) {
  if (!isDraggingVolume.value || !volumeRect) return
  updateVolumeFromEvent(e)
}

function handleVolumePointerUp(e) {
  if (!isDraggingVolume.value) return
  isDraggingVolume.value = false
  volumeRect = null
  e.currentTarget.releasePointerCapture?.(e.pointerId)
}

function updateVolumeFromEvent(e) {
  if (!volumeRect?.width) return
  const percent = Math.max(0, Math.min(1, (e.clientX - volumeRect.left) / volumeRect.width))
  playerStore.setVolume(percent)
}

// Click handlers (for non-drag clicks)
function handleProgressClick(e) {
  if (isDraggingProgress.value) return // 避免拖拽后触发 click
  const rect = e.currentTarget.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  playerStore.seek(percent * playerStore.duration)
}

function handleVolumeClick(e) {
  if (isDraggingVolume.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  playerStore.setVolume(percent)
}

// Cleanup
onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
})

// Animation handlers
function onPlayButtonClick() {
  animateButtonClick(playButtonRef.value)
  animatePlayPause(playButtonRef.value, !playerStore.playing)
  playerStore.togglePlay()
}

function onPrevButtonClick() {
  animateButtonClick(prevButtonRef.value)
  playerStore.playPrev()
}

function onNextButtonClick() {
  animateButtonClick(nextButtonRef.value)
  playerStore.playNext()
}

function onLoopButtonClick() {
  animateLoopMode(loopButtonRef.value)
  playerStore.togglePlayMode()
}

// Watch for song changes
watch(() => playerStore.currentSong, () => {
  nextTick(() => coverImgRef.value && animateAlbumCover(coverImgRef.value))
}, { immediate: true })

// Animation instances
let progressAnim = null
let volumeAnim = null

// Watch for progress - 只在非拖拽状态下使用动画
watch(() => progressPercent.value, (newVal) => {
  if (!progressFillRef.value || isDraggingProgress.value) return
  progressAnim?.pause()
  progressAnim = animate(progressFillRef.value, {
    width: `${newVal}%`,
    duration: 150,
    easing: 'linear'
  })
}, { flush: 'post' })

// Watch for volume
watch(() => volumePercent.value, (newVal) => {
  if (!volumeFillRef.value) return
  volumeAnim?.pause()
  volumeAnim = animate(volumeFillRef.value, {
    width: `${newVal}%`,
    duration: 200,
    easing: 'easeOutQuad'
  })
}, { flush: 'post' })

onMounted(() => {
  if (progressFillRef.value) progressFillRef.value.style.width = `${progressPercent.value}%`
  if (volumeFillRef.value) volumeFillRef.value.style.width = `${volumePercent.value}%`
})
</script>

<template>
  <div class="player-section" :class="{ 'is-compact': compact }">
    <!-- Compact: Top progress bar -->
    <div 
      v-if="compact" 
      class="top-progress-wrapper"
      @pointerdown="handleProgressPointerDown"
      @pointermove="handleProgressPointerMove"
      @pointerup="handleProgressPointerUp"
      @pointercancel="handleProgressPointerUp"
      @click="handleProgressClick"
    >
      <div class="top-progress-track">
        <div ref="progressFillRef" class="top-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
      </div>
      <div class="top-progress-hover-info">
        <span>{{ playerStore.formattedProgress }}</span>
        <span class="separator">/</span>
        <span>{{ playerStore.formattedDuration }}</span>
      </div>
    </div>

    <div class="player-left">
      <div class="cover-frame">
        <div class="corner corner-tl"></div>
        <div class="corner corner-tr"></div>
        <div class="corner corner-bl"></div>
        <div class="corner corner-br"></div>
        <img ref="coverImgRef" :src="coverUrl" :alt="currentSong?.name" class="cover-img" loading="lazy" />
      </div>

      <div class="track-info">
        <h2 class="track-title">{{ currentSong?.name || 'Unknown Track' }}</h2>
        <p class="track-artist">{{ currentSong?.artist || 'Unknown Artist' }}</p>
      </div>
    </div>

    <!-- Normal: Bottom progress -->
    <div v-if="!compact" class="progress-section">
      <div class="time-row">
        <span>{{ playerStore.formattedProgress }}</span>
        <span>{{ playerStore.formattedDuration }}</span>
      </div>
      <div 
        class="progress-bar" 
        @pointerdown="handleProgressPointerDown"
        @pointermove="handleProgressPointerMove"
        @pointerup="handleProgressPointerUp"
        @pointercancel="handleProgressPointerUp"
        @click="handleProgressClick"
      >
        <div ref="progressFillRef" class="progress-fill"></div>
      </div>
    </div>

    <div class="controls">
      <button ref="loopButtonRef" class="ctrl-btn loop-btn" @click="onLoopButtonClick" :title="playModeText">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <template v-for="(el, i) in playModeSvg" :key="i">
            <path v-if="el.d" :d="el.d" />
            <circle v-if="el.circle" v-bind="el.circle" />
          </template>
        </svg>
      </button>

      <button ref="prevButtonRef" class="ctrl-btn" @click="onPrevButtonClick">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
        </svg>
      </button>

      <button ref="playButtonRef" class="ctrl-btn ctrl-main" @click="onPlayButtonClick">
        <svg v-if="!playerStore.playing" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
      </button>

      <button ref="nextButtonRef" class="ctrl-btn" @click="onNextButtonClick">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
        </svg>
      </button>
    </div>

    <div class="volume-row">
      <span class="volume-label">VOL</span>
      <div 
        class="volume-bar" 
        @pointerdown="handleVolumePointerDown"
        @pointermove="handleVolumePointerMove"
        @pointerup="handleVolumePointerUp"
        @pointercancel="handleVolumePointerUp"
        @click="handleVolumeClick"
      >
        <div ref="volumeFillRef" class="volume-fill"></div>
      </div>
      <span class="volume-value">{{ Math.round(volumePercent) }}</span>
      <SettingsPanel />
    </div>
  </div>
</template>

<style scoped>
.player-section {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  min-height: 0;
  justify-content: center;
  transition: all 0.3s ease;
}

/* ===== Compact Mode ===== */
.player-section.is-compact {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  padding: 12px 16px 8px;
  gap: 12px;
  align-items: center;
  position: relative;
}

/* Top Progress Bar - 重构结构避免 height transition 问题 */
.top-progress-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  cursor: pointer;
  z-index: 100;
}

.top-progress-track {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  background: var(--bg-dark);
  overflow: hidden;
}

.top-progress-fill {
  height: 100%;
  background: var(--accent);
  /* 移除 CSS transition，完全由 JS 控制 */
  will-change: width;
}

/* Hover 时展开的是 wrapper，不是 track */
.top-progress-wrapper:hover {
  height: 20px;
}

.top-progress-wrapper:hover .top-progress-track {
  height: 20px;
  background: #000;
}

.top-progress-hover-info {
  position: absolute;
  top: 0;
  left: 8px;
  height: 20px;
  display: flex;
  align-items: center;
  gap: 4px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  font-family: monospace;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

.top-progress-wrapper:hover .top-progress-hover-info {
  opacity: 1;
}

.separator {
  opacity: 0.6;
}

/* Compact layout adjustments */
/* Left: Cover + Track Info wrapper */
.player-section.is-compact .player-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
  justify-self: start;
}

.player-section.is-compact .cover-frame {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  margin: 0;
  border-width: 2px;
}

.player-section.is-compact .corner {
  display: none;
}

.player-section.is-compact .track-info {
  min-width: 0;
  text-align: left;
  margin: 0;
  flex: 1;
}

.player-section.is-compact .track-title {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 1;
}

.player-section.is-compact .track-artist {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Center: Controls */
.player-section.is-compact .controls {
  justify-self: center;
  padding: 0;
  gap: 8px;
  grid-column: 2;
}

/* Right: Volume */
.player-section.is-compact .volume-row {
  width: 200px;
  justify-self: end;
  border: none;
  padding: 0;
  grid-column: 3;
}

.player-section.is-compact .progress-section {
  display: none;
}

/* ===== Normal Mode ===== */
.player-left {
  display: contents;
}

.cover-frame {
  position: relative;
  border: 3px solid var(--black);
  background: var(--white);
  flex-shrink: 0;
  align-self: center;
  width: 85%;
  max-width: 280px;
  aspect-ratio: 1;
  margin: 10px 0;
}

.corner {
  position: absolute;
  width: 10px;
  height: 10px;
  background: var(--black);
  z-index: 10;
}

.corner-tl { top: -5px; left: -5px; }
.corner-tr { top: -5px; right: -5px; }
.corner-bl { bottom: -5px; left: -5px; }
.corner-br { bottom: -5px; right: -5px; }

.cover-img {
  position: absolute;
  top: 8px;
  left: 8px;
  width: calc(100% - 16px);
  height: calc(100% - 16px);
  object-fit: cover;
  background: var(--bg-dark);
}

.track-info {
  text-align: center;
  flex-shrink: 0;
  min-width: 0;
}

.track-title {
  font-size: 18px;
  font-weight: 800;
  margin-bottom: 4px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.track-artist {
  font-size: 12px;
  color: var(--gray);
  min-height: 18px;
}

.progress-section {
  margin-top: auto;
  flex-shrink: 0;
}

.time-row {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  margin-bottom: 4px;
}

.progress-bar {
  height: 6px;
  background: var(--white);
  border: 2px solid var(--black);
  cursor: pointer;
  position: relative;
  touch-action: none; /* 防止触摸滚动干扰 */
}

.progress-bar:hover {
  height: 8px;
  margin-top: -1px;
  margin-bottom: -1px;
}

.progress-fill {
  height: 100%;
  background: var(--black);
  width: 0%;
  position: relative;
  will-change: width;
}

.progress-fill::after {
  content: '';
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  background: var(--accent);
  border: 2px solid var(--black);
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.2s;
}

.progress-bar:hover .progress-fill::after {
  opacity: 1;
}

.controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 10px 0;
}

.ctrl-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  color: var(--black);
  transition: transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ctrl-btn:hover {
  transform: scale(1.1);
}

.ctrl-btn:active {
  transform: scale(0.95);
}

.ctrl-main {
  width: 44px;
  height: 44px;
  border: 2px solid var(--black);
}

.ctrl-main:hover {
  background: var(--black);
  color: var(--white);
}

.loop-btn.active {
  color: var(--accent);
  position: relative;
}

.loop-btn.active::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  background: var(--accent);
  border-radius: 50%;
}

.volume-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 2px solid var(--black);
}

.volume-bar {
  flex: 1;
  height: 12px;
  background: var(--white);
  border: 2px solid var(--black);
  cursor: pointer;
  position: relative;
  touch-action: none;
}

.volume-fill {
  height: 100%;
  background: var(--black);
  width: 0%;
  will-change: width;
}

.volume-label, .volume-value {
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-width: 24px;
}

.volume-value {
  text-align: right;
}

/* Responsive */
@media (max-width: 600px) {
  .player-section:not(.is-compact) {
    padding: 10px;
    gap: 8px;
  }
  
  .cover-frame {
    max-width: 200px;
  }
  
  .ctrl-btn {
    padding: 10px;
  }
  
  .ctrl-btn svg {
    width: 24px;
    height: 24px;
  }
  
  .ctrl-main {
    width: 50px;
    height: 50px;
  }
}

@media (max-width: 600px) {
  .player-section.is-compact {
    padding: 12px 12px 8px;
    gap: 8px;
  }
  
  .player-section.is-compact .cover-frame {
    width: 40px;
    height: 40px;
  }
  
  .player-section.is-compact .track-title {
    font-size: 12px;
  }
  
  .player-section.is-compact .track-artist {
    font-size: 10px;
  }
  
  .player-section.is-compact .controls {
    gap: 6px;
  }
  
  .player-section.is-compact .ctrl-btn {
    width: 32px;
    height: 32px;
  }
  
  .player-section.is-compact .ctrl-btn svg {
    width: 16px;
    height: 16px;
  }
  
  .player-section.is-compact .ctrl-main {
    width: 36px;
    height: 36px;
  }
  
  .player-section.is-compact .ctrl-main svg {
    width: 20px;
    height: 20px;
  }
  
  .player-section.is-compact .volume-row {
    width: 80px;
  }
}

@media (max-width: 480px) {
  .player-section.is-compact {
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    padding: 10px 12px 6px;
  }
  
  .player-section.is-compact .track-info {
    display: none;
  }
  
  /* 显示音量控制，但缩小尺寸 */
  .player-section.is-compact .volume-row {
    width: 100px;
    gap: 4px;
  }
  
  .player-section.is-compact .volume-label {
    font-size: 9px;
    min-width: 18px;
  }
  
  .player-section.is-compact .volume-value {
    font-size: 9px;
    min-width: 16px;
  }
  
  .player-section.is-compact .volume-row :deep(.settings-btn) {
    width: 24px;
    height: 24px;
  }
  
  .player-section.is-compact .volume-row :deep(.settings-btn svg) {
    width: 14px;
    height: 14px;
  }
}
</style>