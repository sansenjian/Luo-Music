# 统一 IPC 处理方案

## 当前问题分析

### 1. IPC 定义分散

| 文件 | 用途 | 问题 |
|------|------|------|
| `electron/shared/protocol/channels.ts` | 通道常量定义 | 仅有常量，无类型安全 |
| `electron/ipc.ts` | 播放器控制、API 网关 | 混合了业务逻辑 |
| `electron/WindowManager.ts` | 窗口控制 IPC | 直接在类中注册 |
| `electron/cacheManager.ts` | 缓存管理 IPC | 直接在类中注册 |
| `electron/DesktopLyricManager.ts` | 桌面歌词 IPC | 直接在类中注册 |
| `electron/main/index.ts` | 服务管理、日志 | 分散在多个函数中 |

### 2. 主要问题

1. **IPC 处理分散**：每个 Manager 都在自己的类中注册 IPC，缺乏统一管理
2. **类型不安全**：通道名称和使用处没有类型关联
3. **重复注册风险**：多个文件可能注册相同通道
4. **难以测试**：IPC 逻辑与业务逻辑耦合
5. **缺少中间件**：没有统一的错误处理、日志记录、权限验证

---

## VSCode 的 IPC 架构借鉴

VSCode 使用 `IpcService` 模式：

```
src/vs/workbench/electron-sandbox/
├── ipc.electron.ts          # IPC 通道定义和类型
├── ipcService.ts            # 统一的 IPC 服务层
└── channels.ts              # 通道映射

src/vs/platform/ipc/
├── common/
│   ├── ipc.service.ts       # 服务抽象
│   └── ipc.model.ts         # 数据模型
├── electron-main/
│   └── ipc.electron-main.ts # 主进程实现
└── electron-sandbox/
    └── ipc.electron-sandbox.ts # 渲染进程实现
```

**核心设计原则**：
1. **通道注册与服务分离**：服务层不直接使用 `ipcMain`，而是通过 `IpcService`
2. **类型安全的通道映射**：每个通道有明确的参数和返回类型
3. **统一的错误处理**：所有 IPC 调用经过统一错误处理
4. **懒加载**：通道按需注册，避免启动时加载所有服务

---

## 统一 IPC 方案

### 架构设计

```
electron/ipc/
├── index.ts                 # 统一导出
├── channels.ts              # 通道定义（扩展现有）
├── types.ts                 # 类型定义
├── IpcService.ts            # 核心服务类
├── handlers/
│   ├── window.handler.ts    # 窗口控制处理
│   ├── cache.handler.ts     # 缓存处理
│   ├── player.handler.ts    # 播放器处理
│   ├── service.handler.ts   # 服务管理处理
│   ├── api.handler.ts       # API 网关处理
│   └── lyric.handler.ts     # 桌面歌词处理
└── middleware/
    ├── error.ts             # 错误处理中间件
    ├── logger.ts            # 日志中间件
    └── validate.ts          # 参数验证中间件
```

### 1. 增强的通道定义 (`electron/ipc/channels.ts`)

