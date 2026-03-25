# 服务管理架构设计

> **状态**：设计草案（未实现）｜**最后更新**：2026-03-10

## 📋 概述

本文档描述 LUO Music Electron 应用的服务管理架构设计，目标是实现多音乐平台服务的统一管理、动态 IPC 注册和运行时配置热重载能力。

### 设计目标

| 目标              | 说明                                         |
| ----------------- | -------------------------------------------- |
| **统一服务管理**  | 通过 ServiceManager 统一管理多个音乐平台服务 |
| **动态 IPC 注册** | 支持服务启动后动态注册 IPC 通道              |
| **配置热重载**    | 支持运行时设置变更，无需重启应用             |
| **服务发现机制**  | 渲染进程通过 Pinia Store 实现服务状态感知    |
| **UI 自适应渲染** | 根据服务状态自动调整界面展示                 |

---

## 🏗️ 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                    Electron 主进程                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  1. 读取配置 → 2. ServiceManager 初始化 → 3. 服务启动      │  │
│  │         ↓                                                 │  │
│  │  4. 动态 IPC 注册 → 5. 渲染进程就绪                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                  渲染进程 (Vue 3 + Pinia)                        │
│  6. 服务发现 (Pinia Store) → 7. UI 自适应渲染                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 主进程初始化流程

### 1. 读取配置

应用启动时从本地读取用户配置文件 `settings.json`：

```typescript
// settings.json 配置示例
{
  "services": {
    "qq": { "enabled": true, "port": 3300 },
    "netease": { "enabled": false, "port": 3000 },
    "pythonAI": { "enabled": true, "port": 5000 }
  },
  "preferences": {
    "theme": "dark",
    "language": "zh-CN"
  }
}
```

| 配置项              | 说明               | 默认值                       |
| ------------------- | ------------------ | ---------------------------- |
| `services.qq`       | QQ 音乐服务配置    | `enabled: true, port: 3300`  |
| `services.netease`  | 网易云音乐服务配置 | `enabled: false, port: 3000` |
| `services.pythonAI` | Python AI 服务配置 | `enabled: true, port: 5000`  |

### 2. ServiceManager 初始化

ServiceManager 负责服务生命周期管理与 IPC 协调：

```typescript
// electron/ServiceManager.ts
class ServiceManager {
  private configMap: Map<string, ServiceConfig> // 配置表
  private spawnQueue: Array<() => Promise<void>> // 启动队列
  private activeProcs: Map<string, ChildProcess> // 运行中进程

  async initialize(config: ServiceConfig): Promise<void>
  async startService(serviceId: string): Promise<void>
  async stopService(serviceId: string): Promise<void>
  async restartService(serviceId: string): Promise<void>
  getServiceStatus(serviceId: string): ServiceStatus
}
```

### 3. 服务启动流程

```
┌─────────────────────────────────────────────────────────────────────┐
│  2. 服务管理器初始化                                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ ServiceManager                                              │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │    │
│  │  │ configMap   │→ │ spawnQueue  │→ │ activeProcs │         │    │
│  │  │ (配置表)     │  │ (启动队列)   │  │ (运行中)     │         │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘         │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                │
  ┌─────────────┼─────────────┐
  ▼             ▼             ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│   QQ     │ │ Netease  │ │  Python  │
│ enabled  │ │ disabled │ │ enabled  │
│ :3300    │ │ (skip)   │ │ :5000    │
└────┬─────┘ └──────────┘ └────┬─────┘
     ▼                         ▼
┌──────────┐             ┌──────────┐
│  spawn   │             │  spawn   │
│  success │             │  failed  │
└────┬─────┘             └────┬─────┘
     ▼                         ▼
 registerIPC()            unavailable
```

### 4. 动态 IPC 注册（统一网关模式）

采用统一网关 + 服务标识模式，避免分散式 IPC 注册冲突：

```typescript
// 统一 API 请求网关
ipcMain.handle('api:request', async (_, { service, endpoint, params }) => {
  // service: 'qq' | 'netease' | 'pythonAI'
  // endpoint: 'search' | 'lyric' | 'url' 等
  try {
    const serviceInstance = serviceManager.getService(service)
    if (!serviceInstance?.alive) {
      throw new Error(`Service ${service} not available`)
    }
    return await serviceInstance.handleRequest(endpoint, params)
  } catch (error) {
    logger.error(`[API] ${service}:${endpoint} failed:`, error)
    throw error
  }
})

// 服务状态查询
ipcMain.handle('api:services', () => serviceManager.getAvailableServices())
```

