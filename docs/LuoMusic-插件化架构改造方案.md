# Luo-Music 插件化架构改造方案

> 基于 Luo-Music v2.3+ 现有架构分析 | 优化版 | 2026-04-24

## 一、目标重述

这次改造的核心目标不是“把现有平台代码搬目录”，而是把**在线平台能力**从播放器核心里解耦出来，并在 Electron / Web 两种运行时下给出一致、可维护、可扩展的接入模型。

### 1.1 目标

1. **平台解耦**：搜索、歌词、歌曲链接、歌单等在线平台能力不再以 `netease` / `qq` 常量散落在 Store、Schema、平台注册表和 Electron 配置里。
2. **统一协议**：内置平台与第三方平台遵循同一套插件协议，但宿主可以根据信任级别选择不同执行路径。
3. **运行时清晰**：Electron main 负责扫描、安装、启停、配置和状态；renderer 只消费只读的平台描述和适配器代理；第三方插件在隔离运行时执行。
4. **渐进落地**：P0/P1 先完成平台解耦和内置平台协议化；P2 再引入 Electron 外部插件安装与隔离执行。
5. **Web 兼容**：Web 端只支持内置可信插件，不承担外部插件安装和动态代码加载。

### 1.2 非目标

1. **`local` 本地音乐库不插件化**。它依赖文件系统、SQLite 和 Electron 原生能力，属于核心能力而不是在线平台插件。
2. **P2 之前不支持第三方插件注册任意本地可执行服务**。当前 `ServiceManager` 只继续承载宿主自带的服务，例如现有 QQ / 网易云 API 服务。
3. **不把“内置插件”包装成版权隔离方案**。内置插件只代表模块化和可替换，不代表分发层面的合规隔离。

## 二、现状问题

### 2.1 当前硬编码点

| 位置                                  | 问题                                                                                   | 影响                             |
| ------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------- | ------------------ |
| `src/types/schemas.ts`                | `SongPlatformSchema`、`IPCRequestSchema.service`、`ServiceStatusSchema` 固定为少量平台 | 新平台接入会牵连类型和 IPC       |
| `src/platform/music/index.ts`         | 静态 `platformRegistry` + 未知平台 fallback 到 `netease`                               | 平台注册不可扩展，错误被静默吞掉 |
| `src/platform/music/interface.ts`     | `createSong()` 只接受 `'netease'                                                       | 'qq'`                            | 不利于通用平台协议 |
| `src/store/player/playbackActions.ts` | hydration / lyric 抓取逻辑直接判断平台 ID                                              | 平台行为无法声明式配置           |
| `src/store/searchStore.ts`            | 默认搜索平台写死为 `netease`                                                           | UI 和配置无法跟着平台动态变化    |
| `electron/main/index.ts`              | `DEFAULT_SERVICE_CONFIG` 静态包含 `netease` / `qq`                                     | 宿主侧平台能力不能按描述动态呈现 |

### 2.2 当前方案的主要不足

原方案已经抓住了“manifest + 动态注册 + capabilities”的方向，但仍有几个关键缺口：

1. **进程边界不清**：文档同时把插件扫描、加载、执行、平台注册写在 `src/platform/music/plugin`，但外部插件又需要 Electron main 访问文件系统。
2. **安全模型过弱**：如果第三方插件直接在 renderer 执行，仅靠 `RestrictedHttpClient` 无法阻止它访问 `window`、DOM 或直接发起网络请求。
3. **协议不完整**：只定义了 `manifest.main` 和 `createAdapter()`，但没有定义插件 SDK、模块格式、宿主 API 版本、兼容性策略。
4. **范围过大**：把“第三方插件注册新服务工厂”也纳入首期，会把 `ServiceManager`、配置持久化和生命周期管理一起拉进来，风险偏高。

## 三、优化后的总体方案

### 3.1 插件分层

将插件能力拆成 3 层：

1. **Catalog 层（Electron main）**
   - 扫描插件目录
   - 校验 manifest
   - 持久化安装状态、启用状态、插件设置
   - 维护平台描述清单
   - 向 renderer 发布只读平台信息
2. **Runtime 层（Built-in Local Runtime / External Plugin Host）**
   - 内置插件：本地可信代码，可直接在 renderer 侧按需加载
   - 第三方插件：只在隔离运行时执行，通过受控 RPC 调用
3. **Access 层（renderer）**
   - 统一的平台描述查询
   - 统一的 `getMusicAdapter(platformId)` 入口
   - 对 built-in 返回本地适配器，对 external 返回 RPC 代理适配器

### 3.2 信任模型