```typescript
/**
 * IPC 通道定义 - 包含类型信息
 */

// ========== Invoke 通道（双向通信） ==========

export const INVOKE_CHANNELS = {
  // 缓存管理
  CACHE_GET_SIZE: 'cache:get-size',
  CACHE_CLEAR: 'cache:clear',
  CACHE_CLEAR_ALL: 'cache:clear-all',
  CACHE_GET_PATHS: 'cache:get-paths',

  // API 网关
  API_REQUEST: 'api:request',
  API_GET_SERVICES: 'api:services',

  // 服务管理
  SERVICE_GET_STATUS: 'service:status',
  SERVICE_START: 'service:start',
  SERVICE_STOP: 'service:stop',
  SERVICE_STATUS_ALL: 'service:status:all',
  SERVICE_RESTART: 'service:restart',
  SERVICE_HEALTH: 'service:health',
  SERVICE_UPDATE_CONFIG: 'service:update-config',

  // 窗口控制
  WINDOW_GET_SIZE: 'window:get-size',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_IS_MINIMIZED: 'window:is-minimized',
} as const

// ========== Send 通道（单向：渲染 -> 主进程） ==========

export const SEND_CHANNELS = {
  // 窗口控制
  WINDOW_MINIMIZE: 'minimize-window',
  WINDOW_MAXIMIZE: 'maximize-window',
  WINDOW_CLOSE: 'close-window',
  WINDOW_RESIZE: 'resize-window',

  // 播放器状态
  MUSIC_PLAYING_CHECK: 'music-playing-check',
  MUSIC_PLAYMODE_TRAY_CHANGE: 'music-playmode-tray-change',

  // 桌面歌词
  DESKTOP_LYRIC_TOGGLE: 'toggle-desktop-lyric',
  DESKTOP_LYRIC_CONTROL: 'desktop-lyric-control',
  DESKTOP_LYRIC_TOGGLE_LOCK: 'toggle-desktop-lyric-lock',
  DESKTOP_LYRIC_MOVE: 'desktop-lyric-move',
  DESKTOP_LYRIC_SET_IGNORE_MOUSE: 'desktop-lyric-set-ignore-mouse',

  // 下载
  DOWNLOAD_MUSIC: 'download-music',

  // 日志
  LOG_MESSAGE: 'log-message',

  // 错误报告
  ERROR_REPORT: 'error-report',
} as const

// ========== Receive 通道（单向：主进程 -> 渲染） ==========

export const RECEIVE_CHANNELS = {
  // 通用消息
  MAIN_PROCESS_MESSAGE: 'main-process-message',

  // 缓存
  CACHE_CLEARED: 'cache-cleared',

  // 播放器控制
  MUSIC_PLAYING_CONTROL: 'music-playing-control',
  MUSIC_SONG_CONTROL: 'music-song-control',
  MUSIC_PLAYMODE_CONTROL: 'music-playmode-control',
  MUSIC_VOLUME_UP: 'music-volume-up',
  MUSIC_VOLUME_DOWN: 'music-volume-down',
  MUSIC_PROCESS_CONTROL: 'music-process-control',
  MUSIC_COMPACT_MODE_CONTROL: 'music-compact-mode-control',

  // 界面
  HIDE_PLAYER: 'hide-player',

  // 歌词
  LYRIC_UPDATE: 'lyric-update',
  LYRIC_TIME_UPDATE: 'lyric-time-update',
  DESKTOP_LYRIC_LOCK_STATE: 'desktop-lyric-lock-state',

  // 下载
  DOWNLOAD_PROGRESS: 'download-progress',
  DOWNLOAD_COMPLETE: 'download-complete',
  DOWNLOAD_FAILED: 'download-failed',
} as const
```

### 2. 类型定义 (`electron/ipc/types.ts`)

