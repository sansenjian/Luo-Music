<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { useDesktopLyricSettings } from '@/composables/useDesktopLyricSettings'
import {
  resolveDesktopLyricAlignItems,
  resolveDesktopLyricFontWeight,
  resolveDesktopLyricLineClamp,
  resolveDesktopLyricWritingMode
} from '@/utils/player/desktopLyricSettings'
import { useActiveLyricState } from '@/composables/useActiveLyricState'
import { services } from '@/services'
import { resolveLyricDisplayLine } from '@/utils/player/lyric-display'

const platformService = services.platform()
const playerService = services.player()
const { currentLine, currentLyric, currentTrans, currentRoma, isPlaying } = useActiveLyricState({
  source: 'ipc',
  emptyText: 'Desktop Lyric'
})
const { desktopLyricSettings } = useDesktopLyricSettings()

const displayLine = computed(() =>
  resolveLyricDisplayLine(
    currentLine.value ?? {
      text: currentLyric.value === 'Desktop Lyric' ? '' : currentLyric.value,
      trans: currentTrans.value,
      roma: currentRoma.value
    },
    {
      showOriginal: true,
      showTrans: desktopLyricSettings.value.showTranslation,
      showRoma: desktopLyricSettings.value.showRomanizedLyrics
    },
    currentLyric.value
  )
)

const lyricWindowStyle = computed(() => {
  const config = desktopLyricSettings.value
  const weights = resolveDesktopLyricFontWeight(config.lyricFontWeight)
  const isOutline = config.lyricStrokeStyle === 'outline'
  const { writingMode, textOrientation } = resolveDesktopLyricWritingMode(config.lyricFlowDirection)

  return {
    '--desktop-lyric-font-family': config.lyricFontFamily,
    '--desktop-lyric-main-size': `${config.lyricFontSize}px`,
    '--desktop-lyric-sub-size': `${Math.max(16, Math.round(config.lyricFontSize * 0.5))}px`,
    '--desktop-lyric-main-weight': String(weights.main),
    '--desktop-lyric-sub-weight': String(weights.sub),
    '--desktop-lyric-played-color': config.lyricPlayedColor,
    '--desktop-lyric-unplayed-color': config.lyricUnplayedColor,
    '--desktop-lyric-main-stroke': isOutline ? '3px #0a0a0a' : '0px transparent',
    '--desktop-lyric-sub-stroke': isOutline ? '1px rgba(255, 255, 255, 0.95)' : '0px transparent',
    '--desktop-lyric-main-filter': isOutline ? 'drop-shadow(5px 5px 0 rgba(0, 0, 0, 1))' : 'none',
    '--desktop-lyric-sub-shadow': isOutline ? '2px 2px 0 #fff' : 'none',
    '--desktop-lyric-line-clamp': String(resolveDesktopLyricLineClamp(config.lyricLineMode)),
    '--desktop-lyric-writing-mode': writingMode,
    '--desktop-lyric-text-orientation': textOrientation,
    '--desktop-lyric-text-align': config.lyricTextAlign,
    '--desktop-lyric-align-items': resolveDesktopLyricAlignItems(config.lyricTextAlign)
  }
})

const isLocked = ref(false)
const isHovering = ref(false)
const isUnlocking = ref(false)
const canUnlockClick = ref(false)
const unsubscribers: Array<() => void> = []
let unlockActivationTimer: number | null = null
const UNLOCK_HOVER_DELAY = 120
const UNLOCK_CLICK_GUARD_DELAY = 180
let unlockClickableAt = 0

let isDragging = false
let startX = 0
let startY = 0
let dragFrameId: number | null = null
let pendingMoveX = 0
let pendingMoveY = 0

function onMouseEnter() {
  isHovering.value = true
}

function onMouseLeave() {
  isHovering.value = false
}

function runAsync(operation: () => Promise<void>) {
  void Promise.resolve(operation()).catch(error => {
    console.error('[LyricFloat] Async control operation failed', error)
  })
}

function isUnsupportedReadyChannelError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /^(?:\[IpcProxy\] )?Invalid send channel: desktop-lyric-ready$/.test(error.message)
}

function notifyRendererReady() {
  if (!platformService.supportsSendChannel('desktop-lyric-ready')) {
    console.info('[LyricFloat] desktop-lyric-ready channel is unavailable in current preload')
    return
  }

  try {
    platformService.send('desktop-lyric-ready', undefined)
  } catch (error) {
    if (isUnsupportedReadyChannelError(error)) {
      // Legacy preload can still receive lyric updates even without ready handshake support.
      console.info('[LyricFloat] desktop-lyric-ready channel is unavailable in current preload')
      return
    }

    console.error('[LyricFloat] Failed to notify desktop lyric renderer readiness', error)
  }
}

function toggleLock() {
  platformService.send('desktop-lyric-control', isLocked.value ? 'unlock' : 'lock')
}

