<script setup>
import { computed } from 'vue'
import { usePlayerStore } from '../store/playerStore'

const props = defineProps({
  compact: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const playerStore = usePlayerStore()

const currentSong = computed(() => playerStore.currentSongInfo)

const defaultCover = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 300%22%3E%3Crect fill=%22%23d1d5d8%22 width=%22300%22 height=%22300%22/%3E%3C/svg%3E'

function isValidImageUrl(url) {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const progressPercent = computed(() => {
  if (!playerStore.duration) return 0
  return (playerStore.progress / playerStore.duration) * 100
})

const volumePercent = computed(() => playerStore.volume * 100)

const playModeIcon = computed(() => {
  const modes = ['↻', '🔁', '🔂', '🔀']
  const index = Math.max(0, Math.min(playerStore.playMode, modes.length - 1))
  return modes[index]
})

const playModeText = computed(() => {
  const modes = ['顺序播放', '列表循环', '单曲循环', '随机播放']
  const index = Math.max(0, Math.min(playerStore.playMode, modes.length - 1))
  return modes[index]
})

function handleProgressClick(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  if (rect.width === 0) return
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const time = percent * playerStore.duration
  playerStore.seek(time)
}

function handleVolumeClick(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  if (rect.width === 0) return
  const percent = (e.clientX - rect.left) / rect.width
  playerStore.setVolume(Math.max(0, Math.min(1, percent)))
}
</script>

<template>
  <div class="player-section" :class="{ 'is-compact': compact }">
    <!-- Progress bar on top for compact mode -->
    <div v-if="compact" class="top-progress-container" @click="handleProgressClick">
      <div class="top-progress-fill" :style="{ width: progressPercent + '%' }"></div>
      <div class="top-time-display">
        <span>{{ playerStore.formattedProgress }}</span> / <span>{{ playerStore.formattedDuration }}</span>
      </div>
    </div>

    <div class="cover-frame">
      <div class="corner corner-tl"></div>
      <div class="corner corner-tr"></div>
      <div class="corner corner-bl"></div>
      <div class="corner corner-br"></div>
      <img
        :src="isValidImageUrl(currentSong?.cover) ? currentSong.cover : defaultCover"
        :alt="currentSong?.name"
        class="cover-img"
        loading="lazy"
      />
    </div>

    <div class="track-info">
      <h2 class="track-title">{{ currentSong?.name || 'Unknown Track' }}</h2>
      <p class="track-artist">{{ currentSong?.artist || '' }}</p>
    </div>

    <!-- Progress section only visible in non-compact mode now (or repurposed) -->
    <div class="progress-section" v-if="!compact">
      <div class="time-row">
        <span>{{ playerStore.formattedProgress }}</span>
        <span>{{ playerStore.formattedDuration }}</span>
      </div>
      <div class="progress-bar" @click="handleProgressClick">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
    </div>

    <div class="controls">
      <button class="ctrl-btn loop-btn" @click="playerStore.togglePlayMode" :title="playModeText">
        {{ playModeIcon }}
      </button>

      <button class="ctrl-btn" @click="playerStore.playPrev">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
        </svg>
      </button>

      <button class="ctrl-btn ctrl-main" @click="playerStore.togglePlay">
        <svg v-if="!playerStore.playing" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
      </button>

      <button class="ctrl-btn" @click="playerStore.playNext">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
        </svg>
      </button>
    </div>

    <div class="volume-row">
      <span class="volume-label">Vol</span>
      <div class="volume-bar" @click="handleVolumeClick">
        <div class="volume-fill" :style="{ width: volumePercent + '%' }"></div>
      </div>
      <span class="volume-value">{{ Math.round(volumePercent) }}</span>
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

/* Footer/Compact Player Styles using Prop */
.player-section.is-compact {
  flex-direction: row;
  padding: 0 20px;
  gap: 16px;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 100%;
  position: relative;
  /* Removed padding-top: 4px; to let it center naturally */
  box-sizing: border-box;
}

.player-section.is-compact .progress-section {
  display: none; /* Hide original progress bar container completely */
}

/* Ensure controls are centered in compact mode */
.player-section.is-compact .controls {
  display: flex;
  gap: 20px;
  flex-shrink: 0;
  padding: 0;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%); /* Perfectly centered */
  margin: 0;
}

.player-section.is-compact .volume-row {
  display: flex;
  width: 120px;
  flex-shrink: 0;
  margin-left: auto; /* Push to right edge */
  border-top: none;
  padding-top: 0;
  margin-right: 0;
}
/* New Top Progress Bar Styles */
.top-progress-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px; /* Default small height */
  background: transparent; /* Transparent background initially */
  cursor: pointer;
  z-index: 100;
  overflow: visible; /* Allow hover area to expand */
  transition: all 0.2s ease;
}

/* Add a pseudo-element to increase hover area without changing visual height initially */
.top-progress-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 10px; /* Invisible hit area */
  z-index: -1;
}

