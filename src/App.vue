<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import WindowResizeFrame from './components/window/WindowResizeFrame.vue'
import { useCommandContext } from './composables/useCommandContext'
import { useProjectUi } from './composables/useProjectUi'
import { useWindowChromeState } from './composables/useWindowChromeState'
import { useAudioOutputPlaybackSync } from '@/extensions/audioOutput/useAudioOutputPlaybackSync'
import { getPlatformDescriptors } from '@/platform/music/descriptors'
import { AiDialogueButton, AiDialoguePanel, useAiDialogueExtension } from './extensions/ai-dialogue'
import { DESKTOP_LYRIC_ROUTE_PATH, useSmtcExtension } from './extensions/smtc/useSmtcExtension'
import { services } from './services'
import { usePlayerStore } from './store/playerStore'
import { PLAYER_STORAGE_KEY, sanitizePersistedPlayerState } from './utils/storage/appStorage'

const platformService = services.platform()
const storageService = services.storage()
const isElectron = platformService.isElectron()
let playerStore: ReturnType<typeof usePlayerStore> | null = null
const showAnalytics = ref(false)
const route = useRoute()
const Analytics = defineAsyncComponent(() =>
  import('@vercel/analytics/vue').then(module => module.Analytics)
)
const isDesktopLyricRoute = computed(() => route.path === DESKTOP_LYRIC_ROUTE_PATH)
const showClientWindowChrome = computed(() => !isDesktopLyricRoute.value)
const shouldTrackWindowChrome = computed(() => isElectron && showClientWindowChrome.value)
const showWindowResizeFrame = computed(() => isElectron && showClientWindowChrome.value)

/** AI 对话按钮仅在 ai-assistant 插件启用时显示 */
const aiAssistantEnabled = computed(() => {
  const descriptors = getPlatformDescriptors()
  const aiPlugin = descriptors.find(d => d.id === 'ai-assistant')
  return aiPlugin?.enabled ?? false
})
const showAiDialogue = computed(() => showClientWindowChrome.value && aiAssistantEnabled.value)
const { isWindowFullScreen, isWindowMaximized, isWindowRounded } =
  useWindowChromeState(shouldTrackWindowChrome)

useCommandContext()
useSmtcExtension()
useAudioOutputPlaybackSync()
const aiDialogue = useAiDialogueExtension()
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

  playerStore = usePlayerStore()

  watch(
    showClientWindowChrome,
    shouldSyncPlayerState => {
      if (shouldSyncPlayerState && playerStore && !playerStore.ipcInitialized) {
        playerStore.setupIpcListeners()
      }
    },
    { immediate: true }
  )
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
  <AiDialogueButton
    v-if="showAiDialogue"
    :is-open="aiDialogue.isOpen"
    :is-electron="aiDialogue.isElectron"
    @toggle="aiDialogue.toggle"
  />
  <AiDialoguePanel
    v-if="showAiDialogue"
    :is-open="aiDialogue.isOpen"
    :messages="aiDialogue.messages"
    :status="aiDialogue.status"
    :error="aiDialogue.error"
    @close="aiDialogue.close"
    @send="aiDialogue.send"
  />
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
