import { dialog, BrowserWindow, type OpenDialogOptions } from 'electron'
import { ipcService } from '../IpcService'
import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '@shared/protocol/channels'
import type { PluginCatalog } from '../../plugins/PluginCatalog'
import type { PluginMethodName } from '../../plugins/types'

export function registerPluginHandlers(pluginCatalog: PluginCatalog): void {
  ipcService.registerInvoke(INVOKE_CHANNELS.PLUGIN_LIST, async () => ({
    platforms: await pluginCatalog.listPlatforms()
  }))

  ipcService.registerInvoke(
    INVOKE_CHANNELS.PLUGIN_INSTALL_FROM_PATH,
    async (pluginPath: string) => {
      return pluginCatalog.installFromPath(pluginPath)
    }
  )

  ipcService.registerInvoke(INVOKE_CHANNELS.PLUGIN_PICK_INSTALL_PATH, async (mode = 'file') => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const isDirectoryMode = mode === 'directory'
    const dialogOptions: OpenDialogOptions = {
      title: isDirectoryMode ? '选择插件目录或 zip 包目录' : '选择插件 manifest.json 或 zip 包',
      properties: [isDirectoryMode ? 'openDirectory' : 'openFile'],
      ...(isDirectoryMode
        ? {}
        : { filters: [{ name: 'Plugin Package or Manifest', extensions: ['zip', 'json'] }] })
    }

    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcService.registerInvoke(
    INVOKE_CHANNELS.PLUGIN_SET_ENABLED,
    async (platformId: string, enabled: boolean) => {
      return pluginCatalog.setEnabled(platformId, enabled)
    }
  )

  ipcService.registerInvoke(INVOKE_CHANNELS.PLUGIN_UNINSTALL, async (platformId: string) => {
    return pluginCatalog.uninstall(platformId)
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.PLUGIN_GET_SETTINGS, async (platformId: string) => ({
    settings: await pluginCatalog.getSettings(platformId)
  }))

  ipcService.registerInvoke(
    INVOKE_CHANNELS.PLUGIN_UPDATE_SETTINGS,
    async (platformId: string, settings: Record<string, unknown>) => ({
      settings: await pluginCatalog.updateSettings(platformId, settings)
    })
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.PLUGIN_CALL,
    async (platformId: string, method: PluginMethodName, payload: unknown) => {
      return pluginCatalog.call(platformId, method, payload)
    }
  )

  pluginCatalog.onDidChange(platforms => {
    ipcService.broadcast(RECEIVE_CHANNELS.PLUGIN_CHANGED, { platforms })
  })
}
