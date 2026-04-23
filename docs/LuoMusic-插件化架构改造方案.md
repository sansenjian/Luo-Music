# Luo-Music 插件化架构改造方案

> 基于 Luo-Music v2.3+ 现有架构分析 | 2026-04-23

## 一、现状诊断

### 1.1 当前架构的扩展瓶颈

Luo-Music 的平台适配层已具备良好的分层设计（API 传输层 → 平台适配器 → MusicService 门面 → Store/Composable），Electron 侧的 `ServiceManager` 也已实现了工厂模式和动态注册表（`DefaultServiceRegistry`）。但渲染进程侧仍存在以下硬编码约束：

| 硬编码位置                               | 具体内容                                                | 影响                                     |
| ---------------------------------------- | ------------------------------------------------------- | ---------------------------------------- |
| `src/types/schemas.ts:14`                | `z.enum(['netease', 'qq', 'local'])`                    | Song 的 platform 字段被锁定为枚举值      |
| `src/types/schemas.ts:158`               | `IPCRequestSchema.service: z.enum(['netease', 'qq'])`   | IPC 请求只能指定两个在线服务             |
| `src/platform/music/index.ts:39`         | `const platformRegistry = { netease, qq }`              | 平台注册表是静态对象字面量，无法动态注册 |
| `src/platform/music/interface.ts:87`     | `createSong()` 签名硬编码 `platform: 'netease' \| 'qq'` | 创建歌曲对象只能指定两个平台             |
| `src/store/player/playbackActions.ts:79` | `shouldHydrateSongForPlayback()` 硬编码 `=== 'netease'` | hydration 逻辑与平台 ID 耦合             |
| `src/store/player/playbackActions.ts:88` | `shouldFetchLyrics()` 硬编码 `'netease' \|\| 'qq'`      | 歌词获取逻辑与平台 ID 耦合               |
| `src/store/searchStore.ts:121`           | `const server = ref('netease')`                         | 默认搜索平台硬编码                       |
| `electron/main/index.ts:66`              | `DEFAULT_SERVICE_CONFIG` 硬编码 netease + qq            | Electron 启动配置固定两个服务            |

### 1.2 已有的可复用基础

以下现有设计可以直接复用，无需重建：

| 模块                                        | 可复用能力                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `MusicPlatformAdapter` 抽象类               | 已定义标准的 `search`/`getSongUrl`/`getLyric`/`getPlaylistDetail`/`getSongDetail` 接口 |
| `getMusicAdapter()` 工厂                    | 已实现懒加载（首次调用时 `import()` 加载适配器并缓存 Promise）                         |
| `ServiceManager` + `DefaultServiceRegistry` | Electron 侧已有工厂模式 + 动态 `register()` + `Map` 存储                               |
| `BaseService` 抽象类                        | API 代理服务的启停、健康检查、请求转发已有标准实现                                     |

### 1.3 改造目标

1. **版权合规**：播放器本身不内置任何平台音源，所有在线平台通过插件提供
2. **开放扩展**：社区贡献者可以轻松添加新音乐平台（如酷狗、酷我、咪咕、Spotify）
3. **最小侵入**：复用现有 `MusicPlatformAdapter` 和 `ServiceManager`，不重造轮子
4. **安全隔离**：插件在受限上下文中运行，HTTP 请求受白名单约束

### 1.4 本地音乐的定位

`local` 平台（本地音乐库）直接读取文件系统、使用 SQLite 存储元数据、依赖 Electron 原生能力（`fs`、`chokidar`、`music-metadata`），不适合放入沙箱。它属于**核心能力**，不走插件机制。

插件化的范围是**在线音源平台**（需要 HTTP API 调用的平台），如 netease、qq、kugou 等。

## 二、方案设计

### 2.1 设计理念

采用最小可行方案：复用现有的 `MusicPlatformAdapter` 抽象和 `getMusicAdapter()` 懒加载机制，将静态注册表改为动态注册表，并通过 manifest 声明插件元信息。

| 借鉴来源      | 借鉴点                                        |
| ------------- | --------------------------------------------- |
| **VSCode**    | JSON 清单声明插件能力，宿主自动生成设置 UI    |
| **MusicFree** | TypeScript 接口定义插件协议，方法可选实现     |
| **现有架构**  | `getMusicAdapter()` 的懒加载 = 天然的按需激活 |

### 2.2 插件清单（Manifest）

每个插件是一个独立目录，包含一个 `manifest.json`：