| 类型       | 来源                       | 支持运行时     | 执行位置            | 信任级别 |
| ---------- | -------------------------- | -------------- | ------------------- | -------- |
| `core`     | 宿主核心能力，例如 `local` | Electron / Web | 宿主自身            | 可信     |
| `builtin`  | 项目随包分发的在线平台     | Electron / Web | renderer 内本地加载 | 可信     |
| `external` | 用户安装的第三方插件       | Electron only  | 隔离 Plugin Host    | 不可信   |

结论：

1. **内置插件和第三方插件遵循同一协议，但不共享同一执行权限。**
2. **第三方插件默认走隔离运行时，这不是 P3，可用版就要具备。**

### 3.3 宿主架构图

```text
┌──────────────────────────── Electron Main ────────────────────────────┐
│ PluginCatalog  PluginInstaller  PluginStateStore  ServiceManager      │
│      │               │                │                │              │
│      └────── publish descriptors / status / settings via IPC ────────┤
└───────────────────────────────────┬───────────────────────────────────┘
                                    │
                    RPC / IPC       │
                                    ▼
┌───────────────────── External Plugin Host (isolated) ─────────────────┐
│ load plugin module -> create instance -> execute handlers -> timeout   │
│ network/storage/logger all provided by host context                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────── Renderer ────────────────────────────────┐
│ PlatformDescriptorStore  PlatformRegistry  MusicService  Store / UI    │
│        │                    │                                           │
│        └──── choose builtin local adapter or external RPC adapter ─────┘
└─────────────────────────────────────────────────────────────────────────┘
```

## 四、核心设计决策

### 4.1 单一真源：平台描述由 main 发布

平台列表、启用状态、来源、能力、设置定义、所需服务状态，都以 Electron main 维护的 `PlatformDescriptor` 为准。renderer 不再自行拼接“有哪些平台”。

```typescript
export interface PlatformDescriptor {
  id: string
  displayName: string
  source: 'core' | 'builtin' | 'external'
  runtime: 'local' | 'external-host'
  enabled: boolean
  capabilities: PlatformCapabilities
  requiresServices?: string[]
  settingsSchema?: PluginSettingDefinition[]
}
```

收益：

1. 搜索平台下拉框、设置面板、播放行为判断都基于同一份描述数据。
2. `searchStore` 不再硬编码默认平台，而是从描述列表中选择第一个 `capabilities.search === true` 且 `enabled === true` 的平台。
3. Web 和 Electron 的差异被收敛到描述生成阶段，而不是散落在各个 Store 里。

### 4.2 插件协议与应用内部适配层分离

应用内部继续保留 `MusicPlatformAdapter` 作为宿主统一抽象，但**插件协议本身不直接要求第三方代码继承宿主类**。原因：

1. 跨包继承抽象类会引入 SDK 版本耦合。
2. 外部插件通过 RPC 执行时，类实例无法直接跨进程传递。
3. 纯对象 handler 更适合稳定协议和序列化。

优化后的设计：

1. 插件对外导出 `defineMusicPlugin(...)`
2. 宿主侧用 `PluginAdapterBridge` 包装成 `MusicPlatformAdapter`
3. built-in 与 external 共用同一桥接逻辑

```typescript
// packages/plugin-sdk/types.ts
export interface MusicPluginInstance {
  search?(input: SearchInput): Promise<SearchResult>
  getSongUrl?(input: SongUrlInput): Promise<string | null>
  getSongDetail?(input: SongDetailInput): Promise<Song | null>
  getLyric?(input: LyricInput): Promise<LyricResult>
  getPlaylistDetail?(input: PlaylistDetailInput): Promise<PlaylistDetail | null>
  dispose?(): Promise<void> | void
}

export interface MusicPluginDefinition {
  manifest: PluginManifest
  create(ctx: PluginContext): Promise<MusicPluginInstance> | MusicPluginInstance
}
```

```typescript
// src/platform/music/plugin/PluginAdapterBridge.ts
export class PluginAdapterBridge extends MusicPlatformAdapter {
  constructor(
    platformId: string,
    private readonly handlers: MusicPluginInstance,
    private readonly capabilities: PlatformCapabilities
  ) {
    super(platformId)
  }

  async search(keyword: string, limit: number, page: number) {
    if (!this.handlers.search) throw new Error('search not supported')
    return this.handlers.search({ keyword, limit, page })
  }

  // 其余方法同理，统一由 bridge 做能力检查和错误映射
}
```

### 4.3 第三方插件从第一版开始隔离执行

第三方插件的推荐执行模型：

1. **Electron main 管理插件生命周期**
2. **External Plugin Host 执行插件代码**
3. **renderer 仅通过 RPC 访问插件能力**

可接受的实现选项：

1. Electron `utilityProcess`
2. Node `worker_threads`
3. Browser `Web Worker` + main 代理网络

