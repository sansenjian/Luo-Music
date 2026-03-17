<script setup>
import { Analytics } from '@vercel/analytics/vue'
import { useCommandContext } from './composables/useCommandContext'

const isElectron = window.navigator.userAgent.indexOf('Electron') > -1
const DEFAULT_PLAYER_STATE = {
  volume: 0.7,
  playMode: 0,
  lyricType: ['original', 'trans'],
  isCompact: false
}
const VALID_LYRIC_TYPES = new Set(['original', 'trans', 'roma'])

const sanitizeVolume = value => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : DEFAULT_PLAYER_STATE.volume
}

const sanitizePlayMode = value => {
  return Number.isInteger(value) && value >= 0 && value <= 3 ? value : DEFAULT_PLAYER_STATE.playMode
}

const sanitizeLyricType = value => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_PLAYER_STATE.lyricType]
  }

  const sanitized = value.filter(item => typeof item === 'string' && VALID_LYRIC_TYPES.has(item))

  return sanitized.length > 0 ? [...new Set(sanitized)] : [...DEFAULT_PLAYER_STATE.lyricType]
}

const sanitizeIsCompact = value => {
  return typeof value === 'boolean' ? value : DEFAULT_PLAYER_STATE.isCompact
}

const sanitizePlayerState = value => {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_PLAYER_STATE }
  }

  return {
    volume: sanitizeVolume(value.volume),
    playMode: sanitizePlayMode(value.playMode),
    lyricType: sanitizeLyricType(value.lyricType),
    isCompact: sanitizeIsCompact(value.isCompact)
  }
}

useCommandContext()

if (isElectron) {
  const playerState = localStorage.getItem('player')

  if (playerState) {
    try {
      const parsed = JSON.parse(playerState)
      const sanitized = sanitizePlayerState(parsed)
      localStorage.setItem('player', JSON.stringify(sanitized))
    } catch (e) {
      localStorage.setItem('player', JSON.stringify(DEFAULT_PLAYER_STATE))
      console.error('Failed to parse player state, reset to defaults:', e)
    }
  }
}
</script>

<template>
  <Analytics v-if="!isElectron" />
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