```json
{
  "id": "com.example.kugou",
  "name": "酷狗音乐",
  "version": "1.0.0",
  "description": "酷狗音乐平台适配插件",
  "author": "plugin-author",
  "platformId": "kugou",
  "icon": "icon.png",
  "main": "index.js",
  "capabilities": {
    "search": true,
    "songUrl": true,
    "lyric": true,
    "songDetail": true,
    "playlistDetail": false,
    "login": false,
    "needsHydration": false,
    "supportsLyricFetch": true
  },
  "allowedDomains": ["*.kugou.com", "*.kugou.net"],
  "contributions": {
    "settings": [
      {
        "key": "kugou.quality",
        "type": "select",
        "label": "音质选择",
        "default": "128",
        "options": [
          { "value": "128", "label": "128kbps" },
          { "value": "320", "label": "320kbps" },
          { "value": "flac", "label": "无损 FLAC" }
        ]
      }
    ]
  }
}
```

**关键字段说明**：

- `platformId`：唯一平台标识符，与 Song 的 `platform` 字段对应
- `capabilities`：声明插件支持哪些功能（唯一的能力声明来源，无运行时重复声明）
  - `needsHydration`：播放前是否需要 hydrate 歌曲对象（替代 `playbackActions.ts` 中的硬编码判断）
  - `supportsLyricFetch`：是否支持歌词获取（替代 `shouldFetchLyrics()` 中的硬编码判断）
- `allowedDomains`：HTTP 白名单，宿主代理并过滤插件的网络请求
- `contributions.settings`：声明式配置项，宿主自动生成设置 UI

### 2.3 插件接口

插件不需要定义新接口——直接复用现有的 `MusicPlatformAdapter` 抽象类：

```typescript
// src/platform/music/plugin/types.ts

import type { MusicPlatformAdapter } from '../interface'

/** 插件模块导出格式 */
export interface PluginModule {
  /** 创建适配器实例 */
  createAdapter(context: PluginContext): MusicPlatformAdapter

  /** 插件生命周期：停用时调用（可选） */
  deactivate?(): void | Promise<void>
}

/** 插件 manifest 类型 */
export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  platformId: string
  icon?: string
  main: string
  capabilities: PlatformCapabilities
  allowedDomains: string[]
  contributions?: {
    settings?: PluginSettingDefinition[]
  }
}

export interface PlatformCapabilities {
  search: boolean
  songUrl: boolean
  lyric: boolean
  songDetail: boolean
  playlistDetail: boolean
  login: boolean
  needsHydration: boolean
  supportsLyricFetch: boolean
}

export interface PluginContext {
  /** 插件配置（来自 manifest 的 contributions.settings） */
  settings: Readonly<Record<string, unknown>>

  /** 读取/写入插件本地存储 */
  storage: PluginStorage

  /** HTTP 客户端（受 allowedDomains 约束） */
  http: RestrictedHttpClient

  /** 日志 */
  logger: PluginLogger
}
```

插件示例（社区开发者视角）：

```typescript
// plugins/external/kugou/index.ts
import type { PluginModule, PluginContext } from 'luo-music/plugin'
import { MusicPlatformAdapter } from 'luo-music/plugin'

class KugouAdapter extends MusicPlatformAdapter {
  private ctx: PluginContext

  constructor(ctx: PluginContext) {
    super('kugou')
    this.ctx = ctx
  }

  async search(keyword: string, limit: number, page: number) {
    const res = await this.ctx.http.get('https://mobilecdn.kugou.com/api/v3/search/song', {
      params: { keyword, pagesize: limit, page }
    })
    return this.transformSearchResult(res)
  }

  async getSongUrl(id: string | number) {
    /* ... */
  }
  async getSongDetail(id: string | number) {
    /* ... */
  }
  async getLyric(id: string | number) {
    /* ... */
  }
  async getPlaylistDetail(id: string | number) {
    return null
  }
}

export default {
  createAdapter: ctx => new KugouAdapter(ctx)
} satisfies PluginModule
```

### 2.4 插件加载器