优先建议：**Electron 独立 Host 进程 / 线程**，因为它能明确切断 renderer DOM 访问，并把网络、存储、日志全部变成宿主提供的能力。

## 五、Manifest 设计

### 5.1 Manifest 示例

```json
{
  "manifestVersion": 1,
  "id": "com.example.kugou",
  "name": "酷狗音乐",
  "version": "1.0.0",
  "description": "酷狗音乐平台适配插件",
  "author": "plugin-author",
  "platformId": "kugou",
  "source": "external",
  "runtime": "external-host",
  "entry": {
    "main": "dist/index.js",
    "module": "esm"
  },
  "engines": {
    "pluginApi": "^1.0.0",
    "app": ">=2.3.0"
  },
  "capabilities": {
    "search": true,
    "songUrl": true,
    "lyric": true,
    "songDetail": true,
    "playlistDetail": false,
    "needsHydration": false,
    "supportsLyricFetch": true
  },
  "permissions": {
    "network": {
      "domains": ["mobilecdn.kugou.com", "lyrics.kugou.com"]
    },
    "storage": true
  },
  "contributions": {
    "settings": [
      {
        "key": "quality",
        "type": "select",
        "label": "音质选择",
        "default": "128",
        "options": [
          { "value": "128", "label": "128kbps" },
          { "value": "320", "label": "320kbps" }
        ]
      }
    ]
  }
}
```

### 5.2 关键字段

| 字段                          | 说明                                               |
| ----------------------------- | -------------------------------------------------- |
| `manifestVersion`             | manifest 本身的版本，方便将来升级协议              |
| `source`                      | `builtin` / `external`，由宿主决定信任级别         |
| `runtime`                     | `local` 或 `external-host`                         |
| `entry.module`                | 明确插件产物格式，避免 CJS / ESM 歧义              |
| `engines.pluginApi`           | 声明宿主插件 SDK 兼容范围                          |
| `permissions.network.domains` | 网络白名单，只允许宿主代理访问这些域名             |
| `contributions.settings`      | 声明式设置项，仅描述结构，不允许注入自定义 UI 代码 |

### 5.3 Built-in 插件约束

内置插件仍然使用 manifest，但有两点差异：

1. `source = "builtin"`
2. `runtime = "local"`

这使得 built-in 插件与 external 插件可以共用平台描述和能力模型，但执行路径不同。

## 六、插件 SDK 与上下文

### 6.1 `PluginContext`

第三方插件拿到的上下文只能是受控能力：

```typescript
export interface PluginContext {
  platformId: string
  settings: Readonly<Record<string, unknown>>
  storage: PluginStorage
  http: RestrictedHttpClient
  logger: PluginLogger
}
```

约束：

1. `http` 只能访问 manifest 声明的域名。
2. `storage` 仅访问 `plugin:<pluginId>` 命名空间。
3. 不暴露 `window`、`document`、`ipcRenderer`、`fs`、`child_process`。
4. 宿主统一为每个调用加超时、取消和错误包装。

### 6.2 宿主 SDK 交付形式

需要新增一个稳定 SDK 入口，例如：

```text
packages/plugin-sdk/
  index.ts
  types.ts
  runtime.ts
```

SDK 至少提供：

1. `defineMusicPlugin()`
2. `PluginManifest` / `PluginContext` / 输入输出类型
3. 能力声明辅助类型
4. 开发示例和最小模板

不建议让第三方插件直接 `import { MusicPlatformAdapter } from 'luo-music/plugin'` 并继承宿主类。

## 七、运行时职责划分

### 7.1 Electron Main：`PluginCatalog`

建议新增：

```text
electron/plugins/
  PluginCatalog.ts
  PluginInstaller.ts
  PluginStateStore.ts
  ExternalPluginHost.ts
  types.ts
```

职责：

1. 扫描 `appData/plugins/external/*/manifest.json`
2. 读取项目内置插件描述
3. 合并生成 `PlatformDescriptor[]`
4. 维护插件安装状态、启用状态、设置和值
5. 对 renderer 暴露只读查询与状态变更事件

### 7.2 Renderer：`PlatformRegistry`

renderer 只负责两件事：

1. 缓存主进程下发的平台描述
2. 根据描述返回合适的适配器

```typescript
export async function getMusicAdapter(platformId: string): Promise<MusicPlatformAdapter> {
  const descriptor = descriptorStore.get(platformId)
  if (!descriptor || !descriptor.enabled) {
    throw new Error(`Music platform "${platformId}" is not available`)
  }

  if (descriptor.runtime === 'local') {
    return builtInAdapterLoader.load(platformId)
  }

  return externalAdapterProxyFactory.create(platformId)
}
```

这一步会取代当前的静态对象注册表和 silent fallback。

### 7.3 Built-in Loader