```typescript
/**
 * IPC 通道类型定义
 * 为每个通道定义参数和返回类型
 */

import type {
  INVOKE_CHANNELS,
  SEND_CHANNELS,
  RECEIVE_CHANNELS
} from './channels'

// ========== Invoke 通道类型 ==========

export interface InvokeChannelMap {
  // 缓存管理
  [INVOKE_CHANNELS.CACHE_GET_SIZE]: { params: []; result: { httpCache: number; httpCacheFormatted: string } }
  [INVOKE_CHANNELS.CACHE_CLEAR]: { params: [CacheClearOptions]; result: CacheClearResult }
  [INVOKE_CHANNELS.CACHE_CLEAR_ALL]: { params: [keepUserData?: boolean]; result: CacheClearResult }
  [INVOKE_CHANNELS.CACHE_GET_PATHS]: { params: []; result: Record<string, string> }

  // API 网关
  [INVOKE_CHANNELS.API_REQUEST]: {
    params: [{ service: string; endpoint: string; params: Record<string, unknown>; noCache?: boolean }]
    result: { success: boolean; data?: unknown; error?: string; cached?: boolean }
  }
  [INVOKE_CHANNELS.API_GET_SERVICES]: { params: []; result: string[] }

  // 服务管理
  [INVOKE_CHANNELS.SERVICE_GET_STATUS]: { params: [serviceId: string]; result: 'running' | 'stopped' | 'error' }
  [INVOKE_CHANNELS.SERVICE_START]: { params: [serviceId: string]; result: { success: boolean; error?: string } }
  [INVOKE_CHANNELS.SERVICE_STOP]: { params: [serviceId: string]; result: { success: boolean; error?: string } }
  [INVOKE_CHANNELS.SERVICE_STATUS_ALL]: { params: []; result: Record<string, 'running' | 'stopped' | 'error'> }
  [INVOKE_CHANNELS.SERVICE_RESTART]: { params: [serviceId: string]; result: { success: boolean; error?: string } }
  [INVOKE_CHANNELS.SERVICE_HEALTH]: { params: [serviceId: string]; result: { healthy: boolean; message?: string } }
  [INVOKE_CHANNELS.SERVICE_UPDATE_CONFIG]: { params: [serviceId: string, config: unknown]; result: { success: boolean; error?: string } }

  // 窗口控制
  [INVOKE_CHANNELS.WINDOW_GET_SIZE]: { params: []; result: { width: number; height: number } }
  [INVOKE_CHANNELS.WINDOW_IS_MAXIMIZED]: { params: []; result: boolean }
  [INVOKE_CHANNELS.WINDOW_IS_MINIMIZED]: { params: []; result: boolean }
}

// ========== Send 通道类型 ==========

export interface SendChannelMap {
  [SEND_CHANNELS.WINDOW_MINIMIZE]: { params: [] }
  [SEND_CHANNELS.WINDOW_MAXIMIZE]: { params: [] }
  [SEND_CHANNELS.WINDOW_CLOSE]: { params: [] }
  [SEND_CHANNELS.WINDOW_RESIZE]: { params: [{ width: number; height: number }] }

  [SEND_CHANNELS.MUSIC_PLAYING_CHECK]: { params: [playing: boolean] }
  [SEND_CHANNELS.MUSIC_PLAYMODE_TRAY_CHANGE]: { params: [mode: number] }

  [SEND_CHANNELS.DESKTOP_LYRIC_TOGGLE]: { params: [] }
  [SEND_CHANNELS.DESKTOP_LYRIC_CONTROL]: { params: [action: string] }
  [SEND_CHANNELS.DESKTOP_LYRIC_TOGGLE_LOCK]: { params: [] }
  [SEND_CHANNELS.DESKTOP_LYRIC_MOVE]: { params: [{ x: number; y: number }] }
  [SEND_CHANNELS.DESKTOP_LYRIC_SET_IGNORE_MOUSE]: { params: [ignore: boolean] }

  [SEND_CHANNELS.DOWNLOAD_MUSIC]: { params: [{ url: string; filename: string }] }
  [SEND_CHANNELS.LOG_MESSAGE]: { params: [{ level: string; module: string; message: string; data?: unknown }] }
  [SEND_CHANNELS.ERROR_REPORT]: { params: [{ code: string; message: string; stack?: string; data?: unknown }] }
}

// ========== Receive 通道类型 ==========

export interface ReceiveChannelMap {
  [RECEIVE_CHANNELS.MAIN_PROCESS_MESSAGE]: { payload: string }
  [RECEIVE_CHANNELS.CACHE_CLEARED]: { payload: CacheClearResult }

  [RECEIVE_CHANNELS.MUSIC_PLAYING_CONTROL]: { payload: void }
  [RECEIVE_CHANNELS.MUSIC_SONG_CONTROL]: { payload: 'prev' | 'next' }
  [RECEIVE_CHANNELS.MUSIC_PLAYMODE_CONTROL]: { payload: number }
  [RECEIVE_CHANNELS.MUSIC_VOLUME_UP]: { payload: void }
  [RECEIVE_CHANNELS.MUSIC_VOLUME_DOWN]: { payload: void }
  [RECEIVE_CHANNELS.MUSIC_PROCESS_CONTROL]: { payload: 'forward' | 'back' }
  [RECEIVE_CHANNELS.MUSIC_COMPACT_MODE_CONTROL]: { payload: void }

  [RECEIVE_CHANNELS.HIDE_PLAYER]: { payload: void }

  [RECEIVE_CHANNELS.LYRIC_UPDATE]: { payload: { text: string; trans: string; roma: string } }
  [RECEIVE_CHANNELS.LYRIC_TIME_UPDATE]: { payload: { time: number; index: number; text: string; trans: string; roma: string } }
  [RECEIVE_CHANNELS.DESKTOP_LYRIC_LOCK_STATE]: { payload: { locked: boolean } }

  [RECEIVE_CHANNELS.DOWNLOAD_PROGRESS]: { payload: { progress: number; filename: string } }
  [RECEIVE_CHANNELS.DOWNLOAD_COMPLETE]: { payload: { filename: string; path: string } }
  [RECEIVE_CHANNELS.DOWNLOAD_FAILED]: { payload: { filename: string; error: string } }
}

// ========== 辅助类型 ==========

export type InvokeChannel = keyof InvokeChannelMap
export type SendChannel = keyof SendChannelMap
export type ReceiveChannel = keyof ReceiveChannelMap

// 类型安全的 IPC 调用函数
export type InvokeFunction<T extends InvokeChannel> = (
  ...args: InvokeChannelMap[T]['params']
) => Promise<InvokeChannelMap[T]['result']>

export type SendFunction<T extends SendChannel> = (
  ...args: SendChannelMap[T]['params']
) => void

export type ReceiveCallback<T extends ReceiveChannel> = (
  payload: ReceiveChannelMap[T]['payload']
) => void
```

