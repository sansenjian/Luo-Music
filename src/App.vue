<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { useCommandContext } from './composables/useCommandContext'
import { useExperimentalFeatures } from './composables/useExperimentalFeatures'
import { useMediaSession } from './composables/useMediaSession'
import { useRenderStyle } from './composables/useRenderStyle'
import { services } from './services'
import { PLAY_MODE } from './utils/player/constants/playMode'

type PlayerState = {
  volume: number
  playMode: number
  lyricType: string[]
  isPlayerDocked: boolean
  isCompact?: boolean
}

const platformService = services.platform()
const storageService = services.storage()
const isElectron = platformService.isElectron()
const showAnalytics = ref(false)
const route = useRoute()
const Analytics = defineAsyncComponent(() =>
  import('@vercel/analytics/vue').then(module => module.Analytics)
)
const DESKTOP_LYRIC_ROUTE_PATH = '/desktop-lyric'
const PLAYER_STORAGE_KEY = 'player'
const DEFAULT_PLAYER_STATE: PlayerState = {
  volume: 0.7,
  playMode: PLAY_MODE.SEQUENTIAL,
  lyricType: ['original', 'trans'],
  isPlayerDocked: true
}
const VALID_LYRIC_TYPES = new Set(['original', 'trans', 'roma'])
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

const sanitizeIsPlayerDocked = (value: unknown): boolean => {
  return typeof value === 'boolean' ? value : DEFAULT_PLAYER_STATE.isPlayerDocked
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
    isPlayerDocked: sanitizeIsPlayerDocked(
      record.isPlayerDocked ?? (record as { isCompact?: unknown }).isCompact
    )
  }
}

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