```typescript
// src/platform/music/plugin/PluginLoader.ts

export class PluginLoader {
  private loadedPlugins = new Map<
    string,
    { manifest: PluginManifest; adapter: MusicPlatformAdapter }
  >()

  /**
   * 从目录扫描并注册所有插件（仅读取 manifest，不加载代码）
   */
  async scanPlugins(pluginDir: string): Promise<PluginManifest[]> {
    // 1. 遍历 pluginDir 下的子目录
    // 2. 读取并校验每个 manifest.json（Zod 校验）
    // 3. 返回 manifest 列表（此时不加载插件代码）
  }

  /**
   * 懒加载插件（首次 getMusicAdapter(platformId) 时触发）
   */
  async loadPlugin(manifest: PluginManifest): Promise<MusicPlatformAdapter> {
    const existing = this.loadedPlugins.get(manifest.platformId)
    if (existing) return existing.adapter

    // 1. 创建受限的 PluginContext（HTTP 白名单 + 隔离存储）
    const context = this.createPluginContext(manifest)

    // 2. 加载并执行插件脚本
    const pluginModule = await this.loadPluginModule(manifest)

    // 3. 调用 createAdapter 获取适配器实例
    const adapter = pluginModule.createAdapter(context)

    this.loadedPlugins.set(manifest.platformId, { manifest, adapter })
    return adapter
  }

  private createPluginContext(manifest: PluginManifest): PluginContext {
    return {
      settings: this.getPluginSettings(manifest.id),
      storage: new IsolatedPluginStorage(manifest.id),
      http: new DomainRestrictedHttpClient(manifest.allowedDomains),
      logger: new ScopedLogger(`plugin:${manifest.platformId}`)
    }
  }
}
```

**安全策略**（轻量方案，不引入 Web Worker）：

| 策略                | 说明                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| **域名白名单**      | 插件的 HTTP 请求通过 `DomainRestrictedHttpClient` 代理，只放行 `manifest.allowedDomains` 声明的域名 |
| **存储隔离**        | 每个插件有独立的 `localStorage` / 文件命名空间，互不可见                                            |
| **超时保护**        | 插件方法调用有 15 秒超时，防止阻塞宿主                                                              |
| **无 Node.js 访问** | 插件运行在渲染进程，无法直接使用 `fs`/`child_process` 等                                            |

> 如果未来需要更强的隔离（如防止插件访问 DOM 或全局变量），可在 P3 阶段引入 Web Worker 沙箱。

## 三、渲染进程改造

### 3.1 类型系统放宽

```typescript
// src/types/schemas.ts

// 改造前
export const SongPlatformSchema = z.enum(['netease', 'qq', 'local'])

// 改造后：保留内置平台作为联合类型，同时允许任意字符串
export const BuiltInPlatforms = ['netease', 'qq', 'local'] as const
export type BuiltInPlatform = (typeof BuiltInPlatforms)[number]
export const SongPlatformSchema = z.string().min(1)
```

```typescript
// src/types/schemas.ts

// 改造前
service: z.enum(['netease', 'qq'])

// 改造后
service: z.string().min(1)
```

```typescript
// src/platform/music/interface.ts

// 改造前
export function createSong(
  data: Partial<Song> & { id: string | number; name: string; platform: 'netease' | 'qq' }
): Song

// 改造后
export function createSong(
  data: Partial<Song> & { id: string | number; name: string; platform: string }
): Song
```

### 3.2 平台注册表动态化

```typescript
// src/platform/music/index.ts

// 改造前
const platformRegistry = {
  netease: { name: 'Netease Music', load: async () => { ... } },
  qq: { name: 'QQ Music', load: async () => { ... } },
} satisfies Record<string, MusicPlatformEntry>

// 改造后
const platformRegistry = new Map<string, MusicPlatformEntry>()

// 内置平台在模块初始化时注册
platformRegistry.set('netease', {
  name: 'Netease Music',
  load: async () => {
    const { NeteaseAdapter } = await import('./netease')
    return new NeteaseAdapter()
  }
})
platformRegistry.set('qq', {
  name: 'QQ Music',
  load: async () => {
    const { QQMusicAdapter } = await import('./qq')
    return new QQMusicAdapter()
  }
})

/** 供 PluginLoader 调用，注册第三方平台 */
export function registerMusicPlatform(id: string, entry: MusicPlatformEntry): () => void {
  platformRegistry.set(id, entry)
  return () => platformRegistry.delete(id)
}

export function getMusicAdapter(platform: string): Promise<MusicPlatformAdapter> {
  const entry = platformRegistry.get(platform)
  if (!entry) {
    getLogger().warn('Unknown music platform', { requested: platform })
    throw new Error(`Music platform "${platform}" is not registered`)
  }
  // 复用现有的懒加载 + Promise 缓存逻辑
  // ...
}

export function getAvailablePlatforms(): Array<{ id: string; name: string }> {
  return Array.from(platformRegistry.entries()).map(([id, entry]) => ({
    id,
    name: entry.name
  }))
}
```

