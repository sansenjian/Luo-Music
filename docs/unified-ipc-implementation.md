# 统一 IPC 处理方案实现文档

## 概述

本文档描述了 Luo Music 项目的统一 IPC 处理方案的完整实现。该方案借鉴了 VSCode 的 IpcService 模式，提供了类型安全、集中管理、支持中间件的 IPC 通信架构。

## 架构设计

### 核心组件

```
electron/ipc/
├── IpcService.ts          # 核心 IPC 服务类
├── types.ts               # 类型定义
├── index.ts               # 统一导出
├── middleware/
│   ├── error.ts           # 错误处理中间件
│   └── logger.ts          # 日志中间件
├── handlers/
│   ├── window.handler.ts  # 窗口控制处理器
│   ├── cache.handler.ts   # 缓存管理处理器
│   ├── player.handler.ts  # 播放器控制处理器
│   ├── service.handler.ts # 服务管理处理器
│   ├── api.handler.ts     # API 网关处理器
│   └── lyric.handler.ts   # 桌面歌词处理器
├── utils/
│   └── gatewayCache.ts    # 网关缓存工具
└── shared/protocol/
    └── channels.ts        # IPC 通道常量定义
```

### 通道分类

遵循 VSCode 的 Protocol 模式，将 IPC 通道分为三类：

| 类型 | 方向 | 用途 | 示例 |
|------|------|------|------|
| Invoke | 双向 | 渲染进程调用并等待结果 | `cache:get-size` |
| Send | 单向（渲染→主） | 渲染进程发送消息 | `minimize-window` |
| Receive | 单向（主→渲染） | 主进程推送消息 | `music-playing-control` |

## 核心特性

### 1. 类型安全

通过 TypeScript 泛型和映射类型，为每个 IPC 通道提供完整的类型检查：

```typescript
export interface InvokeChannelMap {
  [INVOKE_CHANNELS.CACHE_GET_SIZE]: { params: []; result: { httpCache: number; httpCacheFormatted: string } }
  [INVOKE_CHANNELS.API_REQUEST]: {
    params: [{ service: string; endpoint: string; params: Record<string, unknown>; noCache?: boolean }]
    result: ApiRequestResult
  }
}

export type InvokeFunction<T extends keyof InvokeChannelMap> = (
  ...args: InvokeChannelMap[T]['params']
) => Promise<InvokeChannelMap[T]['result']>
```

### 2. 中间件支持

支持在 IPC 调用链中插入中间件，实现横切关注点的分离：

```typescript
// 错误处理中间件
export const errorMiddleware: IpcMiddleware<'invoke'> = {
  name: 'error-handler',
  type: 'invoke',
  async process(channel, data, next) {
    try {
      await next()
    } catch (error) {
      logger.error(`[IpcMiddleware] Error in ${channel}:`, error)
      throw error
    }
  }
}

// 注册中间件
ipcService.use(errorMiddleware)
ipcService.use(loggerMiddleware)
```

### 3. 集中化管理

所有 IPC 处理器在 `IpcService` 中统一注册和管理：

```typescript
export class IpcService {
  private invokeHandlers = new Map<keyof InvokeChannelMap, InvokeFunction<keyof InvokeChannelMap>>()
  private sendHandlers = new Map<keyof SendChannelMap, SendFunction<keyof SendChannelMap>>()
  private receiveHandlers = new Map<keyof ReceiveChannelMap, Set<ReceiveCallback<keyof ReceiveChannelMap>>>()

  registerInvoke<T extends keyof InvokeChannelMap>(channel: T, handler: InvokeFunction<T>): void
  registerSend<T extends keyof SendChannelMap>(channel: T, handler: SendFunction<T>): void
  registerReceive<T extends keyof ReceiveChannelMap>(channel: T, callback: ReceiveCallback<T>): () => void
}
```

### 4. API 网关缓存

内置 LRU 缓存和指数退避重试机制：

```typescript
const CACHE_CONFIG = {
  TTL: 5 * 60 * 1000,     // 5 分钟缓存时间
  MAX_SIZE: 100,          // 最多 100 条记录
}

const RETRY_CONFIG = {
  MAX_RETRIES: 3,              // 最大重试次数
  INITIAL_DELAY: 1000,         // 初始延迟 (1 秒)
  MAX_DELAY: 10000,            // 最大延迟 (10 秒)
  BACKOFF_MULTIPLIER: 2,       // 退避倍数
}
```

