import {
  getPlatformDescriptors,
  replaceRuntimePlatformDescriptors,
  type PlatformDescriptor
} from '@/platform/music/descriptors'
import { useExperimentalFeatures } from '@/composables/useExperimentalFeatures'

const FIRST_PARTY_SMTC_PLUGIN_ID = 'builtin.smtc'
const FIRST_PARTY_COVER_SWIPE_PLUGIN_ID = 'builtin.cover-swipe'

const firstPartyExtensionPluginIds = new Set([
  FIRST_PARTY_SMTC_PLUGIN_ID,
  FIRST_PARTY_COVER_SWIPE_PLUGIN_ID
])

const extensionCapabilities = {
  search: false,
  songUrl: false,
  songDetail: false,
  lyric: false,
  playlistDetail: false,
  needsHydration: false,
  supportsLyricFetch: false,
  supportsUrlRefreshOnFailure: false
} satisfies PlatformDescriptor['capabilities']

export type PluginBridge = {
  list(): Promise<PlatformDescriptor[]>
  installFromPath(pluginPath: string): Promise<PlatformDescriptor[]>
  pickInstallPath(): Promise<string | null>
  setEnabled(platformId: string, enabled: boolean): Promise<PlatformDescriptor[]>
  uninstall(platformId: string): Promise<PlatformDescriptor[]>
  getSettings(platformId: string): Promise<Record<string, unknown>>
  updateSettings(
    platformId: string,
    settings: Record<string, unknown>
  ): Promise<Record<string, unknown>>
  call(platformId: string, method: string, payload: unknown): Promise<unknown>
  onChanged(listener: (platforms: PlatformDescriptor[]) => void): () => void
}

export type PluginService = {
  listPlatforms(): Promise<PlatformDescriptor[]>
  refreshPlatformDescriptors(): Promise<PlatformDescriptor[]>
  installFromPath(pluginPath: string): Promise<PlatformDescriptor[]>
  pickInstallPath(): Promise<string | null>
  setEnabled(platformId: string, enabled: boolean): Promise<PlatformDescriptor[]>
  uninstall(platformId: string): Promise<PlatformDescriptor[]>
  getSettings(platformId: string): Promise<Record<string, unknown>>
  updateSettings(
    platformId: string,
    settings: Record<string, unknown>
  ): Promise<Record<string, unknown>>
  call(platformId: string, method: string, payload: unknown): Promise<unknown>
  onPlatformsChanged(listener: (platforms: PlatformDescriptor[]) => void): () => void
}

export type PluginServiceDeps = {
  isElectron?: () => boolean
  getPluginBridge?: () => PluginBridge | undefined
}

function resolvePluginBridge(): PluginBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (window as Window & { services?: { plugins?: PluginBridge } }).services?.plugins
}

function createFirstPartyExtensionDescriptor(input: {
  id: string
  displayName: string
  description: string
  version: string
  enabled: boolean
}): PlatformDescriptor {
  return {
    id: input.id,
    displayName: input.displayName,
    description: input.description,
    version: input.version,
    source: 'builtin',
    runtime: 'local',
    category: 'extension',
    enabled: input.enabled,
    status: input.enabled ? 'ready' : 'disabled',
    capabilities: { ...extensionCapabilities }
  }
}

function createFirstPartyExtensionDescriptors(isElectron: boolean): PlatformDescriptor[] {
  const { smtcEnabled, coverSwipeEnabled } = useExperimentalFeatures()
  const descriptors: PlatformDescriptor[] = [
    createFirstPartyExtensionDescriptor({
      id: FIRST_PARTY_COVER_SWIPE_PLUGIN_ID,
      displayName: '滑动封面切歌',
      description: '在播放器封面区域左右滑动切换上一首或下一首。',
      version: '1.0.0',
      enabled: coverSwipeEnabled.value
    })
  ]

  if (isElectron) {
    descriptors.unshift(
      createFirstPartyExtensionDescriptor({
        id: FIRST_PARTY_SMTC_PLUGIN_ID,
        displayName: 'Windows SMTC',
        description: '将播放状态同步到 Windows 系统媒体控制面板。',
        version: '1.0.0',
        enabled: smtcEnabled.value
      })
    )
  }

  return descriptors
}

function mergeFirstPartyExtensionDescriptors(
  platforms: PlatformDescriptor[],
  isElectron: boolean
): PlatformDescriptor[] {
  const merged = new Map(platforms.map(platform => [platform.id, platform]))

  for (const descriptor of createFirstPartyExtensionDescriptors(isElectron)) {
    merged.set(descriptor.id, descriptor)
  }

  return Array.from(merged.values())
}

