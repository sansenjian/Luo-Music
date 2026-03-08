import { createRequire } from 'node:module'
import { windowManager } from './WindowManager'

const require = createRequire(__filename)
const { ipcMain } = require('electron')

// 定义播放器相关的 IPC 通道
export const PLAYER_CHANNELS = [
  'music-playing-control',
  'music-song-control',
  'music-playmode-control',
  'music-volume-up',
  'music-volume-down',
  'music-process-control',
  'music-compact-mode-control',
  'hide-player'
]

/**
 * 初始化播放器 IPC 监听
 * 允许渲染进程发送这些事件，主进程收到后可以转发给窗口
 * 这实现了一个简单的 Event Bus，允许渲染进程触发全局操作
 */
export function initPlayerIPC() {
  PLAYER_CHANNELS.forEach(channel => {
    ipcMain.on(channel, (event, ...args) => {
      // 转发给主窗口
      // 注意：如果事件原本就是从主窗口发出的，这里会发回去，可能导致死循环或重复处理
      // 只有当需要跨窗口通信，或者需要主进程处理时才需要这样
      // 目前主要用于：快捷键/托盘 -> 主进程 -> 渲染进程
      // 如果渲染进程自己想触发，直接调用 store 方法即可，不需要走 IPC
      
      // 但为了统一性，如果渲染进程通过 ipcRenderer.send 发送了这些事件
      // 我们将其转发给主窗口（确保即使是其他窗口发出的也能被主窗口收到）
      const mainWindow = windowManager.getWindow()
      if (mainWindow && event.sender.id !== mainWindow.webContents.id) {
         windowManager.send(channel, ...args)
      } else if (!mainWindow) {
         // 如果主窗口不存在，尝试获取
         windowManager.send(channel, ...args)
      }
    })
  })
}