### 3. 核心服务类 (`electron/ipc/IpcService.ts`)

```typescript
/**
 * IPC 服务 - 统一管理所有 IPC 通道
 *
 * 借鉴 VSCode 的 IpcService 模式：
 * - 集中注册所有处理器
 * - 统一的错误处理和日志记录
 * - 支持中间件
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import logger from '../logger'

import { INVOKE_CHANNELS, SEND_CHANNELS, RECEIVE_CHANNELS } from './channels'
import type {
  InvokeChannelMap,
  SendChannelMap,
  ReceiveChannelMap,
  InvokeFunction,
  SendFunction,
  ReceiveCallback
} from './types'

// ========== 中间件类型 ==========

export interface IpcMiddleware<T extends 'invoke' | 'send' | 'receive'> {
  name: string
  process: (channel: string, data: unknown, next: () => void) => Promise<void> | void
  type: T
}

// ========== 处理器注册接口 ==========

interface InvokeHandler<T extends keyof InvokeChannelMap> {
  channel: T
  handler: InvokeFunction<T>
}

interface SendHandler<T extends keyof SendChannelMap> {
  channel: T
  handler: SendFunction<T>
}

interface ReceiveHandler<T extends keyof ReceiveChannelMap> {
  channel: T
  callback: ReceiveCallback<T>
}

// ========== IpcService 类 ==========

export class IpcService {
  private static instance: IpcService | null = null

  private invokeHandlers = new Map<keyof InvokeChannelMap, InvokeFunction<keyof InvokeChannelMap>>()
  private sendHandlers = new Map<keyof SendChannelMap, SendFunction<keyof SendChannelMap>>()
  private receiveHandlers = new Map<keyof ReceiveChannelMap, Set<ReceiveCallback<keyof ReceiveChannelMap>>>()

  private middleware: IpcMiddleware<'invoke' | 'send' | 'receive'>[] = []

  private initialized = false

  private constructor() {}

  static getInstance(): IpcService {
    if (!IpcService.instance) {
      IpcService.instance = new IpcService()
    }
    return IpcService.instance
  }

  // ========== 中间件 ==========

  use<T extends 'invoke' | 'send' | 'receive'>(middleware: IpcMiddleware<T>): void {
    this.middleware.push(middleware)
  }

  private async runMiddleware<T extends 'invoke' | 'send' | 'receive'>(
    type: T,
    channel: string,
    data: unknown
  ): Promise<void> {
    const middlewares = this.middleware.filter(m => m.type === type)
    let index = 0

    const next = async () => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++]
        await middleware.process(channel, data, next)
      }
    }

    await next()
  }

  // ========== Invoke 处理器注册 ==========

  registerInvoke<T extends keyof InvokeChannelMap>(channel: T, handler: InvokeFunction<T>): void {
    if (this.invokeHandlers.has(channel)) {
      logger.warn(`[IpcService] Invoke handler already registered for channel: ${channel}`)
    }
    this.invokeHandlers.set(channel, handler as InvokeFunction<keyof InvokeChannelMap>)
  }

  private setupInvokeHandler<T extends keyof InvokeChannelMap>(channel: T): void {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      try {
        // 运行中间件
        await this.runMiddleware('invoke', channel, args)

        const handler = this.invokeHandlers.get(channel)
        if (!handler) {
          throw new Error(`No handler registered for invoke channel: ${channel}`)
        }

        return await handler(...(args as Parameters<InvokeFunction<T>>))
      } catch (error) {
        logger.error(`[IpcService] Invoke error on ${channel}:`, error)
        throw error
      }
    })
  }

  // ========== Send 处理器注册 ==========

  registerSend<T extends keyof SendChannelMap>(channel: T, handler: SendFunction<T>): void {
    if (this.sendHandlers.has(channel)) {
      logger.warn(`[IpcService] Send handler already registered for channel: ${channel}`)
    }
    this.sendHandlers.set(channel, handler as SendFunction<keyof SendChannelMap>)
  }

  private setupSendHandler<T extends keyof SendChannelMap>(channel: T): void {
    ipcMain.on(channel, async (event, ...args: unknown[]) => {
      try {
        // 运行中间件
        await this.runMiddleware('send', channel, args)

        const handler = this.sendHandlers.get(channel)
        if (!handler) {
          logger.warn(`[IpcService] No handler registered for send channel: ${channel}`)
          return
        }

        handler(...(args as Parameters<SendFunction<T>>))
      } catch (error) {
        logger.error(`[IpcService] Send error on ${channel}:`, error)
      }
    })
  }

  // ========== Receive 处理器注册 ==========

  registerReceive<T extends keyof ReceiveChannelMap>(
    channel: T,
    callback: ReceiveCallback<T>
  ): () => void {
    if (!this.receiveHandlers.has(channel)) {
      this.receiveHandlers.set(channel, new Set())
    }

    const callbacks = this.receiveHandlers.get(channel)!
    callbacks.add(callback)

    // 返回取消订阅函数
    return () => {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        this.receiveHandlers.delete(channel)
      }
    }
  }

  // ========== 初始化 ==========

  initialize(): void {
    if (this.initialized) {
      logger.warn('[IpcService] Already initialized')
      return
    }

    // 设置所有 Invoke 处理器
    for (const channel of Object.values(INVOKE_CHANNELS)) {
      this.setupInvokeHandler(channel)
    }

    // 设置所有 Send 处理器
    for (const channel of Object.values(SEND_CHANNELS)) {
      this.setupSendHandler(channel)
    }

    this.initialized = true
    logger.info('[IpcService] Initialized')
  }

  // ========== 发送消息到渲染进程 ==========

  sendToRenderer<T extends keyof ReceiveChannelMap>(
    window: Electron.BrowserWindow,
    channel: T,
    payload: ReceiveChannelMap[T]['payload']
  ): void {
    window.webContents.send(channel, payload)
  }

  // ========== 清理 ==========

  dispose(): void {
    // 移除所有 Invoke 处理器
    for (const channel of Object.values(INVOKE_CHANNELS)) {
      ipcMain.removeHandler(channel)
    }

    this.invokeHandlers.clear()
    this.sendHandlers.clear()
    this.receiveHandlers.clear()
    this.middleware = []
    this.initialized = false

    logger.info('[IpcService] Disposed')
  }
}

// ========== 导出单例 ==========

export const ipcService = IpcService.getInstance()
```

