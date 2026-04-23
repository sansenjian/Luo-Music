<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import WindowResizeFrame from './components/window/WindowResizeFrame.vue'
import { useCommandContext } from './composables/useCommandContext'
import { useExperimentalFeatures } from './composables/useExperimentalFeatures'
import { useMediaSession } from './composables/useMediaSession'
import { useRenderStyle } from './composables/useRenderStyle'
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
const DESKTOP_LYRIC_ROUTE_PATH = '/desktop-lyric'
const { smtcEnabled } = useExperimentalFeatures()
const mediaSessionEnabled = computed(() => {
  // The hidden desktop-lyric window preloads the full renderer app as well.
  // Only the primary window should own the Windows media session.
  const isDesktopLyricWindow =
    route.path === DESKTOP_LYRIC_ROUTE_PATH ||
    (typeof window !== 'undefined' &&
      window.location.hash.startsWith(`#${DESKTOP_LYRIC_ROUTE_PATH}`))

  return smtcEnabled.value && !isDesktopLyricWindow
})
const showWindowResizeFrame = computed(() => isElectron && route.path !== DESKTOP_LYRIC_ROUTE_PATH)

useCommandContext()
useMediaSession({
  enabled: () => mediaSessionEnabled.value
})
useRenderStyle()

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
  <router-view />
  <WindowResizeFrame v-if="showWindowResizeFrame" />
</template>
