<script setup lang="ts">
import { defineAsyncComponent, computed } from 'vue'

import { uiMessages } from '@/messages/ui'
import { useAppSettings } from '@/composables/useAppSettings'
import { useCoverSwipe } from '@/composables/useCoverSwipe'
import { usePlayerViewModel, resolveCoverUrl } from '../composables/usePlayerViewModel'

const SettingsPanel = defineAsyncComponent(() => import('./SettingsPanel.vue'))
const ProgressWaveform = defineAsyncComponent(() => import('./ProgressWaveform.vue'))

interface PlayerProps {
  docked?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<PlayerProps>(), {
  docked: false,
  loading: false
})

const emit = defineEmits<{
  'navigate-to-lyrics': []
}>()

const { waveformEnabled, coverSwipeEnabled } = useAppSettings()
const showWaveform = computed(() => waveformEnabled.value)
const showCoverSwipe = computed(() => coverSwipeEnabled.value && !props.docked)

const {
  playerStore,
  playButtonRef,
  prevButtonRef,
  nextButtonRef,
  loopButtonRef,
  coverImgRef,
  volumeFillRef,
  currentSong,
  progressPercent,
  volumeDisplay,
  artistText,
  coverUrl,
  playModeSvg,
  playModeText,
  canTogglePlay,
  canNavigatePlaylist,
  canTogglePlayMode,
  canToggleDesktopLyric,
  progressSlider,
  volumeSlider,
  onPlayButtonClick,
  onPrevButtonClick,
  onNextButtonClick,
  toggleDesktopLyric,
  onLoopButtonClick
} = usePlayerViewModel()

const {
  offsetX: coverSwipeOffsetX,
  isSwiping: coverIsSwiping,
  swipeDirection: coverSwipeDirection,
  onPointerDown: onCoverSwipePointerDown,
  onPointerMove: onCoverSwipePointerMove,
  onPointerUp: onCoverSwipePointerUp,
  onPointerCancel: onCoverSwipePointerCancel
} = useCoverSwipe()

const coverFrameStyle = computed(() => {
  if (!showCoverSwipe.value || coverSwipeOffsetX.value === 0) return {}
  return { transform: `translateX(${coverSwipeOffsetX.value}px)` }
})

const prevSong = computed(() => {
  const list = playerStore.songList
  const idx = playerStore.currentIndex
  if (list.length === 0 || idx <= 0) return null
  return list[idx - 1]
})

const nextSong = computed(() => {
  const list = playerStore.songList
  const idx = playerStore.currentIndex
  if (list.length === 0 || idx >= list.length - 1) return null
  return list[idx + 1]
})

const prevCoverUrl = computed(() =>
  prevSong.value?.album?.picUrl ? resolveCoverUrl(prevSong.value.album.picUrl) : ''
)

const nextCoverUrl = computed(() =>
  nextSong.value?.album?.picUrl ? resolveCoverUrl(nextSong.value.album.picUrl) : ''
)
</script>

