import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '@shared/protocol/channels'
import type { PlatformDescriptor } from '@shared/types/platform'
import { getIpcProxy } from './ipcProxy'

export interface PluginListPayload {
  platforms: PlatformDescriptor[]
}

export class PluginProxy {
  private readonly ipcProxy = getIpcProxy()

  async list(): Promise<PlatformDescriptor[]> {
    const result = await this.ipcProxy.invoke<PluginListPayload>(INVOKE_CHANNELS.PLUGIN_LIST)
    return result.platforms
  }

  async installFromPath(pluginPath: string): Promise<PlatformDescriptor[]> {
    const result = await this.ipcProxy.invoke<PluginListPayload>(
      INVOKE_CHANNELS.PLUGIN_INSTALL_FROM_PATH,
      pluginPath
    )
    return result.platforms
  }

  async pickInstallPath(mode: 'file' | 'directory' = 'file'): Promise<string | null> {
    return this.ipcProxy.invoke<string | null>(INVOKE_CHANNELS.PLUGIN_PICK_INSTALL_PATH, mode)
  }

  async setEnabled(platformId: string, enabled: boolean): Promise<PlatformDescriptor[]> {
    const result = await this.ipcProxy.invoke<PluginListPayload>(
      INVOKE_CHANNELS.PLUGIN_SET_ENABLED,
      platformId,
      enabled
    )
    return result.platforms
  }

  async uninstall(platformId: string): Promise<PlatformDescriptor[]> {
    const result = await this.ipcProxy.invoke<PluginListPayload>(
      INVOKE_CHANNELS.PLUGIN_UNINSTALL,
      platformId
    )
    return result.platforms
  }

  async getSettings(platformId: string): Promise<Record<string, unknown>> {
    const result = await this.ipcProxy.invoke<{ settings: Record<string, unknown> }>(
      INVOKE_CHANNELS.PLUGIN_GET_SETTINGS,
      platformId
    )
    return result.settings
  }

  async updateSettings(
    platformId: string,
    settings: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const result = await this.ipcProxy.invoke<{ settings: Record<string, unknown> }>(
      INVOKE_CHANNELS.PLUGIN_UPDATE_SETTINGS,
      platformId,
      settings
    )
    return result.settings
  }

  async call(platformId: string, method: string, payload: unknown): Promise<unknown> {
    return this.ipcProxy.invoke(INVOKE_CHANNELS.PLUGIN_CALL, platformId, method, payload)
  }

  onChanged(listener: (platforms: PlatformDescriptor[]) => void): () => void {
    return this.ipcProxy.on<{ platforms: PlatformDescriptor[] }>(
      RECEIVE_CHANNELS.PLUGIN_CHANGED,
      payload => listener(payload.platforms)
    )
  }
}

let globalPluginProxy: PluginProxy | null = null

export function getPluginProxy(): PluginProxy {
  if (!globalPluginProxy) {
    globalPluginProxy = new PluginProxy()
  }

  return globalPluginProxy
}