**优势**：

- 新增服务时无需修改 IPC 注册逻辑
- 避免 `ipcMain.handle` 重复注册冲突
- 统一错误处理和日志记录

### 5. 渲染进程就绪

主进程完成初始化后创建 BrowserWindow，加载渲染进程页面。

---

## 🔍 渲染进程服务发现

### 6. 服务发现 (Pinia Store)

渲染进程通过 Pinia Store 管理服务状态：

```typescript
// src/store/serviceStore.ts
import { defineStore } from 'pinia'
import { ipcRenderer } from 'electron'

export interface ServiceStatus {
  enabled: boolean
  status: 'pending' | 'starting' | 'running' | 'stopped' | 'error'
  port?: number
  lastError?: string
}

export const useServiceStore = defineStore('service', {
  state: () => ({
    availableServices: {} as Record<string, ServiceStatus | null>
  }),

  actions: {
    async init() {
      // 应用启动时获取可用服务列表
      const services = await ipcRenderer.invoke('api:services')
      this.availableServices = services
    },

    async fetchServiceStatus(serviceId: string) {
      return await ipcRenderer.invoke('service:status', serviceId)
    },

    subscribeServiceUpdates() {
      ipcRenderer.on(
        'service:update',
        (_, update: { serviceId: string; status: ServiceStatus }) => {
          this.availableServices[update.serviceId] = update.status
        }
      )
    }
  }
})
```

### 7. UI 自适应渲染

```
┌─────────────────────────────────────────────────────────────────────┐
│  6. 服务发现                                                         │
│  Pinia Store.init() → ipcInvoke('api:services')                     │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────┐                           │
│  │ availableServices = {                │                           │
│  │   qq: { status: 'ready', port: 3300 },│                          │
│  │   netease: null,  // 未启用          │                           │
│  │   pythonAI: { status: 'ready' }      │                           │
│  │ }                                    │                           │
│  └──────────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  7. UI 自适应渲染                                                    │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐           │
│  │  QQ 搜索按钮   │  │ Netease 按钮  │  │ AI 功能按钮    │           │
│  │   [显示]       │  │   [隐藏]      │  │   [显示]       │           │
│  │  enabled=true │  │  enabled=false│  │  enabled=true │           │
│  └───────────────┘  └───────────────┘  └───────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

```vue
<!-- Home.vue 示例 -->
<template>
  <div class="search-platforms">
    <button v-if="serviceStore.availableServices.qq" @click="search('qq')">QQ 音乐搜索</button>
    <button v-if="serviceStore.availableServices.pythonAI" @click="showAIFeature()">AI 推荐</button>
    <!-- Netease 未启用时不渲染 -->
  </div>
</template>

<script setup lang="ts">
import { useServiceStore } from '@/store/serviceStore'

const serviceStore = useServiceStore()
</script>
```

---

## ⚙️ 运行时设置变更流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                        运行时设置变更流程                            │
└─────────────────────────────────────────────────────────────────────┘
                                │
  用户在设置页 ────→  切换开关 (如：启用 Netease)  ────→  保存配置
       │                                                        │
       ▼                                                        ▼
┌─────────────────────┐                            ┌─────────────────────┐
│ 热重载 (可选)        │                            │ 下次启动生效 (简单)  │
│                     │                            │                     │
│ 1. 主进程监听文件    │                            │ 1. 显示重启提示      │
│    变更/IPC 通知    │                            │ 2. 用户手动重启应用  │
│ 2. kill/process     │                            │                     │
│ 3. spawn new        │                            │                     │
└─────────────────────┘                            └─────────────────────┘
```

### 配置类型与生效策略

| 配置类型 | 生效方案             | 实现难度 | 示例                 |
| -------- | -------------------- | -------- | -------------------- |
| UI 偏好  | 热重载               | 简单     | 主题、语言、字体大小 |
| 服务开关 | 热重载（kill/spawn） | 中等     | 启用/禁用某平台服务  |
| 端口配置 | 下次启动生效         | 简单     | 端口号修改           |
| 缓存策略 | 热重载               | 简单     | 缓存大小、清理策略   |