Web / Electron 共用 built-in 插件协议，但加载方式可以用构建期静态发现：

```typescript
const builtInPluginModules = import.meta.glob('@/plugins/built-in/*/index.ts')
const builtInPluginManifests = import.meta.glob('@/plugins/built-in/*/manifest.json', {
  eager: true
})
```

收益：

1. 少维护一份手写 `platformRegistry`
2. built-in 平台新增时，只需放入目录并补 manifest
3. Web 构建天然只包含 built-in 插件

## 八、安全策略

### 8.1 第三方插件的最低安全要求

第三方插件可用版至少具备下面 5 条：

1. **隔离执行**：不在 renderer 主线程直接运行第三方代码。
2. **受控网络**：所有对外网络请求通过宿主发起，按 manifest 域名白名单校验。
3. **隔离存储**：每个插件独立 key-space，不共享宿主全局存储。
4. **调用超时**：单次 handler 默认 15 秒超时，并支持取消。
5. **崩溃隔离**：单个插件实例崩溃不会拖垮 renderer，宿主可回收并重建实例。

### 8.2 建议追加

可以作为 P2 同期或 P3 增强项：

1. 插件包校验和记录
2. 启用前展示权限摘要
3. 安装后默认禁用，用户显式启用
4. 崩溃次数熔断和自动禁用

## 九、与现有 `ServiceManager` 的关系

### 9.1 第一阶段不开放“插件注册任意服务工厂”

这是本次方案最重要的收敛点。

原因：

1. 当前 `ServiceManager` 已能管理宿主自带服务，但运行中动态新增服务实例、配置持久化和热重载还未完全产品化。
2. 允许第三方插件注册任意本地服务，会把执行权限、进程管理、端口冲突、日志、升级和卸载一起放大。

### 9.2 当前推荐做法

1. `netease` / `qq` 现有服务继续作为**宿主自带服务**
2. 平台描述增加 `requiresServices?: string[]`
3. renderer 根据服务状态决定平台是否可见 / 可用

```typescript
export interface PlatformDescriptor {
  // ...
  requiresServices?: string[]
}
```

第三方插件在 P2 只允许通过宿主提供的 `http` 访问远端接口，不注册新的本地服务。

### 9.3 后续扩展

如果未来确实需要“插件扩展服务”，建议单独起 RFC，只开放**宿主审核过的服务模板**，而不是开放任意 `BaseService` 工厂。

## 十、渲染进程改造清单

### 10.1 类型系统

```typescript
export const BuiltInPlatforms = ['netease', 'qq', 'local'] as const
export type BuiltInPlatform = (typeof BuiltInPlatforms)[number]
export type PlatformId = BuiltInPlatform | (string & {})

export const SongPlatformSchema = z.string().min(1)
```

保留已知平台类型用于编辑器提示，但运行时允许任意合法字符串平台 ID。

### 10.2 `createSong()`

```typescript
export function createSong(
  data: Partial<Song> & { id: string | number; name: string; platform: string }
): Song
```

### 10.3 去掉未知平台 fallback

当前 `getMusicAdapter()` 对未知平台 fallback 到 `netease`，应改为显式抛错，并由调用方决定降级策略。

### 10.4 平台能力查询

将 `shouldHydrateSongForPlayback()`、`shouldFetchLyrics()`、搜索平台过滤等行为统一改为查询 `PlatformDescriptor.capabilities`。

### 10.5 平台特定 Schema

`QQMusicSearchItemSchema`、`NeteaseSongItemSchema` 等平台专属 schema 不应继续放在公共 `schemas.ts` 里。建议迁移为：

1. 平台内部 schema，跟着 built-in 插件实现走
2. 公共层只保留 `Song` / `SearchResult` / `LyricResult` 等通用 schema

## 十一、IPC 设计

### 11.1 建议新增通道

```typescript
'plugin:list'
'plugin:installFromPath'
'plugin:setEnabled'
'plugin:uninstall'
'plugin:getSettings'
'plugin:updateSettings'
'plugin:call'
'plugin:changed' // event
```

### 11.2 `plugin:list`

返回值建议直接是平台描述，而不是原始 manifest：

```typescript
type PluginListResponse = {
  platforms: PlatformDescriptor[]
}
```

renderer 不应感知安装目录、入口文件等宿主内部细节。

### 11.3 `plugin:call`

renderer 对 external 平台的适配器代理最终都汇总为统一 RPC：

```typescript
type PluginCallRequest = {
  platformId: string
  method: 'search' | 'getSongUrl' | 'getSongDetail' | 'getLyric' | 'getPlaylistDetail'
  payload: unknown
}
```

## 十二、安装与生命周期

### 12.1 安装流程

