<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { COMMANDS } from '../core/commands/commands'
import type { Song } from '../platform/music/interface'
import { services } from '../services'
import { usePlayerStore } from '../store/playerStore'
import {
  animateButtonClick,
  animatePlayPause,
  animateAlbumCover,
  animateLoopMode
} from '../composables/useAnimations'
import { useSlider } from '../composables/useSlider'
import { useThrottledStyleUpdate } from '../composables/useThrottledStyleUpdate'
import SettingsPanel from './SettingsPanel.vue'

interface PlayerProps {
  compact?: boolean
  loading?: boolean
}

type PlayModeSvgElement =
  | { d: string; circle?: never }
  | { circle: { cx: number; cy: number; r: number }; d?: never }

const props = withDefaults(defineProps<PlayerProps>(), {
  compact: false,
  loading: false
})

const commandService = services.commands()
const playerStore = usePlayerStore()

// Refs
const playButtonRef = ref<HTMLButtonElement | null>(null)
const prevButtonRef = ref<HTMLButtonElement | null>(null)
const nextButtonRef = ref<HTMLButtonElement | null>(null)
const loopButtonRef = ref<HTMLButtonElement | null>(null)
const coverImgRef = ref<HTMLImageElement | null>(null)
const progressFillRef = ref<HTMLDivElement | null>(null)
const volumeFillRef = ref<HTMLDivElement | null>(null)

const defaultCover =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 300%22%3E%3Crect fill=%22%23d1d5d8%22 width=%22300%22 height=%22300%22/%3E%3C/svg%3E'

// Computed
const currentSong = computed<Song | null>(() => playerStore.currentSongInfo)
const progressPercent = computed(() =>
  playerStore.duration ? (playerStore.progress / playerStore.duration) * 100 : 0
)
const volumePercent = computed(() => playerStore.volume * 100)
const artistText = computed(
  () => currentSong.value?.artists.map(artist => artist.name).join(' / ') || 'Unknown Artist'
)
const canTogglePlay = computed(() => {
  return !!currentSong.value && commandService.canExecute(COMMANDS.PLAYER_TOGGLE_PLAY)
})
const canNavigatePlaylist = computed(() => {
  return playerStore.songList.length > 0 && commandService.canExecute(COMMANDS.PLAYER_PLAY_NEXT)
})
const canTogglePlayMode = computed(() => {
  return playerStore.songList.length > 0 && commandService.canExecute(COMMANDS.PLAYER_TOGGLE_PLAY_MODE)
})
const canToggleDesktopLyric = computed(() => commandService.canExecute(COMMANDS.DESKTOP_LYRIC_TOGGLE))

const coverUrl = computed(() => {
  const url = currentSong.value?.album?.picUrl
  if (!url) return defaultCover
  if (url.startsWith('data:')) return url
  try {
    return new URL(url).protocol.match(/^https?:$/) ? url : defaultCover
  } catch {
    return defaultCover
  }
})

