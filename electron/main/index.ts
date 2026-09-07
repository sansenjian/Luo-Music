/**
 * 主进程入口模块
 *
 * 遵循 VSCode 的 Code 模式，作为 Electron 主进程的入口点。
 * 负责组装各个子模块，协调应用启动流程。
 */

import 'dotenv/config'
import { join } from 'node:path'

import { BrowserWindow, app, net } from 'electron'
import { desktopLyricManager } from '../DesktopLyricManager'
import { downloadManager } from '../DownloadManager'
import { windowManager } from '../WindowManager'
import logger from '../logger'
import { serviceManager } from '../ServiceManager'
import type { ServiceConfig } from '../types/service'
import { RENDERER_DIST, VITE_PUBLIC } from '../utils/paths'
import { registerPrivilegedLocalMediaScheme } from '../local-library/protocol.privileged'
import { registerLocalMediaProtocol } from '../local-library/protocol'
import { disposeLocalLibraryService } from '../local-library/service'
import { PluginCatalog } from '../plugins/PluginCatalog'

import {
  ipcService,
  errorMiddleware,
  loggerMiddleware,
  performanceMiddleware,
  disposePerformanceMonitor,
  registerWindowHandlers,
  registerCacheHandlers,
  registerConfigHandlers,
  registerPlayerHandlers,
  registerServiceHandlers,
  registerApiHandlers,
  registerLyricHandlers,
  registerLogHandlers,
  registerLocalLibraryHandlers,
  registerPluginHandlers,
  registerLlmHandlers,
  registerSmtcHandlers,
  registerAudioOutputHandlers
} from '../ipc/index'

import {
  requestSingleInstanceLock,
  setupDevUserData,
  setupWindowsShellIntegration,
  setupErrorHandlers,
  registerAppLifecycle,
  getWindowsShellIdentity
} from './app'
import { createTray, destroyTray, setWindowManager as setTrayWindowManager } from './tray'
import {
  registerShortcuts,
  unregisterAllShortcuts,
  setWindowManager as setShortcutsWindowManager
} from './shortcuts'
import { configureSmtcCommandLine } from './smtc'
import { SmtcNativeService, type SmtcNativePlayerCommand } from './smtcNativeService'
import { AudioOutputService } from './audioOutputService'
import { AUDIO_OUTPUT_CACHE_DIR_NAME } from '../cachePolicy'
import { DEFAULT_SHORTCUTS } from '../../src/config/shortcuts'
import { NETEASE_API_PORT, QQ_API_PORT } from '@shared/protocol/cache'
import { RECEIVE_CHANNELS } from '@shared/protocol/channels'

console.log = logger.log.bind(logger)
console.error = logger.error.bind(logger)
console.warn = logger.warn.bind(logger)
console.info = logger.info.bind(logger)

registerPrivilegedLocalMediaScheme()
configureSmtcCommandLine()

const DEFAULT_SERVICE_CONFIG: ServiceConfig = {
  services: {
    netease: {
      enabled: true,
      port: NETEASE_API_PORT
    },
    qq: {
      enabled: true,
      port: QQ_API_PORT
    }
  }
}

