<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'

import { useCommandContext } from './composables/useCommandContext'
import { services } from './services'
import { PLAY_MODE } from './utils/player/constants/playMode'

type PlayerState = {
  volume: number
  playMode: number
  lyricType: string[]
  isCompact: boolean
}

const platformService = services.platform()
const storageService = services.storage()
const isElectron = platformService.isElectron()
const showAnalytics = ref(false)
const Analytics = defineAsyncComponent(() =>
  import('@vercel/analytics/vue').then(module => module.Analytics)
)
const PLAYER_STORAGE_KEY = 'player'
const DEFAULT_PLAYER_STATE: PlayerState = {
  volume: 0.7,
  playMode: PLAY_MODE.SEQUENTIAL,
  lyricType: ['original', 'trans'],
  isCompact: false
}
const VALID_LYRIC_TYPES = new Set(['original', 'trans', 'roma'])

const sanitizeVolume = (value: unknown): number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : DEFAULT_PLAYER_STATE.volume
}

const sanitizePlayMode = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return DEFAULT_PLAYER_STATE.playMode
  }
  return value >= 0 && value <= 3 ? value : DEFAULT_PLAYER_STATE.playMode
}

const sanitizeLyricType = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_PLAYER_STATE.lyricType]
  }

  const sanitized = value.filter(item => typeof item === 'string' && VALID_LYRIC_TYPES.has(item))

  return sanitized.length > 0 ? [...new Set(sanitized)] : [...DEFAULT_PLAYER_STATE.lyricType]
}

const sanitizeIsCompact = (value: unknown): boolean => {
  return typeof value === 'boolean' ? value : DEFAULT_PLAYER_STATE.isCompact
}

const sanitizePlayerState = (value: unknown): PlayerState => {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_PLAYER_STATE }
  }

  const record = value as Partial<PlayerState>

  return {
    volume: sanitizeVolume(record.volume as unknown),
    playMode: sanitizePlayMode(record.playMode as unknown),
    lyricType: sanitizeLyricType(record.lyricType as unknown),
    isCompact: sanitizeIsCompact(record.isCompact as unknown)
  }
}

useCommandContext()

function scheduleIdle(task: () => void): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => task())
    return
  }

  setTimeout(task, 0)
}

if (isElectron) {
  const playerState = storageService.getJSON<unknown>(PLAYER_STORAGE_KEY)

  if (playerState !== null) {
    storageService.setJSON(PLAYER_STORAGE_KEY, sanitizePlayerState(playerState))
  } else if (storageService.getItem(PLAYER_STORAGE_KEY)) {
    storageService.setJSON(PLAYER_STORAGE_KEY, DEFAULT_PLAYER_STATE)
    console.error('Failed to parse player state, reset to defaults')
  }
}

onMounted(() => {
  if (isElectron) {
    return
  }

  scheduleIdle(() => {
    showAnalytics.value = true
  })
})
</script>

<template>
  <Analytics v-if="!isElectron && showAnalytics" />
  <router-view />
</template>

<style>
:root {
  --bg: #f5f5f5;
  --bg-dark: #e0e0e0;
  --black: #1a1a1a;
  --white: #ffffff;
  --accent: #ff6b35;
  --gray: #666666;
  --gray-light: #999999;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
}

body {
  font-family:
    'Inter',
    'Noto Sans SC',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  background: var(--bg);
  color: var(--black);
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app {
  height: 100%;
}

::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: var(--bg-dark);
}

::-webkit-scrollbar-thumb {
  background: var(--gray-light);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--gray);
}
</style>
