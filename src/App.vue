<script setup>
import { Analytics } from '@vercel/analytics/vue'
import Home from './views/Home.vue'

// 检测是否为 Electron 环境
const isElectron = window.navigator.userAgent.indexOf('Electron') > -1
</script>

<template>
  <Analytics v-if="!isElectron" />
  <Home />
</template>

<style>
:root {
  --bg: #f5f5f0;
  --bg-dark: #e5e5e0;
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
  font-family: 'Inter', 'Noto Sans SC', sans-serif;
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