1. 用户选择本地目录或压缩包
2. main 校验 manifest、入口文件、版本兼容性、权限声明
3. 拷贝到 `appData/plugins/external/<pluginId>/<version>/`
4. 写入安装记录与默认设置
5. 默认状态为“已安装但未启用”
6. 用户确认后启用，首次调用时再真正创建实例

### 12.2 启用 / 停用

1. 启用：更新状态 -> 发布 `plugin:changed` -> 首次调用时懒加载实例
2. 停用：回收实例 -> 清理运行时缓存 -> 保留已安装文件
3. 卸载：要求先停用，再删除目录和状态记录

### 12.3 错误恢复

1. 插件实例启动失败：标记为 error，不影响其他平台
2. 插件方法连续失败达到阈值：自动禁用并提示用户
3. 插件崩溃：允许宿主重新创建一次实例，失败后熔断

## 十三、目录结构建议

```text
src/
  platform/
    music/
      index.ts
      interface.ts
      descriptors/
      plugin/
        PluginAdapterBridge.ts
        ExternalAdapterProxy.ts
        BuiltInAdapterLoader.ts

plugins/
  built-in/
    netease/
      manifest.json
      index.ts
    qq/
      manifest.json
      index.ts

packages/
  plugin-sdk/
    index.ts
    types.ts

electron/
  plugins/
    PluginCatalog.ts
    PluginInstaller.ts
    PluginStateStore.ts
    ExternalPluginHost.ts
```

## 十四、分阶段实施

### P0：平台解耦

目标：清掉核心硬编码，让平台信息可以从描述层读取。

任务：

1. `SongPlatformSchema`、`IPCRequestSchema.service` 放宽为 `z.string().min(1)`
2. `createSong()` 改为接受 `platform: string`
3. `getMusicAdapter()` 去掉 fallback
4. 新增 `PlatformDescriptor` 和平台能力查询入口
5. `playbackActions`、`searchStore` 改为查平台描述

预计：4-6 天

#### P0 完成情况（2026-04-24）

- [x] `SongPlatformSchema`、`IPCRequestSchema.service` 已放宽为开放字符串；`ServiceStatusSchema` 同步改为动态 record 结构
- [x] `createSong()` 已接受任意 `platform: string`
- [x] `getMusicAdapter()` 已移除未知平台 fallback，改为显式 rejected promise
- [x] 已新增 `PlatformDescriptor`、`PlatformCapabilities`、搜索平台选项与能力查询入口
- [x] `playbackActions`、`searchStore` 已改为通过平台能力描述决定 hydration、歌词与默认搜索平台
- [x] 搜索平台 UI 已从描述层读取，不再在 `SearchInput.vue`、`useHomePage.ts` 中手写 `netease` / `qq` 列表

本次 P0 实际落地文件：

- `src/platform/music/descriptors.ts`
- `src/platform/music/index.ts`
- `src/platform/music/interface.ts`
- `src/types/schemas.ts`
- `src/store/searchStore.ts`
- `src/store/player/playbackActions.ts`
- `src/components/SearchInput.vue`
- `src/composables/useHomePage.ts`

补充说明：

- 为消除 `playbackActions` 中残留的平台特判，实现时额外补充了 `supportsUrlRefreshOnFailure` 能力位，用于描述“缓存 URL 播放失败后是否允许刷新重试”
- 当前 `npm run typecheck` 仍会在 `tsconfig.node.json` / `vite.config.ts` 处命中既有类型问题；renderer 侧 `npx vue-tsc --noEmit -p tsconfig.json` 已通过

### P1：内置插件协议化

目标：先把 built-in 平台迁到统一协议，但仍作为可信本地代码运行。

任务：

1. 新增 `packages/plugin-sdk`
2. 新增 `PluginAdapterBridge`
3. `netease` / `qq` 改为导出 `MusicPluginDefinition`
4. 用 `import.meta.glob` 建 built-in loader
5. 公共 schema 与平台内部 schema 拆分

预计：5-7 天

#### P1 完成情况（2026-04-24）

- [x] 已新增 `packages/plugin-sdk/index.ts`、`packages/plugin-sdk/types.ts`、`packages/plugin-sdk/runtime.ts`，提供 `defineMusicPlugin()`、manifest、上下文和输入输出类型
- [x] 已新增 `src/platform/music/plugin/PluginAdapterBridge.ts`，宿主通过 bridge 把插件 handler 包装为 `MusicPlatformAdapter`
- [x] `netease` / `qq` 已改为内置插件定义，位于 `plugins/built-in/netease/` 与 `plugins/built-in/qq/`，原 `src/platform/music/netease.ts`、`src/platform/music/qq.ts` 退化为兼容包装层
- [x] 已新增 `src/platform/music/plugin/BuiltInAdapterLoader.ts`，通过 `import.meta.glob()` 发现并加载 built-in 插件
- [x] 平台专属 schema 已从 `src/types/schemas.ts` 移出，分别下沉到 `plugins/built-in/netease/schema.ts` 与 `plugins/built-in/qq/schema.ts`
- [x] `PlatformDescriptor` 已改为从 built-in manifest 派生，避免平台能力在描述层与实现层重复维护