### 5. 领域分离

按功能领域分离处理器：

- **window.handler.ts**: 窗口大小、最大化、最小化
- **cache.handler.ts**: HTTP 缓存、存储数据管理
- **player.handler.ts**: 播放状态、播放模式
- **service.handler.ts**: 音乐 API 服务管理（QQ、网易云）
- **api.handler.ts**: 统一 API 请求网关（带缓存和重试）
- **lyric.handler.ts**: 桌面歌词控制

## 使用示例

### 渲染进程发起 Invoke 调用

```typescript
// 获取缓存大小
const cacheSize = await ipcRenderer.invoke('cache:get-size')
console.log(cacheSize) // { httpCache: 1024, httpCacheFormatted: '1 KB' }

// API 请求（带缓存）
const result = await ipcRenderer.invoke('api:request', {
  service: 'qq',
  endpoint: 'search',
  params: { keyword: '周杰伦' }
})
```

### 渲染进程发送 Send 消息

```typescript
// 最小化窗口
ipcRenderer.send('minimize-window')

// 播放器状态变化
ipcRenderer.send('music-playing-check', true)
```

### 渲染进程接收 Receive 消息

```typescript
ipcRenderer.on('music-playing-control', (_, payload) => {
  // 处理播放控制
})

ipcRenderer.on('lyric-time-update', (event, data) => {
  // 更新歌词显示
})
```

### 主进程注册处理器

```typescript
import { ipcService, registerCacheHandlers } from '../ipc'

// 注册中间件
ipcService.use(errorMiddleware)
ipcService.use(loggerMiddleware)

// 注册处理器
registerCacheHandlers()
registerWindowHandlers(windowManager)

// 初始化
ipcService.initialize()
```

## 迁移指南

### 从旧的 IPC 模式迁移

**旧代码：**
```typescript
// electron/ipc.ts
ipcMain.handle('cache:get-size', async () => {
  return cacheManager.getCacheSize()
})
```

**新代码：**
```typescript
// electron/ipc/handlers/cache.handler.ts
export function registerCacheHandlers(): void {
  ipcService.registerInvoke(INVOKE_CHANNELS.CACHE_GET_SIZE, async () => {
    return cacheManager.getCacheSize()
  })
}
```

### 迁移步骤

1. 在 `electron/main/index.ts` 中调用 `initializeIpcService()`
2. 删除旧的 IPC 注册代码（`registerServiceIPC` 等）
3. 保留 `registerLogIPC` 用于日志处理
4. 确保所有渲染进程使用新的通道常量

## 测试验证

所有 307 个测试用例通过：
- 28 个测试文件
- 涵盖 IPC、播放器、用户数据存储、工具函数等
- 构建 Electron 应用成功

## 性能优势

| 指标 | 旧方案 | 新方案 | 改进 |
|------|--------|--------|------|
| IPC 注册分散度 | 6+ 文件 | 集中管理 | ✅ |
| 类型安全 | 部分 | 完整 | ✅ |
| 错误处理 | 分散 | 中间件统一 | ✅ |
| 缓存支持 | 无 | 内置 LRU | ✅ |
| 重试机制 | 无 | 指数退避 | ✅ |
| 可测试性 | 低 | 高 | ✅ |

## 未来扩展

1. **权限验证中间件**: 验证渲染进程的 IPC 调用权限
2. **速率限制中间件**: 防止 IPC 调用洪水攻击
3. **性能监控**: 记录每个 IPC 调用的耗时
4. **调试模式**: 开发环境下打印详细 IPC 日志

## 相关文件

- `electron/ipc/IpcService.ts` - 核心服务实现
- `electron/ipc/types.ts` - 类型定义
- `electron/ipc/handlers/*.ts` - 各领域处理器
- `electron/ipc/middleware/*.ts` - 中间件实现
- `electron/shared/protocol/channels.ts` - 通道常量定义
- `electron/main/index.ts` - 主进程入口（已集成）

## 维护说明

- 添加新的 IPC 通道时，首先在 `channels.ts` 中定义常量
- 在 `types.ts` 中添加对应的类型定义
- 在相应的 handler 文件中注册处理器
- 确保通过 TypeScript 类型检查