### 3.3 播放逻辑去硬编码

```typescript
// src/store/player/playbackActions.ts

// 改造前
private shouldHydrateSongForPlayback(song: Song, platformKey: string): boolean {
  return platformKey === 'netease'
}

private shouldFetchLyrics(song: Song, platformKey: string): boolean {
  if (isLocalLibrarySong(song)) return false
  return platformKey === 'netease' || platformKey === 'qq'
}

// 改造后：查询平台注册表的 capabilities
private shouldHydrateSongForPlayback(song: Song, platformKey: string): boolean {
  const capabilities = getPlatformCapabilities(platformKey)
  return capabilities?.needsHydration ?? false
}

private shouldFetchLyrics(song: Song, platformKey: string): boolean {
  if (isLocalLibrarySong(song)) return false
  const capabilities = getPlatformCapabilities(platformKey)
  return capabilities?.supportsLyricFetch ?? false
}
```

## 四、Electron 侧改造

### 4.1 ServiceManager 改造（增量改动）

`ServiceManager` 已有 `registerService()` 和 `DefaultServiceRegistry`，只需：

1. 将 `registerBuiltInServices()` 中的硬编码改为可配置
2. 启动时从插件目录扫描并注册 API 代理服务（如果插件需要后端代理）

```typescript
// electron/ServiceManager.ts

// 改造前
private registerBuiltInServices(): void {
  this.registry.register('qq', (port) => new QQService(port || 3200))
  this.registry.register('netease', (port) => new NeteaseService(port || 14532))
}

// 改造后
private registerBuiltInServices(): void {
  // 内置服务仍然硬编码注册（它们是"内置插件"）
  this.registry.register('qq', (port) => new QQService(port || 3200))
  this.registry.register('netease', (port) => new NeteaseService(port || 14532))
}

/** 供插件系统调用，注册第三方平台的 API 代理服务 */
// registerService() 已存在，无需新增
```

```typescript
// electron/main/index.ts

// 改造前
const DEFAULT_SERVICE_CONFIG: ServiceConfig = {
  services: {
    netease: { enabled: true, port: 14532 },
    qq: { enabled: true, port: 3200 }
  }
}

// 改造后：从已注册的服务动态生成配置
function buildServiceConfig(): ServiceConfig {
  const config: ServiceConfig = {
    services: {
      // 内置服务的默认配置
      netease: { enabled: true, port: 14532 },
      qq: { enabled: true, port: 3200 }
    }
  }
  // 合并插件注册的服务配置
  for (const pluginService of pluginManager.getServiceConfigs()) {
    config.services[pluginService.id] = pluginService.config
  }
  return config
}
```

### 4.2 插件管理 IPC

```typescript
// 新增 IPC channels
'plugin:list' // 列出已安装插件
'plugin:install' // 安装插件（从本地路径）
'plugin:uninstall' // 卸载插件
'plugin:enable' // 启用插件
'plugin:disable' // 禁用插件
'plugin:settings' // 读写插件配置
```

## 五、内置平台的插件化迁移

将现有的网易云和 QQ 音乐改为「内置插件」，使用相同的目录结构和 manifest 格式：

```
plugins/
├── built-in/
│   ├── netease/
│   │   ├── manifest.json
│   │   └── index.ts          ← 从 src/platform/music/netease.ts 迁移
│   └── qq/
│       ├── manifest.json
│       └── index.ts          ← 从 src/platform/music/qq.ts 迁移
└── external/                  ← 用户安装的第三方插件
    └── kugou/
        ├── manifest.json
        └── index.js
```

**迁移策略**：内置插件在代码层面仍然是项目的一部分（TypeScript 源码、打包进应用），但遵循与外部插件相同的 manifest + adapter 接口。这样：

- 内置插件作为第三方插件的参考实现
- 未来可以按需禁用内置平台
- 不引入额外的沙箱开销（内置插件是可信代码）

## 六、用户界面改造

### 6.1 插件管理页面

在设置面板中新增「插件管理」Tab：

```
┌─────────────────────────────────────────┐
│  插件管理                                │
├─────────────────────────────────────────┤
│                                         │
│  已安装 (3)                             │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 网易云音乐  v1.0.0  [内置]      │    │
│  │  搜索 / 歌词 / 歌单 / 登录      │    │
│  │  [设置] [禁用]                  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ QQ音乐     v1.0.0  [内置]       │    │
│  │  搜索 / 歌词 / 歌单 / 登录      │    │
│  │  [设置] [禁用]                  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 酷狗音乐    v0.5.0  [社区]      │    │
│  │  搜索 / 歌词                    │    │
│  │  [设置] [卸载]                  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [+ 从本地安装插件]                     │
│                                         │
└─────────────────────────────────────────┘
```

