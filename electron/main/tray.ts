/**
 * 系统托盘管理
 * 
 * 负责创建和管理系统托盘图标、菜单。
 * 遵循 VSCode 的 Tray 模式，将托盘逻辑与主入口分离。
 */

import { Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import type { Tray as TrayType, MenuItemConstructorOptions } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import logger from '../logger'
import { VITE_PUBLIC, __dirname } from '../utils/paths'

/**
 * 托盘实例
 */
let tray: TrayType | null = null

/**
 * 窗口管理器引用
 */
let windowManager: {
  show: () => void
  send: (channel: string, ...args: unknown[]) => void
  setTray: (tray: TrayType, menu: Menu) => void
} | null = null

/**
 * 获取托盘图标路径
 */
function getIconPath(): string | null {
  const possiblePaths = [
    path.join(VITE_PUBLIC as string, 'electron-vite.svg'),
    path.join(__dirname, '../public/electron-vite.svg'),
    path.join(process.resourcesPath, 'app.asar', 'public', 'electron-vite.svg')
  ]
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p
  }
  
  return null
}

/**
 * 创建托盘菜单
 */
function createTrayMenu(): MenuItemConstructorOptions[] {
  return [
    {
      label: '播放/暂停',
      click: () => {
        windowManager?.send('music-playing-control')
      }
    },
    {
      label: '上一首',
      click: () => {
        windowManager?.send('music-song-control', 'prev')
      }
    },
    {
      label: '下一首',
      click: () => {
        windowManager?.send('music-song-control', 'next')
      }
    },
    { type: 'separator' },
    {
      label: '播放模式',
      submenu: [
        {
          label: '顺序播放',
          type: 'radio',
          click: () => windowManager?.send('music-playmode-control', 0)
        },
        {
          label: '列表循环',
          type: 'radio',
          click: () => windowManager?.send('music-playmode-control', 1)
        },
        {
          label: '单曲循环',
          type: 'radio',
          click: () => windowManager?.send('music-playmode-control', 2)
        },
        {
          label: '随机播放',
          type: 'radio',
          click: () => windowManager?.send('music-playmode-control', 3)
        }
      ]
    },
    { type: 'separator' },
    {
      label: '显示窗口',
      click: () => {
        windowManager?.show()
      }
    },
    {
      label: '退出',
      click: () => {
        const { app } = require('electron')
        app.exit(0)
      }
    }
  ]
}

/**
 * 设置窗口管理器引用
 */
export function setWindowManager(manager: typeof windowManager): void {
  windowManager = manager
}

/**
 * 创建系统托盘
 */
export function createTray(): TrayType | null {
  const iconPath = getIconPath()
  
  if (!iconPath) {
    logger.warn('Tray icon not found, skipping tray creation')
    return null
  }
  
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  
  const contextMenu = Menu.buildFromTemplate(createTrayMenu())
  
  tray.setToolTip('LUO Music')
  tray.setContextMenu(contextMenu)
  
  tray.on('double-click', () => {
    windowManager?.show()
  })
  
  if (windowManager) {
    windowManager.setTray(tray, contextMenu)
  }
  
  logger.info('[Tray] System tray created')
  return tray
}

/**
 * 获取托盘实例
 */
export function getTray(): TrayType | null {
  return tray
}

/**
 * 更新托盘菜单
 */
export function updateTrayMenu(): void {
  if (!tray) return
  
  const contextMenu = Menu.buildFromTemplate(createTrayMenu())
  tray.setContextMenu(contextMenu)
}

/**
 * 销毁托盘
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
    logger.info('[Tray] System tray destroyed')
  }
}