### 4. 处理器示例 (`electron/ipc/handlers/window.handler.ts`)

```typescript
/**
 * 窗口控制 IPC 处理器
 */

import { BrowserWindow, screen } from 'electron'
import { INVOKE_CHANNELS, SEND_CHANNELS } from '../channels'
import { ipcService } from '../IpcService'
import type { WindowManager } from '../../WindowManager'

export function registerWindowHandlers(windowManager: WindowManager): void {
  // ========== Invoke Handlers ==========

  ipcService.registerInvoke(INVOKE_CHANNELS.WINDOW_GET_SIZE, () => {
    const win = windowManager.getWindow()
    if (!win) {
      throw new Error('No window available')
    }
    const [width, height] = win.getSize()
    return { width, height }
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.WINDOW_IS_MAXIMIZED, () => {
    const win = windowManager.getWindow()
    return win?.isMaximized() ?? false
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.WINDOW_IS_MINIMIZED, () => {
    const win = windowManager.getWindow()
    return win?.isMinimized() ?? false
  })

  // ========== Send Handlers ==========

  ipcService.registerSend(SEND_CHANNELS.WINDOW_MINIMIZE, () => {
    windowManager.minimize()
  })

  ipcService.registerSend(SEND_CHANNELS.WINDOW_MAXIMIZE, () => {
    windowManager.maximize()
  })

  ipcService.registerSend(SEND_CHANNELS.WINDOW_CLOSE, () => {
    windowManager.close()
  })

  ipcService.registerSend(SEND_CHANNELS.WINDOW_RESIZE, ({ width, height }) => {
    const win = windowManager.getWindow()
    if (!win) return

    const display = screen.getPrimaryDisplay()
    const { width: maxWidth, height: maxHeight } = display.workAreaSize
    const validWidth = Math.max(400, Math.min(width, maxWidth))
    const validHeight = Math.max(80, Math.min(height, maxHeight))

    win.setSize(validWidth, validHeight)
  })
}
```

