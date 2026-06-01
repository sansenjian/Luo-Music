/**
 * 应用生命周期管理
 *
 * 负责 Electron 应用的启动、退出、单实例锁定等核心生命周期事件。
 * 遵循 VSCode 的 App 模式，将生命周期管理与业务逻辑分离。
 */

import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'
import logger from '../logger'
import { PROJECT_ROOT } from '../utils/paths'
import { createWindowsStartMenuShortcutScript } from './windowsStartMenuShortcutScript'

export const WINDOWS_APP_USER_MODEL_ID = 'com.sansenjian.luo-music'
const WINDOWS_SQUIRREL_PACKAGE_ID = 'LUO_Music'
const WINDOWS_APP_ICON_FILE = 'tray.ico'
export const APP_DISPLAY_NAME = 'LUO Music'
const START_MENU_PROGRAMS_RELATIVE_PATH = path.join(
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs'
)

export interface WindowsShellIdentity {
  appUserModelId: string
  displayName: string
  iconPath?: string
}

interface WindowsShortcutLaunchTarget {
  arguments: string
  targetPath: string
  workingDirectory: string
}

/**
 * 单实例锁状态
 */
let hasLock = false

/**
 * 请求单实例锁
 * 如果已有实例运行，则退出当前实例
 */
export function requestSingleInstanceLock(): boolean {
  hasLock = app.requestSingleInstanceLock()

  if (!hasLock) {
    logger.warn('Instance already running, quitting...')
    app.quit()
    process.exit(0)
  }

  return hasLock
}

/**
 * 检查是否持有单实例锁
 */
export function hasSingleInstanceLock(): boolean {
  return hasLock
}

/**
 * 设置开发环境用户数据目录
 * 开发模式下使用项目内的 .userData 目录
 */
export function setupDevUserData(): void {
  if (!app.isPackaged) {
    const path = require('node:path')
    const userDataPath = path.join(PROJECT_ROOT, '.userData')
    app.setPath('userData', userDataPath)
    logger.info(`[App] Dev userData path: ${userDataPath}`)
  }
}

/**
 * 设置 Windows Shell 集成所需的 AppUserModelId、显示名称和图标。
 *
 * Windows SMTC、任务栏缩略图和通知中心使用 AppUserModelId 来标识应用，
 * 并通过注册表中的 DisplayName / IconUri 条目来解析显示名称和图标。
 * 如果该 ID 没有注册表条目，Windows 会显示"未知应用"。
 *
 * 这里始终使用固定的 AppUserModelId（不区分开发/生产），并在启动时
 * 向 HKCU 注册表写入 shell 属性，确保 SMTC 正确显示 "LUO Music"。
 */
export function setupWindowsShellIntegration(): void {
  const shellIdentity = getWindowsShellIdentity()
  if (!shellIdentity) {
    return
  }

  app.setName(shellIdentity.displayName)

  app.setAppUserModelId(shellIdentity.appUserModelId)
  logger.info(`[App] Windows AppUserModelId: ${shellIdentity.appUserModelId}`)

  registerAppUserModelIdShellProperties(shellIdentity)
  registerWindowsStartMenuShortcut(shellIdentity)
}

export function getWindowsShellIdentity(): WindowsShellIdentity | null {
  if (process.platform !== 'win32') {
    return null
  }

  return {
    appUserModelId: resolveWindowsAppUserModelId(),
    displayName: APP_DISPLAY_NAME,
    iconPath: resolveWindowsAppIconPath()
  }
}

function resolveWindowsAppUserModelId(): string {
  if (!app.isPackaged) {
    return WINDOWS_APP_USER_MODEL_ID
  }

  const executableName = path.basename(process.execPath, path.extname(process.execPath))

  if (resolveSquirrelUpdateExePath()) {
    return `com.squirrel.${WINDOWS_SQUIRREL_PACKAGE_ID}.${executableName}`
  }

  return WINDOWS_APP_USER_MODEL_ID
}

function resolveSquirrelUpdateExePath(): string | null {
  const squirrelUpdateExePath = path.resolve(path.dirname(process.execPath), '..', 'Update.exe')
  return existsSync(squirrelUpdateExePath) ? squirrelUpdateExePath : null
}

function resolveWindowsAppIconPath(): string | undefined {
  const resourceIconPath =
    typeof process.resourcesPath === 'string'
      ? path.join(process.resourcesPath, WINDOWS_APP_ICON_FILE)
      : ''
  const candidates = [
    process.env.LUO_WINDOWS_APP_ICON_PATH,
    app.isPackaged ? resourceIconPath : path.join(PROJECT_ROOT, 'public', WINDOWS_APP_ICON_FILE),
    path.join(PROJECT_ROOT, 'public', WINDOWS_APP_ICON_FILE),
    process.execPath
  ].filter((candidate): candidate is string => Boolean(candidate))

  return candidates.find(candidate => existsSync(candidate))
}

/**
 * Write the shell properties for the given AppUserModelId into the per-user
 * registry so that Windows SMTC and the taskbar can resolve a human-readable
 * name and icon instead of showing "Unknown application".
 */
