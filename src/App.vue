<script setup>
import { Analytics } from '@vercel/analytics/vue'

const isElectron = window.navigator.userAgent.indexOf('Electron') > -1

if (isElectron) {
  const playerState = localStorage.getItem('player')
  if (playerState) {
    try {
      const parsed = JSON.parse(playerState)
      const preserved = {
        volume: parsed.volume ?? 0.7,
        playMode: parsed.playMode ?? 0,
        lyricType: parsed.lyricType ?? ['original', 'trans'],
        isCompact: parsed.isCompact ?? false
      }
      localStorage.setItem('player', JSON.stringify(preserved))
    } catch (e) {
      console.error('Failed to clean player state:', e)
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

html, body {
  height: 100%;
}

body {
  font-family: 'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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