function isFirstPartyExtensionPlugin(platformId: string): boolean {
  return firstPartyExtensionPluginIds.has(platformId)
}

function setFirstPartyExtensionEnabled(platformId: string, enabled: boolean): boolean {
  const { setSMTCEnabled, setCoverSwipeEnabled } = useExperimentalFeatures()

  switch (platformId) {
    case FIRST_PARTY_SMTC_PLUGIN_ID:
      setSMTCEnabled(enabled)
      return true
    case FIRST_PARTY_COVER_SWIPE_PLUGIN_ID:
      setCoverSwipeEnabled(enabled)
      return true
    default:
      return false
  }
}

export function createPluginService(deps: PluginServiceDeps = {}): PluginService {
  const isElectron =
    deps.isElectron ?? (() => typeof window !== 'undefined' && Boolean(window.electronAPI))
  const getPluginBridge = deps.getPluginBridge ?? resolvePluginBridge

  const listBuiltinPlatforms = () =>
    mergeFirstPartyExtensionDescriptors(getPlatformDescriptors(), isElectron())

  function syncPlatformDescriptors(platforms: PlatformDescriptor[]): PlatformDescriptor[] {
    const nextPlatforms = mergeFirstPartyExtensionDescriptors(platforms, isElectron())
    replaceRuntimePlatformDescriptors(nextPlatforms)
    return nextPlatforms
  }

  async function listPlatforms(): Promise<PlatformDescriptor[]> {
    if (!isElectron()) {
      return listBuiltinPlatforms()
    }

    const bridge = getPluginBridge()
    if (!bridge) {
      return listBuiltinPlatforms()
    }

    return syncPlatformDescriptors(await bridge.list())
  }

  async function refreshPlatformDescriptors(): Promise<PlatformDescriptor[]> {
    return listPlatforms()
  }

  async function installFromPath(pluginPath: string): Promise<PlatformDescriptor[]> {
    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin installation is only available in Electron')
    }

    return syncPlatformDescriptors(await bridge.installFromPath(pluginPath))
  }

  async function pickInstallPath(): Promise<string | null> {
    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin installation is only available in Electron')
    }

    return bridge.pickInstallPath()
  }

  async function setEnabled(platformId: string, enabled: boolean): Promise<PlatformDescriptor[]> {
    if (setFirstPartyExtensionEnabled(platformId, enabled)) {
      return refreshPlatformDescriptors()
    }

    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin management is only available in Electron')
    }

    return syncPlatformDescriptors(await bridge.setEnabled(platformId, enabled))
  }

  async function uninstall(platformId: string): Promise<PlatformDescriptor[]> {
    if (isFirstPartyExtensionPlugin(platformId)) {
      throw new Error('First-party extension plugins cannot be uninstalled')
    }

    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin management is only available in Electron')
    }

    return syncPlatformDescriptors(await bridge.uninstall(platformId))
  }

  async function getSettings(platformId: string): Promise<Record<string, unknown>> {
    if (isFirstPartyExtensionPlugin(platformId)) {
      return {}
    }

    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      return {}
    }

    return bridge.getSettings(platformId)
  }

  async function updateSettings(
    platformId: string,
    settings: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (isFirstPartyExtensionPlugin(platformId)) {
      return {}
    }

    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin management is only available in Electron')
    }

    const result = await bridge.updateSettings(platformId, settings)
    await refreshPlatformDescriptors()
    return result
  }

  async function call(platformId: string, method: string, payload: unknown): Promise<unknown> {
    if (isFirstPartyExtensionPlugin(platformId)) {
      throw new Error('First-party extension plugins do not expose external calls')
    }

    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('External plugin calls are only available in Electron')
    }

    return bridge.call(platformId, method, payload)
  }

  function onPlatformsChanged(listener: (platforms: PlatformDescriptor[]) => void): () => void {
    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      return () => {}
    }

    return bridge.onChanged(platforms => {
      listener(syncPlatformDescriptors(platforms))
    })
  }

  const service: PluginService = {
    listPlatforms,
    refreshPlatformDescriptors,
    installFromPath,
    pickInstallPath,
    setEnabled,
    uninstall,
    getSettings,
    updateSettings,
    call,
    onPlatformsChanged
  }

  if (isElectron()) {
    Promise.resolve()
      .then(() => service.refreshPlatformDescriptors())
      .catch(() => {})
  }

  return service
}