### 5. 中间件示例 (`electron/ipc/middleware/error.ts`)

```typescript
/**
 * 错误处理中间件
 */

import type { IpcMiddleware } from '../IpcService'
import logger from '../../logger'

export const errorMiddleware: IpcMiddleware<'invoke'> = {
  name: 'error-handler',
  type: 'invoke',

  async process(channel, data, next) {
    try {
      await next()
    } catch (error) {
      logger.error(`[IpcMiddleware] Error in ${channel}:`, error)

      // 重新抛出格式化的错误
      if (error instanceof Error) {
        throw {
          name: error.name,
          message: error.message,
          stack: error.stack,
          channel
        }
      }
      throw error
    }
  }
}
```

### 6. 中间件示例 (`electron/ipc/middleware/logger.ts`)

```typescript
/**
 * 日志记录中间件
 */

import type { IpcMiddleware } from '../IpcService'
import logger from '../../logger'

export const loggerMiddleware: IpcMiddleware<'invoke' | 'send' | 'receive'> = {
  name: 'logger',
  type: 'invoke',

  process(channel, data, next) {
    logger.debug(`[IPC] ${channel}:`, data)
    next()
  }
}
```

### 7. 主进程入口修改 (`electron/main/index.ts`)

```typescript
import 'dotenv/config'
import { BrowserWindow, ipcMain, session } from 'electron'
import { windowManager } from '../WindowManager'
import logger, { initSentry } from '../logger'
import { ipcService } from '../ipc/IpcService'
import { registerWindowHandlers } from '../ipc/handlers/window.handler'
import { registerCacheHandlers } from '../ipc/handlers/cache.handler'
import { registerPlayerHandlers } from '../ipc/handlers/player.handler'
import { registerServiceHandlers } from '../ipc/handlers/service.handler'
import { registerApiHandlers } from '../ipc/handlers/api.handler'
import { registerLyricHandlers } from '../ipc/handlers/lyric.handler'
import { errorMiddleware } from '../ipc/middleware/error'
import { loggerMiddleware } from '../ipc/middleware/logger'
import { cacheManager } from '../cacheManager'
import { serviceManager } from '../ServiceManager'
import { RENDERER_DIST, VITE_PUBLIC } from '../utils/paths'
import {
  requestSingleInstanceLock,
  setupDevUserData,
  setupErrorHandlers,
  registerAppLifecycle
} from './app'
import { createTray, setWindowManager as setTrayWindowManager } from './tray'
import { registerShortcuts, unregisterAllShortcuts } from './shortcuts'
import { DEFAULT_SHORTCUTS } from '../../src/config/shortcuts'

// ... (省略其他代码)

/**
 * 初始化 IPC 服务
 */
function initializeIpc(): void {
  // 注册中间件
  ipcService.use(errorMiddleware)
  ipcService.use(loggerMiddleware)

  // 注册所有处理器
  registerWindowHandlers(windowManager)
  registerCacheHandlers(cacheManager)
  registerPlayerHandlers(windowManager)
  registerServiceHandlers(serviceManager)
  registerApiHandlers(serviceManager)
  registerLyricHandlers()

  // 初始化 IPC 服务
  ipcService.initialize()
}

/**
 * 初始化应用
 */
async function initializeApp(): Promise<void> {
  logger.info('Starting services via ServerManager...')

  // ... (省略服务启动代码)

  // 创建窗口
  windowManager.createWindow()

  // 创建托盘
  createTray()

  // 注册快捷键
  registerShortcuts(DEFAULT_SHORTCUTS)

  // 初始化 IPC (统一入口)
  initializeIpc()

  // 初始化缓存管理器
  cacheManager.init()

  // 清理会话缓存
  await cleanupSession()
}

// ... (省略其他代码)
```