本次 P1 实际落地文件：

- `packages/plugin-sdk/index.ts`
- `packages/plugin-sdk/types.ts`
- `packages/plugin-sdk/runtime.ts`
- `plugins/built-in/netease/manifest.ts`
- `plugins/built-in/netease/schema.ts`
- `plugins/built-in/netease/index.ts`
- `plugins/built-in/qq/manifest.ts`
- `plugins/built-in/qq/schema.ts`
- `plugins/built-in/qq/index.ts`
- `src/platform/music/plugin/PluginAdapterBridge.ts`
- `src/platform/music/plugin/LegacyBuiltInPluginAdapter.ts`
- `src/platform/music/plugin/BuiltInAdapterLoader.ts`
- `src/platform/music/index.ts`
- `src/platform/music/descriptors.ts`
- `src/platform/music/netease.ts`
- `src/platform/music/qq.ts`
- `src/types/schemas.ts`

补充说明：

- 现阶段 built-in manifest 使用 `manifest.ts` 而不是 `manifest.json`，目的是在仓库内先获得更稳定的类型约束；P2 面向外部插件安装时仍可切换到 `manifest.json` 读取模型
- QQ 平台当前仍未实现歌单详情 handler，因此 manifest 中 `capabilities.playlistDetail = false`，避免描述层与运行时行为不一致
- 定向验证已通过：`npx vue-tsc --noEmit -p tsconfig.json`，以及平台层 / store / 首页相关 vitest 用例

### P2：Electron 外部插件最小可用版

目标：支持安装、启用、停用和隔离执行第三方插件。

任务：

1. 新增 `PluginCatalog` / `PluginInstaller` / `PluginStateStore`
2. 新增 `ExternalPluginHost`
3. 增加 `plugin:list` / `plugin:installFromPath` / `plugin:setEnabled` / `plugin:call`
4. 实现网络白名单、隔离存储、调用超时
5. 设置页新增插件管理面板

预计：7-10 天

#### P2 完成情况（2026-04-25）

- [x] 已新增 `electron/plugins/PluginCatalog.ts`：管理外部插件注册、安装、启停、设置和调用，向 renderer 发布平台描述变更事件
- [x] 已新增 `electron/plugins/PluginInstaller.ts`：负责扫描、校验、安装和卸载外部插件目录
- [x] 已新增 `electron/plugins/PluginStateStore.ts`：基于 electron-store 持久化插件启用状态、设置值和存储空间
- [x] 已新增 `electron/plugins/ExternalPluginHost.ts`：基于 Node.js `worker_threads` 的隔离运行时，每个外部插件在独立 Worker 中执行
- [x] 已新增 `electron/plugins/externalPluginWorker.mjs`：Worker 入口，加载外部插件 ESM 模块，转发 `call`/`storage`/`http`/`log` 消息到宿主
- [x] 已新增 `electron/plugins/types.ts`：`ExternalPluginManifest`、`PluginStateRecord`、`InstalledPluginLocation`、`ExternalPluginRegistration` 等类型，以及 `ExternalPluginManifestSchema`（zod 校验）
- [x] IPC 通道已完整实现：`plugin:list`、`plugin:install-from-path`、`plugin:pick-install-path`、`plugin:set-enabled`、`plugin:uninstall`、`plugin:get-settings`、`plugin:update-settings`、`plugin:call`、`plugin:changed`（event）
- [x] 网络白名单已实现：`ExternalPluginHost.handleHttpRequest()` 按 manifest `permissions.network.domains` 校验，支持子域名匹配
- [x] 隔离存储已实现：Worker 通过 `storage:get/set/remove/clear` 消息操作宿主侧 `PluginStateStore`，命名空间为 `plugin:<platformId>`
- [x] 调用超时已实现：单次 handler 默认 15 秒超时，超时后自动 reject pending call
- [x] Sandbox 层已新增 `electron/sandbox/services/pluginProxy.ts`：类型安全的 IPC 代理，支持 `list`/`installFromPath`/`pickInstallPath`/`setEnabled`/`uninstall`/`getSettings`/`updateSettings`/`call`/`onChanged`
- [x] Renderer 侧已新增 `src/services/pluginService.ts`：统一 PluginService 工厂，Web 端返回 built-in 描述，Electron 端通过 IPC bridge 读取主进程管理的平台列表
- [x] Renderer 侧已新增 `src/platform/music/plugin/ExternalAdapterProxy.ts`：外部插件的 `MusicPlatformAdapter` 代理，通过 IPC `plugin:call` 转发所有方法调用
- [x] 设置页已新增 `src/components/settings/PluginManagerSection.vue`：包含插件安装（路径输入 + 浏览按钮）、启用/停用、卸载、设置编辑（动态渲染 boolean/select/text 控件）
- [x] 设置页已新增 `src/composables/usePluginManager.ts`：插件管理 composable，封装所有 CRUD 操作和设置编辑状态
- [x] 已新增 `plugins/examples/demo/`：示例外部插件，演示 search handler、storage、settings、logger 的使用
- [x] 已新增 P2 基础设施测试：`tests/electron/pluginStateStore.test.ts`、`tests/electron/pluginInstaller.test.ts`、`tests/electron/pluginCatalog.test.ts`、`tests/services/pluginService.test.ts`