function unlockWindow() {
  if (!isLocked.value || !canUnlockClick.value || Date.now() < unlockClickableAt) {
    return
  }

  isUnlocking.value = true
  canUnlockClick.value = false
  unlockClickableAt = 0
  toggleLock()
}

function invokePlayerAction(action: 'play' | 'pause') {
  runAsync(() => (action === 'play' ? playerService.play() : playerService.pause()))
}

function togglePlay() {
  invokePlayerAction(isPlaying.value ? 'pause' : 'play')
}

function playPrev() {
  runAsync(() => playerService.skipToPrevious())
}

function playNext() {
  runAsync(() => playerService.skipToNext())
}

function closeWindow() {
  platformService.send('desktop-lyric-control', 'close')
}

function onUnlockEnter() {
  if (!isLocked.value) {
    return
  }

  if (unlockActivationTimer !== null) {
    window.clearTimeout(unlockActivationTimer)
  }

  canUnlockClick.value = false
  unlockActivationTimer = window.setTimeout(() => {
    unlockActivationTimer = null
    if (!isLocked.value) {
      return
    }

    canUnlockClick.value = true
    unlockClickableAt = Date.now() + UNLOCK_CLICK_GUARD_DELAY
  }, UNLOCK_HOVER_DELAY)
}

function onUnlockLeave() {
  if (unlockActivationTimer !== null) {
    window.clearTimeout(unlockActivationTimer)
    unlockActivationTimer = null
  }

  if (isUnlocking.value) {
    return
  }

  canUnlockClick.value = false
  unlockClickableAt = 0
}

function flushPendingDragMove() {
  if (pendingMoveX === 0 && pendingMoveY === 0) {
    return
  }

  platformService.send('desktop-lyric-move', { x: pendingMoveX, y: pendingMoveY })
  pendingMoveX = 0
  pendingMoveY = 0
}

function scheduleDragMoveFlush() {
  if (dragFrameId !== null) {
    return
  }

  dragFrameId = window.requestAnimationFrame(() => {
    dragFrameId = null
    flushPendingDragMove()
  })
}

function onMouseDown(e: MouseEvent) {
  const target = e.target as Element | null
  if (isLocked.value || target?.closest('.control-btn, .unlock-btn')) {
    return
  }

  isDragging = true
  startX = e.screenX
  startY = e.screenY
  pendingMoveX = 0
  pendingMoveY = 0
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging) {
    return
  }

  const dx = e.screenX - startX
  const dy = e.screenY - startY
  if (dx === 0 && dy === 0) {
    return
  }

  startX = e.screenX
  startY = e.screenY
  pendingMoveX += dx
  pendingMoveY += dy
  scheduleDragMoveFlush()
}

function onMouseUp() {
  flushPendingDragMove()
  isDragging = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

onMounted(() => {
  document.body.style.backgroundColor = 'transparent'
  document.documentElement.style.backgroundColor = 'transparent'

  unsubscribers.push(
    platformService.on('desktop-lyric-lock-state', payload => {
      const data = payload as { locked: boolean }
      if (typeof data.locked !== 'boolean') {
        return
      }

      isLocked.value = data.locked
      if (!data.locked) {
        isUnlocking.value = false
        canUnlockClick.value = false
        unlockClickableAt = 0
      }
    })
  )

  // Notify the main process after the lyric window has mounted.
  notifyRendererReady()
})

onUnmounted(() => {
  if (unlockActivationTimer !== null) {
    window.clearTimeout(unlockActivationTimer)
    unlockActivationTimer = null
  }

  while (unsubscribers.length > 0) {
    unsubscribers.pop()?.()
  }

  if (dragFrameId !== null) {
    window.cancelAnimationFrame(dragFrameId)
    dragFrameId = null
  }
  pendingMoveX = 0
  pendingMoveY = 0

  if (isDragging) {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    isDragging = false
  }
})
</script>

<template>
  <div
    class="lyric-window"
    :class="{ locked: isLocked, hover: isHovering }"
    :style="lyricWindowStyle"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @mousedown="onMouseDown"
  >
    <div v-if="!isLocked" class="background"></div>

    <div class="lyric-content">
      <div v-if="displayLine.showRoma" class="lrc-sub lrc-roma">
        {{ displayLine.roma }}
      </div>
      <div v-if="displayLine.showOriginal" class="lrc-main" :data-text="displayLine.original">
        {{ displayLine.original }}
      </div>
      <div v-if="displayLine.showTrans" class="lrc-sub lrc-trans">
        {{ displayLine.trans }}
      </div>
    </div>

    <div v-if="!isLocked" class="controls">
      <button class="control-btn" @click="playPrev" title="Prev">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>
      <button class="control-btn" @click="togglePlay" :title="isPlaying ? 'Pause' : 'Play'">
        <svg v-if="isPlaying" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
      <button class="control-btn" @click="playNext" title="Next">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
        </svg>
      </button>
      <div class="divider"></div>
      <button class="control-btn" @click="toggleLock" title="Lock Desktop Lyric">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </button>
      <button class="control-btn close" @click="closeWindow" title="Close">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div
      v-if="isLocked"
      class="unlock-btn"
      title="Unlock Desktop Lyric"
      @mouseenter="onUnlockEnter"
      @mouseleave="onUnlockLeave"
      @click="unlockWindow"
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.lyric-window {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  user-select: none;
  font-family: var(--desktop-lyric-font-family, 'Inter', 'Noto Sans SC', sans-serif);
}

.lyric-window:not(.locked) {
  cursor: grab;
}

.lyric-window:not(.locked):active {
  cursor: grabbing;
}

.lyric-window.locked {
  -webkit-app-region: no-drag;
  pointer-events: none;
}

.background {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0);
  transition: background 0.3s;
  border-radius: 8px;
  pointer-events: none;
}