---

## 迁移步骤

### 第一阶段：基础设施

1. 创建 `electron/ipc/` 目录结构
2. 实现 `IpcService.ts` 核心服务
3. 实现中间件（错误处理、日志记录）

### 第二阶段：处理器迁移

4. 迁移窗口控制 -> `window.handler.ts`
5. 迁移缓存管理 -> `cache.handler.ts`
6. 迁移播放器控制 -> `player.handler.ts`
7. 迁移服务管理 -> `service.handler.ts`
8. 迁移 API 网关 -> `api.handler.ts`
9. 迁移桌面歌词 -> `lyric.handler.ts`

### 第三阶段：集成测试

10. 更新主进程入口使用新的 IPC 服务
11. 运行所有测试确保功能正常
12. 删除旧的 IPC 注册代码

---

## 预期收益

| 指标 | 改进前 | 改进后 |
|------|--------|--------|
| IPC 注册点 | 6+ 个文件 | 1 个统一入口 |
| 类型安全 | 部分 | 完全类型安全 |
| 错误处理 | 分散 | 统一中间件 |
| 日志记录 | 分散 | 统一中间件 |
| 可测试性 | 低 | 高（可单独测试处理器） |
| 代码复用 | 低 | 高（共享中间件） |

---

## 后续扩展

1. **权限验证中间件**：验证渲染进程的 IPC 调用权限
2. **速率限制中间件**：防止频繁的 IPC 调用
3. **性能监控中间件**：记录 IPC 调用耗时
4. **类型生成**：自动生成渲染进程端的类型定义