let pluginCatalog: PluginCatalog | null = null
let smtcNativeService: SmtcNativeService | null = null
let audioOutputService: AudioOutputService | null = null
const mainStartedAt = Date.now()

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }

  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`
}

async function measureStartupPhase<T>(label: string, action: () => Promise<T> | T): Promise<T> {
  const startedAt = Date.now()

  try {
    const result = await action()
    logger.info(
      `[Startup] ${label}: ${formatDuration(Date.now() - startedAt)} (total ${formatDuration(
        Date.now() - mainStartedAt
      )})`
    )
    return result
  } catch (error) {
    logger.error(
      `[Startup] ${label} failed after ${formatDuration(Date.now() - startedAt)} (total ${formatDuration(
        Date.now() - mainStartedAt
      )})`,
      error
    )
    throw error
  }
}

function measureStartupSyncPhase<T>(label: string, action: () => T): T {
  const startedAt = Date.now()

  try {
    const result = action()
    logger.info(
      `[Startup] ${label}: ${formatDuration(Date.now() - startedAt)} (total ${formatDuration(
        Date.now() - mainStartedAt
      )})`
    )
    return result
  } catch (error) {
    logger.error(
      `[Startup] ${label} failed after ${formatDuration(
        Date.now() - startedAt
      )} (total ${formatDuration(Date.now() - mainStartedAt)})`,
      error
    )
    throw error
  }
}

function startBackgroundStartupPhase<T>(
  label: string,
  action: () => Promise<T> | T,
  onSuccess?: (result: T) => void
): Promise<T | undefined> {
  logger.info(
    `[Startup] ${label}: started in background (total ${formatDuration(
      Date.now() - mainStartedAt
    )})`
  )

  return measureStartupPhase(label, action)
    .then(result => {
      if (onSuccess) {
        try {
          onSuccess(result)
        } catch (error) {
          logger.error(`[Startup] ${label} completion hook failed:`, error)
        }
      }

      return result
    })
    .catch(() => undefined)
}

function getPluginCatalog(): PluginCatalog {
  if (!pluginCatalog) {
    pluginCatalog = new PluginCatalog()
  }

  return pluginCatalog
}

async function initializeApp(): Promise<void> {
  const currentPluginCatalog = getPluginCatalog()

  measureStartupSyncPhase('initialize IPC service', () =>
    initializeIpcService(currentPluginCatalog)
  )
  measureStartupSyncPhase('register local media protocol', registerLocalMediaProtocol)

  logger.info('Starting service warmup in background before creating renderer window...')
  void startBackgroundStartupPhase(
    'initialize ServiceManager',
    () => serviceManager.initialize(DEFAULT_SERVICE_CONFIG),
    () => {
      const allStatus = serviceManager.getAllServiceStatus()
      logger.info('Service status:', JSON.stringify(allStatus, null, 2))
    }
  )

  logger.info('Starting plugin catalog warmup in background...')
  void startBackgroundStartupPhase('initialize PluginCatalog', () =>
    currentPluginCatalog.initialize()
  )

  measureStartupSyncPhase('create main window', () => windowManager.createWindow())
  windowManager.getWindow()?.webContents.once('did-finish-load', () => {
    desktopLyricManager.prewarmWindow()
  })

  measureStartupSyncPhase('create tray', createTray)
  measureStartupSyncPhase('register global shortcuts', () => registerShortcuts(DEFAULT_SHORTCUTS))
  logger.info(
    `[Startup] initializeApp interactive path complete: ${formatDuration(
      Date.now() - mainStartedAt
    )}; background warmup is still allowed to finish`
  )
}

function initializeIpcService(currentPluginCatalog: PluginCatalog): void {
  ipcService.configure({
    defaultTimeout: 15000,
    slowRequestThreshold: 1000,
    enablePerformanceMonitoring: true
  })

  ipcService.use(errorMiddleware)
  ipcService.use(loggerMiddleware)
  ipcService.use(performanceMiddleware)

  registerWindowHandlers(windowManager)
  registerCacheHandlers()
  registerConfigHandlers()
  const shellIdentity = getWindowsShellIdentity()
  smtcNativeService = new SmtcNativeService({
    appName: shellIdentity?.displayName,
    appPath: app.getAppPath(),
    appUserModelId: shellIdentity?.appUserModelId,
    isPackaged: app.isPackaged,
    logger,
    onCommand: handleSmtcNativeCommand,
    onStatusChange: status => {
      ipcService.broadcast(RECEIVE_CHANNELS.SMTC_STATUS_CHANGED, status)
    },
    resourcesPath: process.resourcesPath
  })
  audioOutputService = new AudioOutputService({
    appPath: app.getAppPath(),
    cacheDir: join(app.getPath('userData'), AUDIO_OUTPUT_CACHE_DIR_NAME),
    electronNet: net,
    isPackaged: app.isPackaged,
    logger,
    onStatusChange: status => {
      ipcService.broadcast(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED, status)
    },
    resourcesPath: process.resourcesPath
  })

  registerPlayerHandlers(windowManager, serviceManager, smtcNativeService)
  registerServiceHandlers(serviceManager)
  registerApiHandlers(serviceManager)
  registerLyricHandlers()
  registerLogHandlers()
  registerLocalLibraryHandlers(windowManager)
  registerPluginHandlers(currentPluginCatalog)
  registerLlmHandlers()
  registerSmtcHandlers(smtcNativeService)
  registerAudioOutputHandlers(audioOutputService)

  ipcService.initialize()

  logger.info('[IPC] Unified IPC service initialized')
}

function handleSmtcNativeCommand(command: SmtcNativePlayerCommand): void {
  switch (command.type) {
    case 'play':
      windowManager.send(RECEIVE_CHANNELS.MUSIC_PLAYING_CONTROL, 'play')
      break
    case 'pause':
    case 'stop':
      windowManager.send(RECEIVE_CHANNELS.MUSIC_PLAYING_CONTROL, 'pause')
      break
    case 'nextTrack':
      windowManager.send(RECEIVE_CHANNELS.MUSIC_SONG_CONTROL, 'next')
      break
    case 'previousTrack':
      windowManager.send(RECEIVE_CHANNELS.MUSIC_SONG_CONTROL, 'prev')
      break
    case 'seek':
      windowManager.send(RECEIVE_CHANNELS.MUSIC_PLAYING_CONTROL, {
        type: 'seek',
        time: command.positionSeconds
      })
      break
    case 'toggleShuffle':
    case 'toggleRepeat':
      windowManager.send(RECEIVE_CHANNELS.MUSIC_PLAYMODE_CONTROL, 'toggle')
      break
  }
}

function main(): void {
  requestSingleInstanceLock()
  setupDevUserData()
  setupWindowsShellIntegration()
  setupErrorHandlers()

  pluginCatalog = new PluginCatalog()

  // Sentry 已移除 — 不再加载 @sentry/electron，消除 preload 错误并提升启动速度

  process.env.DIST = RENDERER_DIST
  process.env.VITE_PUBLIC = VITE_PUBLIC

  setTrayWindowManager(windowManager)
  setShortcutsWindowManager(windowManager)

  registerAppLifecycle({
    onReady: initializeApp,

    onBeforeQuit: () => {
      windowManager.markAppQuitting()
    },

    onWindowAllClosed: async () => {
      unregisterAllShortcuts()
      if (process.platform !== 'darwin') {
        const { app } = require('electron')
        app.quit()
      }
    },

    onWillQuit: async () => {
      unregisterAllShortcuts()
      desktopLyricManager.closeWindow()
      destroyTray()
      downloadManager.dispose()
      smtcNativeService?.dispose()
      await audioOutputService?.dispose()
      await disposeLocalLibraryService()
      disposePerformanceMonitor()
      ipcService.dispose()
      await pluginCatalog?.dispose()
      await serviceManager.stopAllServices()
    },

    onActivate: () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        windowManager.createWindow()
      }
    },

    onSecondInstance: () => {
      windowManager.restore()
    }
  })
}

main()
