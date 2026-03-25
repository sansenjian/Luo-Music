/**
 * 桌面歌词 IPC 处理器
 */

import { INVOKE_CHANNELS, SEND_CHANNELS } from '../../shared/protocol/channels.ts'
import { ipcService } from '../IpcService'
import type { LyricTimeUpdate } from '../types'
import { desktopLyricManager } from '../../DesktopLyricManager'

export function registerLyricHandlers(): void {
  // ========== Invoke Handlers ==========

  ipcService.registerInvoke(INVOKE_CHANNELS.LYRIC_TOGGLE, async (show?: boolean) => {
    if (show === true) {
      desktopLyricManager.show()
      return
    }

    if (show === false) {
      desktopLyricManager.hide()
      return
    }

    desktopLyricManager.toggle()
  })

  ipcService.registerInvoke(
    INVOKE_CHANNELS.LYRIC_SET_ALWAYS_ON_TOP,
    async (alwaysOnTop: boolean) => {
      desktopLyricManager.setAlwaysOnTop(alwaysOnTop)
    }
  )

  ipcService.registerInvoke(INVOKE_CHANNELS.LYRIC_LOCK, async (locked: boolean) => {
    desktopLyricManager.setLocked(locked)
  })

  // ========== Send Handlers ==========

  ipcService.registerSend(SEND_CHANNELS.DESKTOP_LYRIC_TOGGLE, () => {
    desktopLyricManager.toggle()
  })

  ipcService.registerSend(SEND_CHANNELS.DESKTOP_LYRIC_CONTROL, (action: string) => {
    switch (action) {
      case 'show':
        desktopLyricManager.show()
        break
      case 'hide':
        desktopLyricManager.hide()
        break
      case 'close':
        desktopLyricManager.closeWindow()
        break
      case 'lock':
        desktopLyricManager.setLocked(true)
        break
      case 'unlock':
        desktopLyricManager.setLocked(false)
        break
    }
  })

  ipcService.registerSend(SEND_CHANNELS.DESKTOP_LYRIC_TOGGLE_LOCK, () => {
    desktopLyricManager.toggleLock()
  })

  ipcService.registerSend(
    SEND_CHANNELS.DESKTOP_LYRIC_MOVE,
    ({ x, y }: { x: number; y: number }) => {
      desktopLyricManager.move(x, y)
    }
  )

  ipcService.registerSend(SEND_CHANNELS.DESKTOP_LYRIC_SET_IGNORE_MOUSE, (ignore: boolean) => {
    desktopLyricManager.setIgnoreMouse(ignore)
  })

  ipcService.registerSend(SEND_CHANNELS.LYRIC_TIME_UPDATE, (payload: LyricTimeUpdate) => {
    desktopLyricManager.sendLyric(payload)
  })

  ipcService.registerSend(SEND_CHANNELS.DESKTOP_LYRIC_READY, () => {
    desktopLyricManager.onRendererReady()
  })
}