.lyric-window:hover .background {
  background: rgba(232, 236, 239, 0.8);
  backdrop-filter: blur(4px);
  border: 4px solid #0a0a0a;
}

.lyric-content {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: var(--desktop-lyric-align-items, center);
  text-align: var(--desktop-lyric-text-align, center);
  pointer-events: auto;
  padding: 0 20px;
  transition: transform 0.3s;
}

.lrc-main {
  display: -webkit-box;
  max-width: 100%;
  font-size: var(--desktop-lyric-main-size, 36px);
  font-weight: var(--desktop-lyric-main-weight, 800);
  line-height: 1.2;
  margin-bottom: 4px;
  color: var(--desktop-lyric-played-color, #fff);
  -webkit-text-stroke: var(--desktop-lyric-main-stroke, 3px #0a0a0a);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--desktop-lyric-line-clamp, 1);
  paint-order: stroke fill;
  background: none;
  -webkit-background-clip: border-box;
  background-clip: border-box;
  -webkit-text-fill-color: currentColor;
  filter: var(--desktop-lyric-main-filter, drop-shadow(5px 5px 0 rgba(0, 0, 0, 1)));
  overflow: hidden;
  writing-mode: var(--desktop-lyric-writing-mode, horizontal-tb);
  text-orientation: var(--desktop-lyric-text-orientation, mixed);
}

.lrc-main::before {
  content: none;
}

.lrc-sub {
  display: -webkit-box;
  max-width: 100%;
  font-size: var(--desktop-lyric-sub-size, 18px);
  font-weight: var(--desktop-lyric-sub-weight, 600);
  color: var(--desktop-lyric-unplayed-color, #0a0a0a);
  -webkit-text-stroke: var(--desktop-lyric-sub-stroke, 1px #fff);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--desktop-lyric-line-clamp, 1);
  paint-order: stroke fill;
  text-shadow: var(--desktop-lyric-sub-shadow, 2px 2px 0px #fff);
  overflow: hidden;
  writing-mode: var(--desktop-lyric-writing-mode, horizontal-tb);
  text-orientation: var(--desktop-lyric-text-orientation, mixed);
}

.lrc-roma {
  margin-bottom: 4px;
}

.lrc-trans {
  margin-top: 4px;
}

.controls {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: #0a0a0a;
  border: 4px solid #0a0a0a;
  border-radius: 0;
  opacity: 0;
  transition:
    opacity 0.2s,
    transform 0.2s;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  z-index: 20;
  box-shadow: 6px 6px 0px rgba(0, 0, 0, 0.2);
}

.lyric-window:hover .controls {
  opacity: 1;
  transform: translate(-50%, 20px);
}

.control-btn {
  background: #fff;
  border: 2px solid #0a0a0a;
  color: #0a0a0a;
  cursor: pointer;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s;
}

.control-btn:hover {
  background: #4ade80;
  transform: translate(-2px, -2px);
  box-shadow: 2px 2px 0px #0a0a0a;
}

.control-btn:active {
  transform: translate(0, 0);
  box-shadow: none;
}

.control-btn.close:hover {
  background: #ff4d4f;
  color: #fff;
}

.divider {
  width: 2px;
  height: 24px;
  background: #fff;
  margin: 0 4px;
}

.unlock-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 32px;
  height: 32px;
  background: #0a0a0a;
  border: 2px solid #fff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  transition: all 0.2s;
  opacity: 0.3;
  box-shadow: 2px 2px 0px rgba(255, 255, 255, 0.5);
}

.lyric-window.locked:hover .unlock-btn {
  opacity: 1;
}

.unlock-btn:hover {
  opacity: 1;
  background: #4ade80;
  color: #0a0a0a;
  border-color: #0a0a0a;
  box-shadow: 2px 2px 0px #fff;
}
</style>