> **注意**：端口变更热重载需要 kill 子进程 → 等待端口释放 → spawn 新进程 → 重新注册 IPC，过程中所有进行中的请求会中断。**建议端口配置采用"下次启动生效"策略**。

---

## 📁 核心模块设计

### ServiceManager 模块

```typescript
// electron/ServiceManager.ts 伪代码
import { BaseService } from './services/BaseService'
import { QQService } from './services/QQService'
import { NeteaseService } from './services/NeteaseService'

export class ServiceManager {
  private services: Map<string, BaseService>
  private config: ServiceConfig

  constructor(config: ServiceConfig) {
    this.config = config
    this.services = new Map()
  }

  async initialize(): Promise<void> {
    // 1. 注册内置服务
    this.registerService('qq', new QQService())
    this.registerService('netease', new NeteaseService())

    // 2. 根据配置启动服务
    for (const [serviceId, service] of this.services) {
      if (this.config.services[serviceId]?.enabled) {
        await service.start()
        this.registerIPC(serviceId, service)
      }
    }
  }

  private registerIPC(serviceId: string, service: BaseService): void {
    // 动态注册 IPC 通道
    service.getIPCHandlers().forEach((handler, channel) => {
      ipcMain.handle(`${serviceId}:${channel}`, handler)
    })
  }
}
```

### 服务状态类型定义

```typescript
// electron/types/service.ts
export interface ServiceStatus {
  serviceId: string
  enabled: boolean
  status: 'pending' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
  port?: number
  lastError?: string
  lastUpdate: number
}

export interface ServiceConfig {
  services: {
    [key: string]: {
      enabled: boolean
      port: number
    }
  }
}
```

### 服务状态机设计

```
stopped → starting → running → stopping → stopped
   ↑___________|         |___________|
      (启动失败)            (停止失败/error)
```

**状态说明**：

- `pending`: 初始状态，等待启动
- `starting`: 正在启动中，避免用户重复点击
- `running`: 服务正常运行
- `stopping`: 正在停止中
- `stopped`: 已停止
- `error`: 启动/运行失败

---

## 🔗 IPC 通道设计

### 统一网关设计（推荐）

建议采用统一网关 + 服务标识模式，而非分散式路由：

```typescript
// 统一 API 请求网关
ipcMain.handle('api:request', async (_, { service, endpoint, params }) => {
  // service: 'qq' | 'netease' | 'python'
  // endpoint: 'search' | 'lyric' | 'url' 等
  // 统一错误处理、超时控制、日志记录
  try {
    const serviceInstance = serviceManager.getService(service)
    if (!serviceInstance) {
      throw new Error(`Service ${service} not found`)
    }
    return await serviceInstance.handleRequest(endpoint, params)
  } catch (error) {
    logger.error(`[API] ${service}:${endpoint} failed:`, error)
    throw error
  }
})
```

**优势**：

- 新增服务时无需修改 IPC 注册逻辑
- 避免 `ipcMain.handle` 重复注册冲突（Electron 不允许重复注册同名 channel）
- 统一错误处理和日志记录

### 服务管理 IPC 通道

| 通道名称                | 说明             | 参数                                |
| ----------------------- | ---------------- | ----------------------------------- |
| `service:status`        | 获取服务状态     | `serviceId: string`                 |
| `service:status:all`    | 获取所有服务状态 | 无                                  |
| `service:start`         | 启动服务         | `serviceId: string`                 |
| `service:stop`          | 停止服务         | `serviceId: string`                 |
| `service:restart`       | 重启服务         | `serviceId: string`                 |
| `service:health`        | 健康检查         | `serviceId: string`                 |
| `service:update-config` | 更新服务配置     | `serviceId: string, config: object` |

### 渲染进程 ← 主进程（事件）

| 事件名称           | 说明         | 数据            |
| ------------------ | ------------ | --------------- |
| `service:update`   | 服务状态更新 | `ServiceStatus` |
| `settings:updated` | 配置已更新   | `ServiceConfig` |

---

