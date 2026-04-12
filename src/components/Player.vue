<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

import { usePlayerViewModel } from '../composables/usePlayerViewModel'

const SettingsPanel = defineAsyncComponent(() => import('./SettingsPanel.vue'))

interface PlayerProps {
  compact?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<PlayerProps>(), {
  compact: false,
  loading: false
})

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
        <div class="top-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
      </div>
      <div class="top-progress-hover-info">
        <span>{{ playerStore.formattedProgress }}</span>
        <span class="separator">/</span>
        <span>{{ playerStore.formattedDuration }}</span>
      </div>
    </div>

    <div class="player-left" v-memo="[currentSong?.id, coverUrl, artistText]">
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

      <button
        ref="prevButtonRef"
        class="ctrl-btn"
        :disabled="!canNavigatePlaylist"
        @click="onPrevButtonClick"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>

      <button
        ref="playButtonRef"
        class="ctrl-btn ctrl-main"
        :disabled="!canTogglePlay"
        @click="onPlayButtonClick"
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
        @click="onNextButtonClick"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
        </svg>
      </button>

      <!-- Desktop Lyric Button -->
      <button
        class="ctrl-btn lyric-btn"
        :disabled="!canToggleDesktopLyric"
        @click="toggleDesktopLyric"
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

    <div class="volume-row" v-memo="[volumeDisplay]">
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
      <span class="volume-value">{{ volumeDisplay }}</span>
      <SettingsPanel />
    </div>
  </div>
</template>

<style scoped src="./Player.css"></style>