.top-progress-container:hover {
  height: 20px; /* Expand on hover */
  background: #000; /* Show black background on hover */
}

.top-progress-fill {
  height: 100%;
  background: var(--accent);
  width: 0%;
  transition: width 0.1s linear, height 0.2s ease;
  pointer-events: none;
  opacity: 1; /* Fully visible accent color */
}

/* Hide background of progress bar when not hovered to make it look like just a thin line */
.top-progress-container:not(:hover) .top-progress-fill {
  /* When not hovered, maybe we want just the fill to be visible as a thin line */
  /* And the rest is transparent */
}

/* Time display only visible on hover */
.top-time-display {
  position: absolute;
  top: 0;
  left: 8px;
  height: 100%;
  display: flex;
  align-items: center;
  color: var(--white);
  font-size: 12px;
  font-weight: 800;
  font-family: monospace;
  pointer-events: none;
  z-index: 12;
  text-shadow: 1px 1px 0 #000;
  opacity: 0; /* Hidden by default */
  transition: opacity 0.2s ease;
}

.top-progress-container:hover .top-time-display {
  opacity: 1; /* Show on hover */
}

.player-section.is-compact .cover-frame {
  width: 40px;
  max-width: 40px;
  height: 40px;
  margin: 0;
  border-width: 2px;
  flex-shrink: 0;
  display: block;
  position: relative;
  background: var(--bg-dark);
}

.player-section.is-compact .cover-img {
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
}

.player-section.is-compact .corner {
  display: none;
}

.player-section.is-compact .track-info {
  text-align: left;
  margin: 0;
  width: auto; /* Allow width to fit content */
  max-width: 200px; /* But cap it */
  flex-shrink: 1; /* Allow shrinking */
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-right: 20px; /* Add spacing before center controls */
}

.player-section.is-compact .track-title {
  font-size: 14px;
  margin-bottom: 2px;
  padding: 0;
  -webkit-line-clamp: 1;
}

.player-section.is-compact .track-artist {
  font-size: 11px;
  padding: 0;
}

/* Removed redundant styles that might conflict */
/* .player-section.is-compact .controls { ... } */
/* .player-section.is-compact .volume-row { ... } */

/* Clean up old global selectors */
/* Footer Player Specific Overrides */
/* :global(.footer-player.player-section) ... removed */

/* Footer mode styles (Compact Player at bottom) */
.footer-player .cover-frame {
  width: 60px;
  max-width: 60px;
  margin: 0;
  border-width: 2px;
}

.footer-player .player-section {
  flex-direction: row;
  align-items: center;
  padding: 0;
  gap: 20px;
  justify-content: space-between;
}

.footer-player .track-info {
  text-align: left;
  margin: 0;
  min-width: 150px;
}

.footer-player .track-title {
  font-size: 16px;
  margin-bottom: 2px;
}

.footer-player .track-artist {
  font-size: 12px;
}

.footer-player .progress-section {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20px;
}

.footer-player .time-row {
  display: none; /* Hide time text to save space or move it */
}

.footer-player .progress-bar {
  flex: 1;
  margin: 0;
  height: 6px;
}

.footer-player .controls {
  order: -1; /* Move controls to left of progress bar */
  gap: 16px;
}

.footer-player .volume-row {
  width: 120px;
}

.footer-player .ctrl-btn {
  width: 32px;
  height: 32px;
}

.footer-player .ctrl-main {
  width: 40px;
  height: 40px;
}