本次 P2 实际落地文件：

Electron 主进程：

- `electron/plugins/PluginCatalog.ts`
- `electron/plugins/PluginInstaller.ts`
- `electron/plugins/PluginStateStore.ts`
- `electron/plugins/ExternalPluginHost.ts`
- `electron/plugins/externalPluginWorker.mjs`
- `electron/plugins/types.ts`
- `electron/ipc/handlers/plugin.handler.ts`

IPC 协议层：

- `electron/shared/protocol/channels.ts`（新增 `PLUGIN_PICK_INSTALL_PATH`）
- `electron/ipc/types.ts`（新增 `plugin:pick-install-path` 类型映射）
- `electron/sandbox/services/pluginProxy.ts`（新增 `pickInstallPath`）
- `electron/sandbox/index.ts`（暴露 `pickInstallPath`）
- `electron/sandbox/services/types.ts`（PluginProxy 已加入 ServiceProxies）

Renderer 渲染进程：

- `src/services/pluginService.ts`
- `src/composables/usePluginManager.ts`
- `src/components/settings/PluginManagerSection.vue`
- `src/platform/music/plugin/ExternalAdapterProxy.ts`
- `src/messages/ui.ts`（新增插件管理 UI 文案）

示例插件：

- `plugins/examples/demo/manifest.json`
- `plugins/examples/demo/index.mjs`
- `plugins/examples/demo/README.md`

测试：

- `tests/electron/pluginStateStore.test.ts`
- `tests/electron/pluginInstaller.test.ts`
- `tests/electron/pluginCatalog.test.ts`
- `tests/services/pluginService.test.ts`

补充说明：

1. **隔离运行时选择**：P2 最终采用 `worker_threads` 而非 `utilityProcess`，原因是 `worker_threads` 在 ESM 动态导入方面更成熟，且不需要 Electron 特定 API 支持。如果未来需要更强的进程隔离（例如独立内存空间），可以平滑迁移到 `utilityProcess`。
2. **Worker 产物格式**：Worker 入口使用 `.mjs` 后缀确保 Node.js 以 ESM 模式加载，外部插件本身也要求 `entry.module = "esm"`。
3. **安装后默认禁用**：新安装的插件默认 `enabled = false`，用户必须手动启用，符合最小权限原则。
4. **设置编辑**：设置页根据 manifest `contributions.settings` 动态渲染 boolean 复选框、select 下拉框和 text 输入框，不需要插件提供自定义 UI 代码。
5. **目录选择器**：新增 `plugin:pick-install-path` IPC 通道，调用 Electron `dialog.showOpenDialog`，用户可以通过浏览按钮选择插件目录或 manifest.json 文件。
6. **崩溃恢复**：`ExternalPluginHost` 在 Worker 异常退出时会 reject 所有 pending calls，下次 `call()` 时会尝试重新创建 Worker 实例。P3 将在此基础上增加熔断机制。

目标：提升可维护性和用户体验。

任务：

1. 权限摘要展示
2. 设置页自动生成
3. 插件崩溃熔断
4. 安装包校验和记录
5. 插件错误诊断日志

预计：4-6 天

#### P3 完成情况（2026-04-25）

- [x] **插件崩溃熔断**：`PluginCatalog.call()` 新增连续失败计数器，达到阈值（默认 5 次）后自动禁用插件并停止 Worker，状态标记为 `circuit-tripped`；重新启用时自动重置熔断状态
- [x] **安装包校验和记录**：`PluginInstaller` 在安装和扫描时计算入口文件 SHA-256 校验和，通过 `PluginStateStore.setChecksum()` 持久化
- [x] **插件错误诊断日志**：`PluginStateStore.recordCallFailure()` 记录 `{timestamp, method, error}` 到 capped ring buffer（上限 20 条），成功调用自动清除
- [x] **权限摘要展示**：设置页 `PluginManagerSection.vue` 新增权限声明区域，展示网络白名单域名和本地存储权限
- [x] **设置页自动生成**：已由 P2 完成（boolean/select/text 动态渲染），P3 新增设置编辑按钮和保存/取消流程

