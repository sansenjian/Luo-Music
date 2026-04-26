import {
  getPlatformDescriptors,
  replaceRuntimePlatformDescriptors,
  type PlatformDescriptor
} from '@/platform/music/descriptors'

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

function syncPlatformDescriptors(platforms: PlatformDescriptor[]): PlatformDescriptor[] {
  replaceRuntimePlatformDescriptors(platforms)
  return platforms
}

export function createPluginService(deps: PluginServiceDeps = {}): PluginService {
  const isElectron =
    deps.isElectron ?? (() => typeof window !== 'undefined' && Boolean(window.electronAPI))
  const getPluginBridge = deps.getPluginBridge ?? resolvePluginBridge

  const listBuiltinPlatforms = () => getPlatformDescriptors()

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
    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin management is only available in Electron')
    }

    return syncPlatformDescriptors(await bridge.setEnabled(platformId, enabled))
  }

  async function uninstall(platformId: string): Promise<PlatformDescriptor[]> {
    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin management is only available in Electron')
    }

    return syncPlatformDescriptors(await bridge.uninstall(platformId))
  }

  async function getSettings(platformId: string): Promise<Record<string, unknown>> {
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
    const bridge = getPluginBridge()
    if (!isElectron() || !bridge) {
      throw new Error('Plugin management is only available in Electron')
    }

    const result = await bridge.updateSettings(platformId, settings)
    await refreshPlatformDescriptors()
    return result
  }

  async function call(platformId: string, method: string, payload: unknown): Promise<unknown> {
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
