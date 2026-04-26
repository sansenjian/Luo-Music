import { computed, onMounted, onUnmounted, ref } from 'vue'

import type { AppConfig, ConfigKey } from '@/platform/contracts/config'
import { DEFAULT_APP_CONFIG } from '@/platform/contracts/config'
import { services } from '@/services'
import { resolveDesktopLyricPresetColors } from '@/utils/player/desktopLyricSettings'

const desktopLyricSettingsState = ref<AppConfig>({ ...DEFAULT_APP_CONFIG })
let isDesktopLyricSettingsLoaded = false
let desktopLyricConfigUnsubscribe: (() => void) | null = null
let desktopLyricSettingsConsumers = 0

function getDesktopConfigApi() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.services?.config
}

function getDesktopWindowApi() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.services?.window
}

async function loadDesktopLyricSettings(): Promise<void> {
  const configApi = getDesktopConfigApi()
  if (!configApi) {
    desktopLyricSettingsState.value = { ...DEFAULT_APP_CONFIG }
    return
  }

  const nextConfig = await configApi.getAll()
  desktopLyricSettingsState.value = {
    ...DEFAULT_APP_CONFIG,
    ...nextConfig
  }
  isDesktopLyricSettingsLoaded = true
}

function ensureDesktopLyricConfigListener(): void {
  const configApi = getDesktopConfigApi()
  if (!configApi || desktopLyricConfigUnsubscribe) {
    return
  }

  desktopLyricConfigUnsubscribe = configApi.onConfigChange(event => {
    desktopLyricSettingsState.value = {
      ...desktopLyricSettingsState.value,
      [event.key]: event.newValue as AppConfig[typeof event.key]
    }
  })
}

async function setDesktopLyricConfig<K extends ConfigKey>(
  key: K,
  value: AppConfig[K]
): Promise<void> {
  const configApi = getDesktopConfigApi()
  if (!configApi) {
    return
  }

  desktopLyricSettingsState.value = {
    ...desktopLyricSettingsState.value,
    [key]: value
  }
  await configApi.set(key, value)
}

export function useDesktopLyricSettings() {
  const platformService = services.platform()
  const isElectron = computed(() => platformService.isElectron())

  onMounted(() => {
    if (!isElectron.value) {
      desktopLyricSettingsState.value = { ...DEFAULT_APP_CONFIG }
      return
    }

    desktopLyricSettingsConsumers += 1
    ensureDesktopLyricConfigListener()

    if (!isDesktopLyricSettingsLoaded) {
      void loadDesktopLyricSettings().catch(error => {
        console.error('[DesktopLyricSettings] Failed to load config', error)
      })
    }
  })

  onUnmounted(() => {
    if (!isElectron.value) {
      return
    }

    desktopLyricSettingsConsumers = Math.max(0, desktopLyricSettingsConsumers - 1)
    if (desktopLyricSettingsConsumers === 0 && desktopLyricConfigUnsubscribe) {
      desktopLyricConfigUnsubscribe()
      desktopLyricConfigUnsubscribe = null
    }
  })

  async function toggleDesktopLyricEnabled(enabled: boolean): Promise<void> {
    await setDesktopLyricConfig('enableDesktopLyric', enabled)
    await getDesktopWindowApi()?.toggleDesktopLyric(enabled)
  }

  async function setDesktopLyricOnTop(alwaysOnTop: boolean): Promise<void> {
    await setDesktopLyricConfig('alwaysOnTop', alwaysOnTop)
    await getDesktopWindowApi()?.setDesktopLyricOnTop(alwaysOnTop)
  }

  async function setLyricColorPreset(preset: AppConfig['lyricColorPreset']): Promise<void> {
    const colors = resolveDesktopLyricPresetColors(preset)
    await setDesktopLyricConfig('lyricColorPreset', preset)
    await setDesktopLyricConfig('lyricPlayedColor', colors.lyricPlayedColor)
    await setDesktopLyricConfig('lyricUnplayedColor', colors.lyricUnplayedColor)
  }

  async function setLyricSetting<K extends ConfigKey>(key: K, value: AppConfig[K]): Promise<void> {
    if (key === 'enableDesktopLyric') {
      await toggleDesktopLyricEnabled(value as AppConfig['enableDesktopLyric'])
      return
    }

    if (key === 'alwaysOnTop') {
      await setDesktopLyricOnTop(value as AppConfig['alwaysOnTop'])
      return
    }

    if (key === 'lyricColorPreset') {
      await setLyricColorPreset(value as AppConfig['lyricColorPreset'])
      return
    }

    await setDesktopLyricConfig(key, value)
  }

  return {
    isElectron,
    desktopLyricSettings: computed(() => desktopLyricSettingsState.value),
    toggleDesktopLyricEnabled,
    setDesktopLyricOnTop,
    setLyricColorPreset,
    setLyricSetting
  }
}