本次 P3 新增与修改文件：

Electron 主进程：

- `electron/plugins/types.ts`（新增 `PluginDiagnosticEntry`、扩展 `PluginStateRecord` 增加 `consecutiveFailures`/`circuitTrippedAt`/`checksum`/`diagnostics`）
- `electron/plugins/PluginStateStore.ts`（新增 `recordCallSuccess`/`recordCallFailure`/`tripCircuit`/`resetCircuit`/`setChecksum` 方法）
- `electron/plugins/PluginInstaller.ts`（新增 `computeFileChecksum`，`installFromPath` 和 `scanInstalledPlugins` 返回 checksum）
- `electron/plugins/PluginCatalog.ts`（`call()` 新增熔断逻辑，`setEnabled()` 新增熔断重置，`installFromPath()` 记录 checksum）

Renderer 渲染进程：

- `src/platform/music/descriptors.ts`（`PlatformDescriptor` 新增 `consecutiveFailures`/`circuitTrippedAt`，status 联合类型增加 `'circuit-tripped'`）
- `src/components/settings/PluginManagerSection.vue`（新增权限摘要、熔断警告、连续失败计数、设置编辑按钮）
- `src/messages/ui.ts`（新增 `pluginStorage`/`pluginPermissions`/`pluginCircuitTripped`/`pluginFailCount`/`pluginGranted` 文案）

测试：

- `tests/electron/pluginStateStore.test.ts`（补充 `consecutiveFailures`/`diagnostics` 字段）
- `tests/electron/pluginInstaller.test.ts`（`entryPath` 修复为安装目录路径）
- `tests/electron/pluginCatalog.test.ts`（mock 新增 `recordCallSuccess`/`recordCallFailure`/`setChecksum`/`resetCircuit`，验证熔断和成功/失败记录）
- `tests/services/pluginService.test.ts`（无修改，P3 无破坏性变更）
- `tests/electron/mainIndex.test.ts`（新增 `PluginCatalog`/`registerPluginHandlers` mock）
- `tests/services/index.test.ts`（新增 `IPluginService`/`createPluginService` mock，服务计数 10 → 11）
- `tests/platform/musicIndex.test.ts`（适配 `local` 平台描述符和 `getAvailablePlatforms()` 返回值）

补充说明：

1. **熔断恢复**：用户在设置页停用再重新启用已熔断的插件即可恢复，`setEnabled(true)` 会自动调用 `resetCircuit()` 清除连续失败计数和诊断日志
2. **诊断日志**：最多保留最近 20 条失败记录，可在 `PluginStateRecord.diagnostics` 中查看，目前通过 IPC `plugin:get-settings` 可以间接获取状态
3. **校验和**：基于入口文件的 SHA-256 哈希，安装时计算并存储，扫描时重新计算比对，可用于未来完整性校验
4. **electron-store 兼容**：`PluginStateStore` 使用 `require('electron-store')` + `mod.default ?? mod` 模式，兼容 electron-store v11 的 ESM-only 导出

### P4：后续可选扩展

1. 插件签名 / 官方源
2. 宿主审核型服务模板
3. 插件市场
4. 平台能力灰度开关

## 十五、风险与应对

| 风险                    | 应对                                                             |
| ----------------------- | ---------------------------------------------------------------- |
| 类型放宽后影响面大      | P0 先引入 `PlatformDescriptor` 和 `PlatformId`，再逐步清理调用点 |
| built-in 改造期间回归   | 先协议化再迁目录，不要一次性移动所有文件                         |
| 第三方插件影响稳定性    | 默认隔离执行，单插件失败不影响 renderer                          |
| 插件权限被低估          | 权限模型进入 manifest，安装时向用户展示                          |
| Web / Electron 行为分叉 | Web 只消费 built-in 描述，renderer 接口保持一致                  |
| 方案范围失控            | 明确把“第三方自带本地服务”移出首期                               |

## 十六、结论

优化后的方案有 4 个关键变化：

1. **平台描述以 main 为真源**，renderer 不再自行定义平台世界观。
2. **插件协议与宿主内部适配层解耦**，避免第三方插件直接继承宿主抽象类。
3. **第三方插件默认隔离执行**，不把 renderer 内的“受限对象”当成安全边界。
4. **首期范围收敛到“平台插件”而不是“任意服务插件”**，这样能在不推翻现有架构的前提下真正落地。

这套方案能保留现有 `MusicService`、`ServiceManager`、Store 和 UI 大部分结构，同时把最危险的边界问题提前解决。
