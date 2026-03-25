/**
 * 窗口控制 IPC 处理器
 */

import { screen } from 'electron'
import { INVOKE_CHANNELS, SEND_CHANNELS } from '../../shared/protocol/channels.ts'
import { ipcService } from '../IpcService'
import type { WindowManager } from '../../WindowManager'

export function registerWindowHandlers(windowManager: WindowManager): void {
  ipcService.registerInvoke(INVOKE_CHANNELS.WINDOW_GET_SIZE, async () => {
    const win = windowManager.getWindow()
    if (!win) {
      throw new Error('No window available')
    }
    const [width, height] = win.getSize()
    return Promise.resolve({ width, height })
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.WINDOW_IS_MAXIMIZED, async () => {
    const win = windowManager.getWindow()
    return Promise.resolve(win?.isMaximized() ?? false)
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.WINDOW_IS_MINIMIZED, async () => {
    const win = windowManager.getWindow()
    return Promise.resolve(win?.isMinimized() ?? false)
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.WINDOW_GET_STATE, async () => {
    return Promise.resolve(windowManager.getWindowState())
  })

  ipcService.registerSend(SEND_CHANNELS.WINDOW_MINIMIZE, () => {
    windowManager.minimize()
  })

  ipcService.registerSend(SEND_CHANNELS.WINDOW_MAXIMIZE, () => {
    windowManager.maximize()
  })

  ipcService.registerSend(SEND_CHANNELS.WINDOW_CLOSE, () => {
    windowManager.close()
  })

  ipcService.registerSend(SEND_CHANNELS.WINDOW_MINIMIZE_TO_TRAY, () => {
    windowManager.minimizeToTray()
  })

  ipcService.registerSend(SEND_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP, (alwaysOnTop: boolean) => {
    windowManager.setAlwaysOnTop(alwaysOnTop)
  })

  ipcService.registerSend(SEND_CHANNELS.WINDOW_TOGGLE_FULLSCREEN, () => {
    windowManager.toggleFullScreen()
  })

  ipcService.registerSend(SEND_CHANNELS.WINDOW_RESTORE, () => {
    windowManager.restore()
  })

  ipcService.registerSend(SEND_CHANNELS.WINDOW_SHOW, () => {
    windowManager.show()
  })

  ipcService.registerSend(SEND_CHANNELS.WINDOW_HIDE, () => {
    windowManager.hide()
  })

  ipcService.registerSend(
    SEND_CHANNELS.WINDOW_RESIZE,
    ({ width, height }: { width: number; height: number }) => {
      const win = windowManager.getWindow()
      if (!win) return

      const display = screen.getPrimaryDisplay()
      const { width: maxWidth, height: maxHeight } = display.workAreaSize
      const validWidth = Math.max(400, Math.min(width, maxWidth))
      const validHeight = Math.max(80, Math.min(height, maxHeight))

      win.setSize(validWidth, validHeight)
    }
  )
}