function registerAppUserModelIdShellProperties(identity: WindowsShellIdentity): void {
  const escapedId = identity.appUserModelId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const regKey = `HKCU\\Software\\Classes\\AppUserModelId\\${escapedId}`
  const values = [
    ['DisplayName', identity.displayName],
    ...(identity.iconPath ? [['IconUri', identity.iconPath]] : [])
  ] as const

  for (const [name, value] of values) {
    execFile(
      'reg',
      ['add', regKey, '/v', name, '/t', 'REG_EXPAND_SZ', '/d', value, '/f'],
      error => {
        if (error) {
          logger.warn(`[App] Failed to register ${name} for AppUserModelId: ${error.message}`)
        } else {
          logger.info(`[App] Registered ${name} for ${identity.appUserModelId}`)
        }
      }
    )
  }
}

/**
 * Windows resolves AppUserModelId metadata most reliably from Start Menu
 * shortcuts. Registering the same AppUserModelId on the shortcut lets SMTC
 * and other shell surfaces map the helper process back to "LUO Music".
 */
function registerWindowsStartMenuShortcut(identity: WindowsShellIdentity): void {
  const shortcutPath = resolveWindowsStartMenuShortcutPath(identity.displayName)
  if (!shortcutPath) {
    logger.warn('[App] APPDATA is unavailable; skipped Start Menu shortcut registration')
    return
  }

  const launchTarget = resolveWindowsShortcutLaunchTarget()
  const script = createWindowsStartMenuShortcutScript({
    appUserModelId: identity.appUserModelId,
    arguments: launchTarget.arguments,
    description: identity.displayName,
    iconPath: identity.iconPath ?? process.execPath,
    shortcutPath,
    targetPath: launchTarget.targetPath,
    workingDirectory: launchTarget.workingDirectory
  })
  const encodedCommand = Buffer.from(script, 'utf16le').toString('base64')

  execFile(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodedCommand
    ],
    { windowsHide: true },
    error => {
      if (error) {
        logger.warn(`[App] Failed to register Start Menu AppUserModelId shortcut: ${error.message}`)
      } else {
        logger.info(`[App] Registered Start Menu shortcut for ${identity.appUserModelId}`)
      }
    }
  )
}

function resolveWindowsShortcutLaunchTarget(): WindowsShortcutLaunchTarget {
  if (!app.isPackaged) {
    return {
      arguments: quoteCommandLineArguments(process.argv.slice(1)),
      targetPath: process.execPath,
      workingDirectory: PROJECT_ROOT
    }
  }

  const squirrelUpdateExePath = resolveSquirrelUpdateExePath()
  if (squirrelUpdateExePath) {
    return {
      arguments: quoteCommandLineArguments(['--processStart', path.basename(process.execPath)]),
      targetPath: squirrelUpdateExePath,
      workingDirectory: path.dirname(squirrelUpdateExePath)
    }
  }

  return {
    arguments: '',
    targetPath: process.execPath,
    workingDirectory: path.dirname(process.execPath)
  }
}

function resolveWindowsStartMenuShortcutPath(displayName: string): string | null {
  const appDataPath = process.env.APPDATA
  if (!appDataPath) {
    return null
  }

  const safeName = displayName.replace(/[<>:"/\\|?*]/g, '').trim() || APP_DISPLAY_NAME
  return path.join(appDataPath, START_MENU_PROGRAMS_RELATIVE_PATH, `${safeName}.lnk`)
}

function quoteCommandLineArguments(args: readonly string[]): string {
  return args.map(quoteCommandLineArgument).join(' ')
}

function quoteCommandLineArgument(value: string): string {
  if (!value) {
    return '""'
  }

  if (!/[\s"]/u.test(value)) {
    return value
  }

  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/g, '$&$&')}"`
}

/**
 * 注册全局异常处理
 */
export function setupErrorHandlers(): void {
  process.on('uncaughtException', error => {
    logger.error('Uncaught Exception:', error)
  })

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
  })
}

/**
 * 应用生命周期回调类型
 */
export interface AppLifecycleCallbacks {
  onReady: () => Promise<void> | void
  onBeforeQuit?: () => Promise<void> | void
  onWindowAllClosed: () => Promise<void> | void
  onWillQuit: (event: Electron.Event) => Promise<void> | void
  onActivate: () => void
  onSecondInstance: () => void
}

/**
 * 注册应用生命周期事件
 */
export function registerAppLifecycle(callbacks: AppLifecycleCallbacks): void {
  app.on('window-all-closed', async () => {
    await callbacks.onWindowAllClosed()
  })

  app.on('before-quit', async () => {
    await callbacks.onBeforeQuit?.()
  })

  app.on('will-quit', (event: Electron.Event) => {
    event.preventDefault()
    Promise.resolve()
      .then(() => callbacks.onWillQuit(event))
      .catch((error: unknown) => {
        logger.error('[App] Cleanup error during quit:', error)
      })
      .finally(() => {
        app.exit(0)
      })
  })

  app.on('activate', () => {
    callbacks.onActivate()
  })

  app.on('second-instance', () => {
    callbacks.onSecondInstance()
  })

  // 使用 void 操作符显式标记未处理的 Promise
  void app.whenReady().then(async () => {
    logger.info('=== App Ready ===')
    await callbacks.onReady()
  })
}

/**
 * 退出应用
 */
export function quitApp(exitCode = 0): void {
  app.exit(exitCode)
}

/**
 * 获取应用版本
 */
export function getAppVersion(): string {
  return app.getVersion()
}

/**
 * 检查是否为打包后的应用
 */
export function isPackaged(): boolean {
  return app.isPackaged
}