/* Compact mode styles - kept for reference if needed elsewhere */
:global(.main.player-compact) .cover-frame {
  max-width: 140px;
  border-width: 2px;
}

:global(.main.player-compact) .progress-section {
  padding: 10px;
  gap: 8px;
}

:global(.main.player-compact) .track-info {
  margin-bottom: 8px;
}

:global(.main.player-compact) .track-title {
  font-size: 16px;
  margin-bottom: 2px;
}

:global(.main.player-compact) .track-artist {
  font-size: 12px;
}

:global(.main.player-compact) .ctrl-btn {
  width: 28px;
  height: 28px;
}

:global(.main.player-compact) .ctrl-main {
  width: 36px;
  height: 36px;
}

:global(.main.player-compact) .ctrl-main svg {
  width: 20px;
  height: 20px;
}

.cover-frame {
  position: relative;
  border: 3px solid var(--black);
  background: var(--white);
  flex-shrink: 0;
  align-self: center;
  width: 85%;
  max-width: 280px;
  aspect-ratio: 1 / 1;
  overflow: visible;
  margin: 10px 0;
  transition: all 0.3s ease;
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
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
    background: var(--bg-dark);
    margin: 0;
  }
  
  /* Add padding for default cover frame mode to accommodate corners */
  .player-section:not(.footer-player) .cover-img {
    top: 8px;
    left: 8px;
    width: calc(100% - 16px);
    height: calc(100% - 16px);
  }

.track-info {
  margin-top: 2px;
  flex-shrink: 0;
  min-width: 0;
  text-align: center;
}

.track-title {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-bottom: 4px;
  padding: 0 10px;
  border-left: none;
  word-break: break-word;
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
  padding: 0 10px;
  min-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-artist:empty::before {
  content: 'Unknown Artist';
  opacity: 0.5;
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
}

.progress-fill {
  height: 100%;
  background: var(--black);
  width: 0%;
  transition: width 0.1s linear;
  pointer-events: none;
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

.ctrl-btn:hover, .ctrl-btn:active {
  transform: scale(1.1);
}

.ctrl-btn svg {
  width: 20px;
  height: 20px;
  pointer-events: none;
}

.ctrl-main {
  width: 44px;
  height: 44px;
  border: 2px solid var(--black);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ctrl-main svg {
  width: 24px;
  height: 24px;
}

.ctrl-main:hover, .ctrl-main:active {
  background: var(--black);
  color: var(--white);
}

.loop-btn {
  position: relative;
}

.loop-btn.active {
  color: var(--accent);
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

.volume-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--gray);
  min-width: 24px;
}

.volume-bar {
  flex: 1;
  height: 12px;
  background: var(--white);
  border: 2px solid var(--black);
  cursor: pointer;
  position: relative;
}

.volume-fill {
  height: 100%;
  background: var(--black);
  width: 0%;
  pointer-events: none;
}

.volume-value {
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  min-width: 24px;
  text-align: right;
}

@media (max-width: 900px) {
  .player-section {
    min-height: 280px;
  }

  .cover-frame {
    max-width: 200px;
    max-height: 200px;
  }
}

@media (max-width: 600px) {
  .player-section {
    min-height: 240px;
    padding: 10px;
    gap: 8px;
  }

  .cover-frame {
    max-width: 160px;
    max-height: 160px;
    width: 45%;
    border-width: 2px;
  }

  .corner {
    width: 8px;
    height: 8px;
  }

  .corner-tl { top: -4px; left: -4px; }
  .corner-tr { top: -4px; right: -4px; }
  .corner-bl { bottom: -4px; left: -4px; }
  .corner-br { bottom: -4px; right: -4px; }

  .cover-img {
    top: 6px;
    left: 6px;
    right: 6px;
    bottom: 6px;
    width: calc(100% - 12px);
    height: calc(100% - 12px);
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

  .ctrl-main svg {
    width: 28px;
    height: 28px;
  }

  .progress-bar {
    height: 10px;
  }

  .volume-bar {
    height: 16px;
  }

  .track-title {
    font-size: 16px;
  }

  .track-artist {
    font-size: 11px;
  }

  .time-row {
    font-size: 11px;
  }

  .volume-label, .volume-value {
    font-size: 11px;
  }
}
</style>