## 📊 数据流图

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  渲染进程    │     │  主进程       │     │  服务层      │
│  (Vue+Pinia)│     │  (Electron)  │     │  (Services) │
└──────┬──────┘     └──────┬───────┘     └──────┬──────┘
       │                   │                    │
       │  1. 请求服务状态   │                    │
       ├──────────────────►│                    │
       │                   │  2. 查询服务状态    │
       │                   ├───────────────────►│
       │                   │                    │
       │                   │  3. 返回状态       │
       │                   ◄────────────────────┤
       │  4. 返回状态       │                    │
       ◄───────────────────┤                    │
       │                   │                    │
       │  5. 订阅状态更新   │                    │
       ├──────────────────►│                    │
       │                   │                    │
       │  ┌──────────┐     │                    │
       │  │ Pinia    │     │                    │
       │  │ Store    │     │                    │
       │  └──────────┘     │                    │
       │       │           │                    │
       │       ▼           │                    │
       │  6. UI 更新        │                    │
       │                   │                    │
       │                   │   7. 服务状态变化   │
       │                   │                    │
       │  8. 推送更新      │                    │
       │◄──────────────────┤                    │
       │                   │                    │
```

---

## 🚧 实现注意事项

### 1. 服务启动顺序

- 优先启动核心服务（如 QQ/Netease）
- 可选服务延迟启动或按需启动
- 服务启动失败时记录日志并继续

### 2. 错误处理

- 服务启动超时自动重试（最多 3 次）
- 服务崩溃后自动重启（可配置）
- 错误信息通过 IPC 推送给渲染进程

### 3. 资源管理

- 应用退出前优雅停止所有服务
- 释放服务占用的端口和资源
- 清理临时文件和缓存

### 4. 安全考虑

- IPC 通道需要参数校验
- 服务配置需要权限验证
- 敏感信息（如 Cookie）加密存储

---

## 🗄️ 配置存储建议

### 使用 electron-store

建议使用 `electron-store` 而非手写文件 IO：

```typescript
import Store from 'electron-store'

interface ServiceConfig {
  services: {
    [key: string]: {
      enabled: boolean
      port: number
    }
  }
}

const store = new Store<ServiceConfig>({
  defaults: {
    services: {
      qq: { enabled: true, port: 3300 },
      netease: { enabled: false, port: 3000 },
      pythonAI: { enabled: true, port: 5000 }
    }
  }
})

// 监听变更，触发服务重启
store.onDidChange('services.qq.enabled', newVal => {
  newVal ? serviceManager.startService('qq') : serviceManager.stopService('qq')
})
```

**优势**：

- 自动处理 JSON 读写、类型校验、默认值
- 支持 `onDidChange` 监听，方便热重载
- 加密敏感字段（如用户 Cookie）

---

## 🧹 资源清理保障

### 孤儿进程防护

Electron 主进程崩溃时，子进程可能成为孤儿进程占用端口。建议在 ServiceManager 构造函数中注册清理钩子：

```typescript
export class ServiceManager {
  constructor() {
    // 正常退出清理
    process.on('exit', () => this.killAll())
    process.on('SIGINT', () => {
      this.killAll()
      process.exit(0)
    })

    // Windows 下额外处理
    if (process.platform === 'win32') {
      process.on('SIGHUP', () => this.killAll())
    }
  }

  private killAll(): void {
    for (const [name, proc] of this.activeProcs) {
      try {
        proc.kill('SIGTERM')
        logger.info(`[ServiceManager] Killed service: ${name}`)
      } catch (error) {
        logger.error(`[ServiceManager] Failed to kill ${name}:`, error)
      }
    }
  }
}
```

---

## 📝 后续工作

| 优先级 | 任务                       | 说明                                                  |
| ------ | -------------------------- | ----------------------------------------------------- |
| P0     | 实现 ServiceManager 核心类 | 服务注册与生命周期管理、IPC 动态注册机制              |
| P0     | 创建服务状态 Store         | Pinia Store 实现、IPC 通信封装                        |
| P1     | 开发设置面板组件           | 服务开关控制、配置编辑与保存                          |
| P1     | 实现热重载机制             | 配置变更检测、动态应用策略                            |
| P2     | 补充单元测试               | ServiceManager 测试、IPC 通道测试、Store 状态管理测试 |

---

## 🔗 相关链接

- [Electron IPC 通信机制](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Pinia 官方文档](https://pinia.vuejs.org/)
- [`electron-store`](https://github.com/sindresorhus/electron-store)
- [项目概述](./PROJECT.md)
- [构建指南](./build.md)

---

> **文档状态**：设计草案（未实现）
> **最后更新**：2026-03-10