### 6.2 搜索平台选择器动态化

搜索栏的平台下拉框从硬编码改为调用 `getAvailablePlatforms()` 动态获取，只显示 `capabilities.search === true` 的平台。

## 七、改造阶段与工期估算

| 阶段                             | 任务                                                      | 工作量 | 说明                                                                   |
| -------------------------------- | --------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| **P0 — 类型解耦**                | `z.enum` → `z.string()`                                   | 2-3 天 | 涉及 schemas.ts、interface.ts 及所有引用处；需同步修改测试             |
| **P0 — 注册表动态化**            | `platformRegistry` 改为 `Map` + `registerMusicPlatform()` | 1-2 天 | 改造 `index.ts`，更新 `getMusicAdapter()` 和 `getAvailablePlatforms()` |
| **P0 — 播放逻辑去硬编码**        | `shouldHydrate`/`shouldFetchLyrics` 查 capabilities       | 1-2 天 | 需定义 capabilities 查询接口                                           |
| **P1 — 插件接口与加载器**        | `PluginManifest` 类型 + `PluginLoader` + `PluginContext`  | 3-5 天 | manifest 校验、受限 HTTP 客户端、隔离存储                              |
| **P1 — 内置平台迁移**            | netease + qq 迁移到 plugins/built-in/                     | 3-5 天 | 涉及 store、composable、test 中大量 import 路径调整                    |
| **P1 — searchStore 动态化**      | 平台选择器、默认平台从配置读取                            | 1 天   |                                                                        |
| **P2 — 插件管理 UI**             | 设置面板中的插件列表 + 启用/禁用/卸载                     | 2-3 天 |                                                                        |
| **P2 — 插件安装流程**            | 本地目录安装 + manifest 校验                              | 2-3 天 |                                                                        |
| **P2 — Electron 侧动态服务配置** | `buildServiceConfig()` + 插件注册 IPC                     | 1-2 天 | ServiceManager 已有 registerService()，改动量小                        |
| **P3 — Web Worker 沙箱**         | 可选的强隔离模式                                          | 3-5 天 | 用 Worker + postMessage 代理所有插件调用                               |
| **P3 — 插件设置 UI 自动生成**    | 根据 manifest contributions 渲染表单                      | 2-3 天 |                                                                        |

**总计估算**：P0（基础解耦）约 5-7 天，P0+P1（可用的插件系统）约 15-20 天，全部完成约 25-35 天。

## 八、风险与应对

| 风险                         | 应对策略                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| 类型放宽后编译错误蔓延       | P0 阶段用 `string & {}` 技巧保留字符串自动补全，同时允许任意值；逐步修改引用处                      |
| 内置平台迁移导致回归         | 保持 `plugins/built-in/` 作为项目源码，不改变打包流程；迁移后全量运行测试                           |
| 第三方插件代码质量           | 域名白名单 + 超时保护 + 隔离存储；内置插件不走沙箱，无性能损耗                                      |
| 插件 HTTP 请求被 CORS 拦截   | Electron 端通过 main process 代理请求；Web 端通过 API server 代理                                   |
| 向后兼容（已保存的歌曲数据） | `SongPlatformSchema` 放宽为 `z.string()` 是向后兼容的——现有 `'netease'`/`'qq'`/`'local'` 值仍然有效 |

## 九、与现有方案的对比

| 维度     | MusicFree           | LX Music            | 本方案                                   |
| -------- | ------------------- | ------------------- | ---------------------------------------- |
| 插件协议 | CommonJS 模块导出   | 事件驱动（on/send） | 复用现有 `MusicPlatformAdapter` 抽象类   |
| 沙箱     | 受限 require 白名单 | 无明确沙箱          | 域名白名单 + 隔离存储（P3 可选 Worker）  |
| 能力声明 | 方法可选实现        | inited 事件声明     | manifest.capabilities（单一来源）        |
| 激活方式 | 启动时全量加载      | 启动时全量加载      | 复用 `getMusicAdapter()` 的懒加载机制    |
| 配置系统 | 无                  | 无                  | 声明式 contributions.settings            |
| 改造成本 | —                   | —                   | 低（复用 ServiceManager + Adapter 抽象） |