<template>
  <div
    class="player-section"
    :class="{ 'is-docked': props.docked, 'has-song': !!currentSong }"
    @click="currentSong && emit('navigate-to-lyrics')"
  >
    <!-- Docked: Top progress bar -->
    <div
      v-if="props.docked"
      class="top-progress-wrapper"
      @pointerdown="progressSlider.handlePointerDown"
      @pointermove="progressSlider.handlePointerMove"
      @pointerup="progressSlider.handlePointerUp"
      @pointercancel="progressSlider.handlePointerUp"
      @click.stop="progressSlider.handleClick"
    >
      <ProgressWaveform v-if="showWaveform" class="top-waveform" />
      <div class="top-progress-track">
        <div class="top-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
      </div>
    </div>

    <div class="player-left">
      <div
        class="cover-swipe-area"
        v-if="showCoverSwipe"
        @pointerdown="onCoverSwipePointerDown($event)"
        @pointermove="onCoverSwipePointerMove($event)"
        @pointerup="onCoverSwipePointerUp()"
        @pointercancel="onCoverSwipePointerCancel()"
        @dragstart.prevent
        @click.stop
      >
        <!-- Previous song cover (revealed when swiping right) -->
        <div
          v-if="prevCoverUrl"
          class="swipe-peek-cover swipe-peek-prev"
          :class="{ 'is-visible': coverSwipeDirection === 'prev' }"
        >
          <img
            :src="prevCoverUrl"
            :alt="prevSong?.name"
            class="cover-img"
            draggable="false"
            loading="lazy"
          />
        </div>
        <!-- Next song cover (revealed when swiping left) -->
        <div
          v-if="nextCoverUrl"
          class="swipe-peek-cover swipe-peek-next"
          :class="{ 'is-visible': coverSwipeDirection === 'next' }"
        >
          <img
            :src="nextCoverUrl"
            :alt="nextSong?.name"
            class="cover-img"
            draggable="false"
            loading="lazy"
          />
        </div>
        <div class="cover-frame" :class="{ 'is-swiping': coverIsSwiping }" :style="coverFrameStyle">
          <div class="corner corner-tl"></div>
          <div class="corner corner-tr"></div>
          <div class="corner corner-bl"></div>
          <div class="corner corner-br"></div>
          <img
            ref="coverImgRef"
            :src="coverUrl"
            :alt="currentSong?.name"
            class="cover-img"
            draggable="false"
            loading="lazy"
          />
        </div>
      </div>
      <div class="cover-frame" v-else>
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
        <h2 class="track-title">
          {{ currentSong?.name || uiMessages.home.player.emptyTitle }}
        </h2>
        <p class="track-artist">
          {{ currentSong ? artistText : uiMessages.home.player.emptySubtitle }}
        </p>
        <span v-if="props.docked" class="docked-time">
          {{ playerStore.formattedProgress }} / {{ playerStore.formattedDuration }}
        </span>
      </div>
    </div>

    <!-- Normal: Bottom progress -->
    <div v-if="!props.docked" class="progress-section">
      <ProgressWaveform v-if="showWaveform" />
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
        @click.stop="progressSlider.handleClick"
      >
        <div class="progress-fill" :style="{ width: `${progressPercent}%` }"></div>
      </div>
    </div>

    <div
      class="controls"
      v-memo="[
        playerStore.playing,
        playerStore.playMode,
        canTogglePlay,
        canNavigatePlaylist,
        canTogglePlayMode,
        canToggleDesktopLyric
      ]"
    >
      <button
        ref="loopButtonRef"
        class="ctrl-btn loop-btn"
        :disabled="!canTogglePlayMode"
        :aria-label="playModeText"
        @click.stop="onLoopButtonClick"
        :title="playModeText"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <template v-for="(el, i) in playModeSvg" :key="i">
            <path v-if="el.d" :d="el.d" />
            <circle v-if="el.circle" v-bind="el.circle" />
          </template>
        </svg>
      </button>

      <button
        ref="prevButtonRef"
        class="ctrl-btn"
        :disabled="!canNavigatePlaylist"
        aria-label="上一首"
        @click.stop="onPrevButtonClick"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>

      <button
        ref="playButtonRef"
        class="ctrl-btn ctrl-main"
        :disabled="!canTogglePlay"
        :aria-label="playerStore.playing ? '暂停播放' : '开始播放'"
        @click.stop="onPlayButtonClick"
      >
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

      <button
        ref="nextButtonRef"
        class="ctrl-btn"
        :disabled="!canNavigatePlaylist"
        aria-label="下一首"
        @click.stop="onNextButtonClick"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
        </svg>
      </button>

      <!-- Desktop Lyric Button -->
      <button
        class="ctrl-btn lyric-btn"
        :disabled="!canToggleDesktopLyric"
        aria-label="切换桌面歌词"
        @click.stop="toggleDesktopLyric"
        title="Desktop Lyric"
      >
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

    <div class="volume-row" v-memo="[volumeDisplay]" @click.stop>
      <span class="volume-label">VOL</span>
      <div
        class="volume-bar"
        @pointerdown="volumeSlider.handlePointerDown"
        @pointermove="volumeSlider.handlePointerMove"
        @pointerup="volumeSlider.handlePointerUp"
        @pointercancel="volumeSlider.handlePointerUp"
        @click.stop="volumeSlider.handleClick"
      >
        <div ref="volumeFillRef" class="volume-fill"></div>
      </div>
      <span class="volume-value">{{ volumeDisplay }}</span>
      <SettingsPanel />
    </div>
  </div>
</template>

<style scoped src="./Player.css"></style>
