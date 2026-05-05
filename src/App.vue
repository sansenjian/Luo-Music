<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import WindowResizeFrame from './components/window/WindowResizeFrame.vue'
import { useCommandContext } from './composables/useCommandContext'
import { useProjectUi } from './composables/useProjectUi'
import { useWindowChromeState } from './composables/useWindowChromeState'
import { DESKTOP_LYRIC_ROUTE_PATH, useSmtcExtension } from './extensions/smtc/useSmtcExtension'
import { services } from './services'
import { PLAYER_STORAGE_KEY, sanitizePersistedPlayerState } from './utils/storage/appStorage'

const platformService = services.platform()
const storageService = services.storage()
const isElectron = platformService.isElectron()
const showAnalytics = ref(false)
const route = useRoute()
const Analytics = defineAsyncComponent(() =>
  import('@vercel/analytics/vue').then(module => module.Analytics)
)
const isDesktopLyricRoute = computed(() => route.path === DESKTOP_LYRIC_ROUTE_PATH)
const showClientWindowChrome = computed(() => !isDesktopLyricRoute.value)
const shouldTrackWindowChrome = computed(() => isElectron && showClientWindowChrome.value)
const showWindowResizeFrame = computed(() => isElectron && showClientWindowChrome.value)
const { isWindowFullScreen, isWindowMaximized, isWindowRounded } =
  useWindowChromeState(shouldTrackWindowChrome)

useCommandContext()
useSmtcExtension()
const { ensureAvailableRenderStyle } = useProjectUi()
ensureAvailableRenderStyle()

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
    storageService.setJSON(PLAYER_STORAGE_KEY, sanitizePersistedPlayerState(playerState))
  } else if (storageService.getItem(PLAYER_STORAGE_KEY)) {
    storageService.setJSON(PLAYER_STORAGE_KEY, sanitizePersistedPlayerState(null))
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
  <div
    v-if="showClientWindowChrome"
    class="app-window"
    data-ui="app-window"
    :class="{
      'window-rounded': isWindowRounded,
      'window-maximized': isWindowMaximized,
      'window-fullscreen': isWindowFullScreen
    }"
  >
    <router-view />
  </div>
  <router-view v-else />
  <WindowResizeFrame v-if="showWindowResizeFrame" />
</template>

<style scoped>
.app-window {
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--ui-app-bg);
  overflow: hidden;
}
</style>
