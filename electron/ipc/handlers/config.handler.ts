import { ipcService } from '../IpcService'
import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '../../shared/protocol/channels.ts'

import type { AppConfig, ConfigKey, ConfigChangeEvent } from '../../shared/config'

type ElectronStoreShape = {
  get: <T>(key: string, defaultValue?: T) => T
  set: (key: string, value: unknown) => void
  delete: (key: string) => void
}

const StoreModule = require('electron-store') as {
  default?: new (options?: { projectName: string }) => ElectronStoreShape
}

const Store =
  StoreModule.default ??
  (StoreModule as unknown as new (options?: { projectName: string }) => ElectronStoreShape)

const store = new Store({ projectName: 'luo-music' })

const CONFIG_STORE_KEY = 'appConfig'

const DEFAULT_CONFIG: AppConfig = {
  playMode: 'list',
  defaultVolume: 0.7,
  autoPlay: false,
  lyricFontSize: 20,
  lyricFontFamily: 'Noto Sans SC',
  showTranslation: true,
  enableDesktopLyric: false,
  alwaysOnTop: false,
  cacheSize: 512,
  enableCache: true,
  theme: 'system',
  language: 'zh-CN'
}

function readConfig(): AppConfig {
  const storedConfig = store.get<Partial<AppConfig> | undefined>(CONFIG_STORE_KEY, undefined)

  return {
    ...DEFAULT_CONFIG,
    ...(storedConfig ?? {})
  }
}

function writeConfig(nextConfig: AppConfig): void {
  store.set(CONFIG_STORE_KEY, nextConfig)
}

function emitConfigChange(event: ConfigChangeEvent): void {
  ipcService.broadcast(RECEIVE_CHANNELS.CONFIG_CHANGED, event)
}

function assertConfigKey(key: string): asserts key is ConfigKey {
  if (!(key in DEFAULT_CONFIG)) {
    throw new Error(`Unknown config key: ${key}`)
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function assertConfigValue<K extends ConfigKey>(
  key: K,
  value: unknown
): asserts value is AppConfig[K] {
  const isValid = (() => {
    switch (key) {
      case 'playMode':
        return value === 'list' || value === 'loop' || value === 'random'
      case 'defaultVolume':
        return isFiniteNumber(value) && value >= 0 && value <= 1
      case 'autoPlay':
      case 'showTranslation':
      case 'enableDesktopLyric':
      case 'alwaysOnTop':
      case 'enableCache':
        return typeof value === 'boolean'
      case 'lyricFontSize':
        return isFiniteNumber(value) && value > 0
      case 'lyricFontFamily':
        return typeof value === 'string' && value.trim().length > 0
      case 'cacheSize':
        return isFiniteNumber(value) && value >= 0
      case 'theme':
        return value === 'light' || value === 'dark' || value === 'system'
      case 'language':
        return value === 'zh-CN' || value === 'en-US'
      default:
        return false
    }
  })()

  if (!isValid) {
    throw new Error(`Invalid config value for ${key}`)
  }
}

export function registerConfigHandlers(): void {
  ipcService.registerInvoke(INVOKE_CHANNELS.CONFIG_GET, async (key: string) => {
    assertConfigKey(key)
    return readConfig()[key]
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.CONFIG_GET_ALL, async () => {
    return readConfig()
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.CONFIG_SET, async (key: string, value: unknown) => {
    assertConfigKey(key)
    assertConfigValue(key, value)

    const currentConfig = readConfig()
    const oldValue = currentConfig[key]
    const nextConfig = {
      ...currentConfig,
      [key]: value as AppConfig[typeof key]
    }

    writeConfig(nextConfig)
    emitConfigChange({ key, oldValue, newValue: nextConfig[key] })
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.CONFIG_DELETE, async (key: string) => {
    assertConfigKey(key)

    const currentConfig = readConfig()
    const oldValue = currentConfig[key]
    const nextConfig = {
      ...currentConfig,
      [key]: DEFAULT_CONFIG[key]
    }

    writeConfig(nextConfig)
    emitConfigChange({ key, oldValue, newValue: nextConfig[key] })
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.CONFIG_RESET, async (key?: string) => {
    if (typeof key === 'string') {
      assertConfigKey(key)

      const currentConfig = readConfig()
      const oldValue = currentConfig[key]
      const newValue = DEFAULT_CONFIG[key]
      const nextConfig = {
        ...currentConfig,
        [key]: newValue
      }

      writeConfig(nextConfig)
      emitConfigChange({ key, oldValue, newValue })
      return
    }

    const currentConfig = readConfig()
    writeConfig({ ...DEFAULT_CONFIG })

    for (const configKey of Object.keys(DEFAULT_CONFIG) as ConfigKey[]) {
      emitConfigChange({
        key: configKey,
        oldValue: currentConfig[configKey],
        newValue: DEFAULT_CONFIG[configKey]
      })
    }
  })
}