const playModeSvg = computed<PlayModeSvgElement[]>(() => {
  const modes: PlayModeSvgElement[][] = [
    [{ d: 'M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z' }, { d: 'M17 10l5 5-5 5V10z' }],
    [{ d: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z' }],
    [
      { d: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z' },
      { circle: { cx: 12, cy: 12, r: 2 } }
    ],
    [
      {
        d: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z'
      }
    ]
  ]
  return modes[Math.max(0, Math.min(playerStore.playMode, 3))] || modes[0]
})

const playModeText = computed(
  () => ['顺序播放', '列表循环', '单曲循环', '随机播放'][playerStore.playMode] || '顺序播放'
)

// Sliders
const progressSlider = useSlider({
  onUpdate: percent => playerStore.seek(percent * playerStore.duration),
  getValue: () => (playerStore.duration ? playerStore.progress / playerStore.duration : 0)
})

const volumeSlider = useSlider({
  onUpdate: percent => playerStore.setVolume(percent),
  getValue: () => playerStore.volume
})

// Animation handlers
function onPlayButtonClick() {
  if (!canTogglePlay.value) return
  animateButtonClick(playButtonRef.value)
  animatePlayPause(playButtonRef.value, !playerStore.playing)
  void commandService.execute(COMMANDS.PLAYER_TOGGLE_PLAY)
}

function onPrevButtonClick() {
  if (!canNavigatePlaylist.value) return
  animateButtonClick(prevButtonRef.value)
  void commandService.execute(COMMANDS.PLAYER_PLAY_PREV)
}

function onNextButtonClick() {
  if (!canNavigatePlaylist.value) return
  animateButtonClick(nextButtonRef.value)
  void commandService.execute(COMMANDS.PLAYER_PLAY_NEXT)
}

function toggleDesktopLyric() {
  if (!canToggleDesktopLyric.value) return
  void commandService.execute(COMMANDS.DESKTOP_LYRIC_TOGGLE)
}

function onLoopButtonClick() {
  if (!canTogglePlayMode.value) return
  animateLoopMode(loopButtonRef.value)
  void commandService.execute(COMMANDS.PLAYER_TOGGLE_PLAY_MODE)
}

// Watch for song changes
watch(
  () => playerStore.currentSong,
  () => {
    nextTick(() => coverImgRef.value && animateAlbumCover(coverImgRef.value))
  },
  { immediate: true }
)

// 使用可复用的 composable 函数进行阈值过滤的样式更新
useThrottledStyleUpdate({
  source: progressPercent,
  targetRef: progressFillRef,
  minChange: 0.1,
  shouldSkip: () => progressSlider.isDragging.value
})

useThrottledStyleUpdate({
  source: volumePercent,
  targetRef: volumeFillRef,
  minChange: 1
})

onMounted(() => {
  if (progressFillRef.value) progressFillRef.value.style.width = `${progressPercent.value}%`
  if (volumeFillRef.value) volumeFillRef.value.style.width = `${volumePercent.value}%`
})
</script>

<template>
  <div class="player-section" :class="{ 'is-compact': props.compact }">
    <!-- Compact: Top progress bar -->
    <div
      v-if="props.compact"
      class="top-progress-wrapper"
      @pointerdown="progressSlider.handlePointerDown"
      @pointermove="progressSlider.handlePointerMove"
      @pointerup="progressSlider.handlePointerUp"
      @pointercancel="progressSlider.handlePointerUp"
      @click="progressSlider.handleClick"
    >
      <div class="top-progress-track">
        <div
          ref="progressFillRef"
          class="top-progress-fill"
          :style="{ width: `${progressPercent}%` }"
        ></div>
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
        <img
          ref="coverImgRef"
          :src="coverUrl"
          :alt="currentSong?.name"
          class="cover-img"
          loading="lazy"
        />
      </div>

      <div class="track-info">
        <h2 class="track-title">{{ currentSong?.name || 'Unknown Track' }}</h2>
        <p class="track-artist">{{ artistText }}</p>
      </div>
    </div>

    <!-- Normal: Bottom progress -->
    <div v-if="!props.compact" class="progress-section">
      <div class="time-row">
        <span>{{ playerStore.formattedProgress }}</span>
        <span>{{ playerStore.formattedDuration }}</span>
      </div>
      <div
        class="progress-bar"
        @pointerdown="progressSlider.handlePointerDown"
        @pointermove="progressSlider.handlePointerMove"
        @pointerup="progressSlider.handlePointerUp"
        @pointercancel="progressSlider.handlePointerUp"
        @click="progressSlider.handleClick"
      >
        <div
          ref="progressFillRef"
          class="progress-fill"
          :style="{ width: `${progressPercent}%` }"
        ></div>
      </div>
    </div>

    <div class="controls">
      <button
        ref="loopButtonRef"
        class="ctrl-btn loop-btn"
        :disabled="!canTogglePlayMode"
        @click="onLoopButtonClick"
        :title="playModeText"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <template v-for="(el, i) in playModeSvg" :key="i">
            <path v-if="el.d" :d="el.d" />
            <circle v-if="el.circle" v-bind="el.circle" />
          </template>
        </svg>
      </button>

      <button ref="prevButtonRef" class="ctrl-btn" :disabled="!canNavigatePlaylist" @click="onPrevButtonClick">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>

      <button ref="playButtonRef" class="ctrl-btn ctrl-main" :disabled="!canTogglePlay" @click="onPlayButtonClick">
        <svg
          v-if="!playerStore.playing"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
        <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      </button>

      <button ref="nextButtonRef" class="ctrl-btn" :disabled="!canNavigatePlaylist" @click="onNextButtonClick">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
        </svg>
      </button>

      <!-- Desktop Lyric Button -->
      <button class="ctrl-btn lyric-btn" :disabled="!canToggleDesktopLyric" @click="toggleDesktopLyric" title="Desktop Lyric">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          <line x1="9" y1="9" x2="15" y2="9"></line>
          <line x1="9" y1="13" x2="15" y2="13"></line>
        </svg>
      </button>
    </div>

    <div class="volume-row">
      <span class="volume-label">VOL</span>
      <div
        class="volume-bar"
        @pointerdown="volumeSlider.handlePointerDown"
        @pointermove="volumeSlider.handlePointerMove"
        @pointerup="volumeSlider.handlePointerUp"
        @pointercancel="volumeSlider.handlePointerUp"
        @click="volumeSlider.handleClick"
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
  touch-action: none;
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
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
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
.player-section.is-compact .lyric-btn:hover {
  color: var(--accent);
}

.player-section.is-compact .volume-row {
  width: 200px;
  justify-self: end;
  border: none;
  padding: 0;
  grid-column: 3;
}

.player-section.is-compact .volume-row::before {
  display: none;
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

.corner-tl {
  top: -5px;
  left: -5px;
}
.corner-tr {
  top: -5px;
  right: -5px;
}
.corner-bl {
  bottom: -5px;
  left: -5px;
}
.corner-br {
  bottom: -5px;
  right: -5px;
}

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

.ctrl-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
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

.lyric-btn:hover {
  color: var(--accent);
}

.volume-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  position: relative;
  width: 100%; /* Ensure it takes full width */
  box-sizing: border-box; /* Include padding/border */
}

.volume-row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: var(--black);
}

.volume-bar {
  flex: 1;
  height: 12px;
  background: var(--white);
  border: 2px solid var(--black);
  cursor: pointer;
  position: relative;
  touch-action: none;
  min-width: 40px; /* Prevent shrinking too much */
}

.volume-fill {
  height: 100%;
  background: var(--black);
  width: 0%;
  will-change: width;
}

.volume-label,
.volume-value {
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-width: 24px;
  flex-shrink: 0;
}

.volume-value {
  text-align: right;
  flex-shrink: 0;
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

  .player-section.is-compact .volume-row::before {
    display: none;
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
