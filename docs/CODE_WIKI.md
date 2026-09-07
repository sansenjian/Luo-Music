# LUO Music Code Wiki

> 本文档是面向开发者的结构化代码百科，覆盖项目整体架构、主要模块职责、关键类与函数说明、依赖关系以及项目运行方式。
>
> 生成时间：2026-06-24 | 项目版本：0.16.0

---

## 1. 项目概述

[LUO Music](file:///d:/Desktop/python/MusicWeb/luo_music_new/README.md) 是一个同时支持 **Web** 与 **Electron 桌面端**的 Vue 3 音乐播放器。核心能力包括：

- 网易云音乐 / QQ 音乐搜索、歌单、歌曲详情与播放；
- 本地音乐库扫描、索引、封面与播放；
- 歌词显示（含桌面歌词）；
- 插件化音乐平台适配；
- Electron 桌面集成（窗口控制、系统托盘、全局快捷键、SMTC、原生音频输出）。

### 1.1 仓库定位

| 运行形态 | 入口 | 说明 |
| --- | --- | --- |
| Web 开发 | `npm run dev:web` | 本地 Vite 开发服务器 + `server/index.ts` 网易云 API |
| Electron 开发 | `npm run dev:electron` | 主进程 + renderer + preload + Rust helper 完整链路 |
| Web 构建 | `npm run build:web` | 输出到 `dist/` |
| Electron 构建 | `npm run build:electron` | 输出到 `out/make/`（zip 安装包） |
| Electron 便携版 | `npm run build:electron:portable` | 输出到 `out/portable/` |

---

## 2. 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端框架 | Vue 3（Composition API）、Vue Router 4、Pinia 3 |
| 构建工具 | Vite 8、electron-vite、vite-plus（VP CLI） |
| 类型系统 | TypeScript 6、vue-tsc、zod（运行时校验） |
| 样式方案 | Tailwind CSS 4、CSS 变量、animejs |
| 组件库 | reka-ui、自研 `src/components/ui/` |
| 桌面框架 | Electron 41、Electron Forge、electron-builder |
| 后端 / 本地服务 | Koa、@neteasecloudmusicapienhanced/api、@sansenjian/qq-music-api |
| 数据库 | better-sqlite3 + Kysely |
| 原生能力 | Rust 工作区（`native/`）：音频引擎、本地音乐扫描、SMTC helper |
| 测试 | Vitest、Playwright、@vue/test-utils |
| 监控 | Sentry Electron / Browser |

---

## 3. 项目目录结构

```text
luo_music_new/
├── .config/                 # 开发工具配置（Vite、Vitest、Playwright）
├── config/                  # 共享构建逻辑与 Sentry 构建环境
├── src/                     # Vue 渲染进程应用
├── electron/                # Electron 主进程、preload、本地服务编排
├── packages/
│   ├── shared/              # 跨 renderer / preload / main 的共享协议与类型
│   └── plugin-sdk/          # 插件 SDK 类型与运行时接口
├── plugins/                 # 内置示例插件与第三方插件
├── server/                  # 本地 API 服务（网易云）
├── api/                     # Vercel Serverless API 入口
├── native/                  # Rust 原生 helper 工作区
├── docs/                    # VitePress 文档站
└── scripts/                 # 构建、开发、测试、质量检查脚本
```

### 3.1 目录职责边界

- `src/api/` 只做请求与响应适配，不放视图逻辑。
- `src/platform/` 负责 Web / Electron 运行时差异收口。
- `src/store/` 是全局共享状态唯一数据源。
- `src/components/` 以展示和交互为主。
- `electron/` 只放主进程与 preload 逻辑，禁止混入前端浏览器代码。
- `packages/shared/` 只能包含纯 TypeScript 合同/类型，不能依赖 Vue、Pinia、DOM、Electron 或 Node-only API。
- `server/`、`api/`、`src/api/` 是三个不同入口，分别对应本地 API 服务端、Vercel Serverless、渲染侧请求适配。

---

## 4. 整体架构

LUO Music 采用**分层 + 平台适配 + 服务注册表**的架构：

```text
┌─────────────────────────────────────────────────────────────┐
│                      渲染进程 (Renderer)                      │
│  src/views/  src/components/  src/composables/  src/store/   │
├─────────────────────────────────────────────────────────────┤
│                      服务层 (Services)                        │
│  services.xxx()  / 显式 deps 注入 / @injectParam 装饰器       │
├─────────────────────────────────────────────────────────────┤
│                      平台适配层 (Platform)                    │
│  src/platform/  —  WebAdapter / ElectronAdapter               │
├─────────────────────────────────────────────────────────────┤
│  preload / sandbox (electron/sandbox/)  ← IPC →  主进程       │
├─────────────────────────────────────────────────────────────┤
│  Electron Main (electron/main/、electron/ipc/、electron/local-library/)
├─────────────────────────────────────────────────────────────┤
│  本地服务 (server/)、Vercel API (api/)、Rust Native (native/)
└─────────────────────────────────────────────────────────────┘
```

### 4.1 跨端通信链路

1. 渲染进程通过 `services.platform()` 调用统一平台接口。
2. Electron 环境下，平台接口通过 `window.electronAPI`（preload 暴露）调用主进程。
3. 主进程通过 `IpcService` 分发到各 `handler`。
4. handler 可进一步调用本地服务、`ServiceManager`、Rust helper 或 Node 原生能力。

---

## 5. 主要模块职责

### 5.1 渲染进程：src/

#### 5.1.1 入口与启动流程

- [src/main.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/main.ts)：创建 Vue App，安装 Pinia、Router，初始化服务，挂载错误处理与 Sentry。
- [src/App.vue](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/App.vue)：根组件，负责窗口边框、桌面歌词路由、SMTC 扩展、命令上下文、播放状态 IPC 监听等全局副作用。
- [src/router/index.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/router/index.ts)：定义三条核心路由：`Home`、`UserCenter`、`DesktopLyric`。

#### 5.1.2 服务层：src/services/

服务层采用**服务注册表 + `services.xxx()` 访问器**模式，参考 VSCode 服务标识符设计：

| 服务 | 标识符 | 工厂文件 | 说明 |
| --- | --- | --- | --- |
| PlatformService | `IPlatformService` | [platformService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/services/platformService.ts) | Web/Electron 平台能力 |
| ApiService | `IApiService` | [apiService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/services/apiService.ts) | 统一请求代理 |
| LoggerService | `ILoggerService` | [loggerService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/services/loggerService.ts) | 日志创建与管理 |
| ErrorService | `IErrorService` | [errorService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/services/errorService.ts) | 错误归一化与上报 |
| ConfigService | `IConfigService` | [configService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/services/configService.ts) | 端口、环境模式、服务发现 |
| ContextKeyService | `IContextKeyService` | [contextKeyService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/services/contextKeyService.ts) | 命令上下文键 |
| CommandService | `ICommandService` | [commandService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/services/commandService.ts) | 命令注册与执行 |
| PlayerService | `IPlayerService` | [playerService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/services/playerService.ts) | 播放器状态暴露 |
| MusicService | `IMusicService` | [musicService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/services/musicService.ts) | 音乐平台管理 |
| StorageService | `IStorageService` | [storageService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/services/storageService.ts) | 本地存储适配 |
| PluginService | `IPluginService` | [pluginService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/services/pluginService.ts) | 插件生命周期 |

核心函数：

- `setupServices(overrides?)`：注册全部服务，支持测试覆盖。
- `services.platform() / services.api() / ...`：延迟初始化访问器，自动检测服务重置。
- `createInstance() / injectParam()`：用于基础设施类的构造注入（不推荐在 Vue 组件中滥用）。

> 完整实现见 [src/services/index.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/services/index.ts) 与 [src/services/types.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/services/types.ts)。

#### 5.1.3 平台适配层：src/platform/

目标：将 Web 与 Electron 的运行时差异收口到统一接口。

| 文件 | 职责 |
| --- | --- |
| [src/platform/common/types.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/platform/common/types.ts) | 定义 `IPlatformService`、`IWindowService`、`ICacheService`、`IIPCService`、`ILocalLibraryService` |
| [src/platform/common/platformService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/platform/common/platformService.ts) | `PlatformServiceBase`、`PlatformServiceRegistry`、`detectElectron` |
| [src/platform/core/adapter.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/platform/core/adapter.ts) | 基础适配器 `PlatformAdapter` |
| [src/platform/core/electron.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/platform/core/electron.ts) | `ElectronAdapter`，通过 `window.electronAPI` 与主进程通信 |
| [src/platform/core/web.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/platform/core/web.ts) | `WebAdapter`，浏览器环境降级实现 |
| [src/platform/electron/electronPlatformService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/platform/electron/electronPlatformService.ts) | Electron 平台服务完整实现 |
| [src/platform/web/webPlatformService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/platform/web/webPlatformService.ts) | Web 平台服务完整实现 |

音乐平台适配：

- [src/platform/music/interface.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/platform/music/interface.ts)：定义通用 `MusicPlatformAdapter` 抽象类，统一 `search`、`getSongUrl`、`getSongDetail`、`getLyric`、`getPlaylistDetail`。
- [src/platform/music/plugin/PluginAdapterBridge.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/platform/music/plugin/PluginAdapterBridge.ts)：插件与核心之间的桥接器。
- [src/platform/music/plugin/BuiltInAdapterLoader.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/platform/music/plugin/BuiltInAdapterLoader.ts)：内置平台适配器加载器。
- [src/platform/music/plugin/ExternalAdapterProxy.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/platform/music/plugin/ExternalAdapterProxy.ts)：外部插件代理。
- [src/platform/music/plugin/standardModels.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/platform/music/plugin/standardModels.ts)：标准模型归一化防御层。

#### 5.1.4 全局状态：src/store/

- [src/store/pinia.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/store/pinia.ts)：创建并导出 Pinia 实例，启用持久化插件。
- [src/store/playerStore.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/store/playerStore.ts)：播放器状态总入口，内部拆分到 `src/store/player/` 子模块。

`src/store/player/` 子模块：

| 文件 | 职责 |
| --- | --- |
| [playerState.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/store/player/playerState.ts) | 初始状态、播放模式、音量等常量 |
| [playbackActions.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/store/player/playbackActions.ts) | 播放/暂停/切歌等动作接口 |
| [runtime.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/store/player/runtime.ts) | 播放器运行时生命周期管理 |
| [audioEvents.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/store/player/audioEvents.ts) | 音频元素事件绑定 |
| [lyricSync.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/store/player/lyricSync.ts) | 歌词索引解析与桌面歌词同步 |
| [ipcHandlers.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/store/player/ipcHandlers.ts) | Electron 主进程控制消息处理 |
| [playerPersistence.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/store/player/playerPersistence.ts) | 持久化存储与状态恢复 |
| [playerSnapshot.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/store/player/playerSnapshot.ts) | 跨进程状态快照广播 |
| [nativeAudioOutputOwnership.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/store/player/nativeAudioOutputOwnership.ts) | 原生音频输出拥有权管理 |
| [nativeAudioOutputPlayback.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/store/player/nativeAudioOutputPlayback.ts) | 原生音频输出播放请求与错误 |
| [songPrefetcher.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/store/player/songPrefetcher.ts) | 歌曲 URL 预取 |

其他 Store：

- `userStore`、`playlistStore`、`searchStore`、`recentPlayStore`、`toastStore`、`localPlaylistStore`。

#### 5.1.5 播放器底层：src/utils/player/

| 文件 | 职责 |
| --- | --- |
| [core/playerCore.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/utils/player/core/playerCore.ts) | 音频核心（HTMLAudioElement 封装） |
| [core/playbackController.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/utils/player/core/playbackController.ts) | 播放控制逻辑 |
| [core/playlistManager.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/utils/player/core/playlistManager.ts) | 播放列表管理 |
| [helpers/timeFormatter.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/utils/player/helpers/timeFormatter.ts) | 时间格式化 |
| [helpers/shuffleHelper.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/utils/player/helpers/shuffleHelper.ts) | 随机播放算法 |
| [modules/playbackErrorHandler.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/utils/player/modules/playbackErrorHandler.ts) | 播放错误处理 |
| [lyric-parser.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/utils/player/lyric-parser.ts) | 歌词解析 |
| [mediaProxy.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/utils/player/mediaProxy.ts) | 播放媒体 URL 代理/转换 |
| [songUrlResult.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/utils/player/songUrlResult.ts) | 歌曲 URL 结果处理 |

#### 5.1.6 请求层：src/utils/http/

核心文件 [src/utils/http/index.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/utils/http/index.ts) 封装 axios，提供：

- 请求缓存（`requestCache.ts`）
- 请求取消（`requestCanceler.ts`）
- 重试策略（`requestRetry.ts`）
- Cookie 注入（`transportFactory.ts`）
- 错误归一化（`cancelError.ts`、`transportShared.ts`）

#### 5.1.7 API 适配：src/api/

| 文件 | 职责 |
| --- | --- |
| [adapter.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/api/adapter.ts) | 通用响应适配 |
| [netease.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/api/netease.ts) | 网易云 API 封装 |
| [qqmusic.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/api/qqmusic.ts) | QQ 音乐 API 封装 |
| [search.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/api/search.ts) | 搜索统一入口 |
| [song.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/api/song.ts) | 歌曲详情/URL |
| [playlist.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/api/playlist.ts) | 歌单详情 |
| [album.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/api/album.ts) | 专辑详情 |
| [user.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/api/user.ts) | 用户相关 |
| [responseHandler.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/src/api/responseHandler.ts) | 响应处理工具 |

#### 5.1.8 组合式函数与页面

- `src/composables/`：可复用状态编排与副作用，如 `usePlayerViewModel`、`useSearch`、`useLocalLibrary`、`usePluginManager`。
- `src/features/home/`：首页功能模块（本地音乐、媒体面板、侧边栏、工作区）。
- `src/features/user-center/`：用户中心功能模块（喜欢歌曲、歌单、动态）。
- `src/views/Home.vue`、`src/views/UserCenter.vue`：页面组装层。

---

### 5.2 Electron 主进程：electron/

#### 5.2.1 主入口

[electron/main/index.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/main/index.ts)：

- 初始化 IPC 服务、窗口管理器、系统托盘、全局快捷键；
- 后台预热 `ServiceManager`、`PluginCatalog`；
- 创建 `SmtcNativeService` 与 `AudioOutputService`；
- 注册各类 IPC handler；
- 处理应用生命周期（单实例、退出清理等）。

[electron/main/app.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/main/app.ts)：

- 单实例锁、开发环境用户数据目录、Windows Shell 集成、全局错误处理。

#### 5.2.2 窗口管理

[electron/WindowManager.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/WindowManager.ts)：

- 创建主窗口、桌面歌词窗口；
- 窗口状态管理（最大化、最小化、全屏、置顶）；
- 向 renderer 发送消息；
- 与系统托盘、全局快捷键联动。

[electron/DesktopLyricManager.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/DesktopLyricManager.ts)：

- 桌面歌词窗口预热、显示/隐藏、位置保存。

#### 5.2.3 IPC 系统

[electron/ipc/IpcService.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/ipc/IpcService.ts)：

- 统一的 IPC 服务枢纽；
- 支持 middleware（error、logger、performance）；
- handler 注册与消息广播。

[electron/ipc/index.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/ipc/index.ts)：

- 集中注册所有 handler：`registerWindowHandlers`、`registerCacheHandlers`、`registerConfigHandlers`、`registerPlayerHandlers`、`registerLocalLibraryHandlers`、`registerPluginHandlers`、`registerSmtcHandlers`、`registerAudioOutputHandlers` 等。

主要 handler：

| Handler | 文件 | 职责 |
| --- | --- | --- |
| API Gateway | [api.handler.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/ipc/handlers/api.handler.ts) | 透调用本地服务或插件方法 |
| Player | [player.handler.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/ipc/handlers/player.handler.ts) | 播放器控制与状态同步 |
| Local Library | [localLibrary.handler.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/ipc/handlers/localLibrary.handler.ts) | 本地音乐库操作 |
| Config | [config.handler.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/ipc/handlers/config.handler.ts) | 配置读写 |
| Cache | [cache.handler.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/ipc/handlers/cache.handler.ts) | 缓存大小/清理 |
| Plugin | [plugin.handler.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/ipc/handlers/plugin.handler.ts) | 插件安装/启用/调用 |
| SMTC | [smtc.handler.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/ipc/handlers/smtc.handler.ts) | Windows 系统媒体控制 |
| Audio Output | [audioOutput.handler.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/ipc/handlers/audioOutput.handler.ts) | 原生音频输出控制 |

#### 5.2.4 Preload / Sandbox

[electron/sandbox/index.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/sandbox/index.ts)：

- 构建 preload 脚本，将 `electronAPI` 暴露到 `window`。

[electron/sandbox/services/ipcProxy.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/sandbox/services/ipcProxy.ts)：

- 渲染进程调用主进程 IPC 的安全代理。

#### 5.2.5 本地音乐库

[electron/local-library/service.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/local-library/service.ts)：

- 本地音乐库主服务，协调扫描、索引、元数据、封面。

核心子模块：

| 文件 | 职责 |
| --- | --- |
| [scanEngine.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/local-library/scanEngine.ts) | 扫描引擎 |
| [nativeScanner.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/local-library/nativeScanner.ts) | 调用 Rust scanner |
| [repository.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/local-library/repository.ts) | 数据访问层 |
| [repository.kysely.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/local-library/repository.kysely.ts) | Kysely 查询构建 |
| [coverManager.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/local-library/coverManager.ts) | 封面缓存与管理 |
| [watchCoordinator.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/local-library/watchCoordinator.ts) | 文件夹监听 |
| [protocol.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/local-library/protocol.ts) | 本地媒体协议注册 |
| [protocol.privileged.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/local-library/protocol.privileged.ts) | 特权协议注册 |

#### 5.2.6 插件系统

[electron/plugins/PluginCatalog.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/plugins/PluginCatalog.ts)：

- 管理内置与第三方插件的加载、启用、调用。

[electron/plugins/ExternalPluginHost.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/plugins/ExternalPluginHost.ts)：

- 外部插件宿主，通过 Worker 隔离运行。

[electron/plugins/PluginInstaller.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/electron/plugins/PluginInstaller.ts)：

- 插件安装、卸载、zip 包处理。

---

### 5.3 共享包

#### 5.3.1 packages/shared/

纯 TypeScript 合同，跨 renderer / preload / main 使用。

| 目录 | 说明 |
| --- | --- |
| `contracts/` | 服务合同：`audio.ts`、`config.ts`、`ipc.ts`、`log.ts`、`netease.ts`、`sandbox.ts` |
| `types/` | 共享类型：`schemas.ts`、`player.ts`、`platform.ts`、`localLibrary.ts` |
| `player/` | 播放器纯逻辑：`lyric.ts`、`playMode.ts`、`index.ts` |
| `protocol/` | 协议常量：`channels.ts`、`cache.ts` |
| `audioOutput/` | 原生音频输出协议 |
| `smtc/` | SMTC 协议 |

关键类型 [packages/shared/types/schemas.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/packages/shared/types/schemas.ts)：

- `Song`、`Artist`、`Album` 使用 zod 定义，供运行时校验。
- `BuiltInPlatforms = ['netease', 'qq', 'local']`。

关键协议 [packages/shared/contracts/ipc.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/packages/shared/contracts/ipc.ts)：

- `InvokeChannelMap`、`SendChannelMap`、`ReceiveChannelMap`：类型安全的 IPC 通道映射。
- `PlayerStateResponse`、`PlayerStateSnapshot`、`DesktopLyricSnapshot`：跨进程状态同步结构。

关键通道 [packages/shared/protocol/channels.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/packages/shared/protocol/channels.ts)：

- `INVOKE_CHANNELS`、`SEND_CHANNELS`、`RECEIVE_CHANNELS`：所有 IPC 通道字符串常量。

#### 5.3.2 packages/plugin-sdk/

插件开发 SDK：

- [types.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/packages/plugin-sdk/types.ts)：插件接口、manifest、权限、贡献点。
- [runtime.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/packages/plugin-sdk/runtime.ts)：插件运行时 API。
- [runtime-shared.mjs](file:///d:/Desktop/python/MusicWeb/luo_music_new/packages/plugin-sdk/runtime-shared.mjs)：与宿主共享的运行时模块。

---

### 5.4 原生层：native/

Rust 工作区，提供高性能或底层系统能力。

```text
native/
├── audio-engine/            # Rust 音频引擎工作区
│   ├── audio-engine-core/   # 核心音频图、buffer、format
│   ├── audio-engine-decode/ # 解码（symphonia / ffmpeg）
│   ├── audio-engine-dsp/    # 数字信号处理
│   ├── audio-engine-output/ # 输出（cpal / WASAPI）
│   └── audio-output-helper/ # 可执行 helper，供 Electron 调用
├── local-library-scanner/   # 本地音乐文件扫描
└── smtc-helper/             # Windows SMTC 控制
```

主进程通过 `SmtcNativeService` 和 `AudioOutputService` 调用对应 helper 可执行文件。

---

### 5.5 本地服务：server/

[server/index.ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/server/index.ts)：

- 基于 Koa（当前主要为占位）；
- 启动 `@neteasecloudmusicapienhanced/api` 提供网易云 API；
- 默认端口 `NCM_PORT = 14532`。

---

### 5.6 Vercel API：api/

- [api/[...netease].ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/api/%5B...netease%5D.ts)：网易云 API 转发。
- [api/qq/[...qq].ts](file:///d:/Desktop/python/MusicWeb/luo_music_new/api/qq/%5B...qq%5D.ts)：QQ 音乐 API 转发。

仅用于 Vercel Serverless 部署，不从 `src/` 或 `electron/` 导入。

---

## 6. 关键类与函数说明

### 6.1 服务注册与访问

```ts
// src/services/index.ts
export const services = {
  platform: createServiceAccessor(IPlatformService, setupServices),
  api: createServiceAccessor(IApiService, setupServices),
  logger: createServiceAccessor(ILoggerService, setupServices),
  // ...
}
```

- `createServiceAccessor`：为每个服务创建延迟初始化访问器，支持服务重置检测。
- `setupServices(overrides)`：注册全部服务；带覆盖时重置注册表。

### 6.2 平台服务

```ts
// src/platform/common/platformService.ts
class PlatformServiceBase implements IPlatformService {
  abstract minimizeWindow(): void
  abstract maximizeWindow(): void
  abstract closeWindow(): void
  abstract on(channel: string, callback: IMessageHandler): IDisposable
  abstract send(channel: string, data: unknown): void
  // ...
}
```

- `ElectronPlatformService`：通过 IPC 调用主进程窗口/缓存/本地库能力。
- `WebPlatformService`：基于 `CustomEvent`、localStorage、IndexedDB 实现降级能力。

### 6.3 音乐平台适配器

```ts
// src/platform/music/interface.ts
export abstract class MusicPlatformAdapter {
  platformId: string
  abstract search(keyword: string, limit: number, page: number): Promise<SearchResult>
  abstract getSongUrl(id: string | number, options?: SongUrlOptions | string): Promise<SongUrlResult | null>
  abstract getSongDetail(id: string | number): Promise<Song | null>
  abstract getLyric(id: string | number): Promise<LyricResult>
  abstract getPlaylistDetail(id: string | number): Promise<PlaylistDetail | null>
}
```

内置适配器通过 `BuiltInAdapterLoader` 加载，外部插件通过 `ExternalAdapterProxy` 接入。

### 6.4 IPC 类型安全通道

```ts
// packages/shared/protocol/channels.ts
export const INVOKE_CHANNELS = {
  API_REQUEST: 'luo:invoke:api:request',
  PLAYER_PLAY: 'luo:invoke:player:play',
  LOCAL_LIBRARY_GET_TRACKS: 'luo:invoke:local-library:get-tracks',
  // ...
} as const
```

```ts
// packages/shared/contracts/ipc.ts
export type InvokeChannelMap = /* 模板类型生成的完整映射 */
export type SendChannelMap = /* ... */
export type ReceiveChannelMap = /* ... */
```

编译时断言确保 `channels.ts` 与 `ipc.ts` 的键集合完全一致。

### 6.5 播放器核心

```ts
// src/utils/player/core/playerCore.ts（推断）
export const playerCore = { /* 音频元素封装、播放状态、音量等 */ }
```

```ts
// src/utils/player/core/playbackController.ts（推断）
export const playbackController = { /* 播放/暂停/跳转控制 */ }
```

```ts
// src/utils/player/core/playlistManager.ts（推断）
export const playlistManager = { /* 列表、顺序、随机、循环 */ }
```

```ts
// packages/shared/player/lyric.ts
export class LyricEngine { /* 歌词解析与高亮 */ }
export type LyricLine = { time: number; text: string; trans?: string; roma?: string }
```

### 6.6 HTTP 请求核心

```ts
// src/utils/http/index.ts
export const request = createTransport({
  service: 'netease',
  baseURL: getBaseURL,
  timeout: HTTP_DEFAULT_TIMEOUT,
  withCredentials: isElectronRenderer,
  retry: HTTP_DEFAULT_RETRY_COUNT,
  // ...
})
```

主要能力：

- `requestCache.ts`：命名空间缓存、过期清理、统计。
- `requestCanceler.ts`：按 key/url 取消、全局取消、活跃请求计数。
- `requestRetry.ts`：指数退避重试。
- `transportFactory.ts`：统一 transport 创建，支持 cookie 注入与静态响应。

### 6.7 本地音乐库核心

```ts
// electron/local-library/service.ts（推断）
export async function scanLocalLibrary(): Promise<LocalLibraryState>
export async function getLocalLibraryTracks(query?: LocalLibraryTrackQuery): Promise<LocalLibraryPage<LocalLibraryTrack>>
```

扫描流程：

1. `scanEngine.ts` 枚举文件夹；
2. `nativeScanner.ts` 调用 `native/local-library-scanner` 解析元数据；
3. `repository.ts` 写入 SQLite 并去重；
4. `coverManager.ts` 提取/缓存封面；
5. `watchCoordinator.ts` 监听文件夹变化。

---

## 7. 依赖关系

### 7.1 模块依赖简图

```text
src/views/ src/components/
        │
        ▼
src/composables/  src/features/
        │
        ▼
  src/store/  src/services/  src/api/
        │           │            │
        └───────────┴────────────┘
                    │
              src/platform/
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  src/platform/web/      src/platform/electron/
                                │
                                ▼
                    window.electronAPI (preload)
                                │
                                ▼
                    electron/ipc/ + electron/main/
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
      electron/local-library/  native/           server/
      electron/plugins/        (Rust helpers)
      electron/service/
```

### 7.2 关键依赖方向

- `src/*` → `src/services` → `src/platform` → `window.electronAPI`（Electron）或浏览器 API（Web）。
- `src/*` 与 `electron/*` 共同依赖 `@shared/*` 与 `@plugin-sdk/*`。
- `electron/main/*` 可以依赖 `src/config/shortcuts.ts` 等少量共享常量，但禁止依赖 `src/components`、`src/composables`、`src/views`、`src/store`、`src/services`、`src/utils/player` 等渲染进程私有目录。
- `server/` 独立运行，不依赖渲染进程或主进程模块。
- `api/` 独立部署，不从 `src/` 或 `electron/` 导入。

---

## 8. 构建与运行方式

### 8.1 环境要求

- Windows 优先
- Node.js `>=22.x`，推荐 Node 24+
- npm 10+
- Rust toolchain（用于 native helper）

### 8.2 安装

```bash
npm install --prefer-online
npm run vp:version
```

### 8.3 开发

```bash
# Web 开发
npm run dev:web

# Electron 开发（自动编译 Rust helper）
npm run dev:electron

# Electron 调试模式
npm run dev:electron:debug
```

### 8.4 构建

```bash
npm run build:web
npm run build:electron
npm run build:electron:portable
npm run build:electron:all
npm run build:server
```

输出目录：

| 命令 | 输出 |
| --- | --- |
| `build:web` | `dist/` |
| `build:electron` | `out/make/`、`out/third-party-plugins/` |
| `build:electron:portable` | `out/portable/`、`out/third-party-plugins/` |
| `build:server` | `build/service/index.cjs` |

### 8.5 测试与质量

```bash
npm run test:run              # 单元测试
npm run test:native           # 包含 better-sqlite3 等 native 路径的测试
npm run test:e2e              # Playwright E2E 测试
npm run typecheck             # TypeScript 检查
npm run lint                  # 架构边界 + oxlint
npm run format:check          # 格式检查
npm run quality               # typecheck + lint + format:check
npm run quality:full          # quality + test:ci + build:web
```

### 8.6 文档站

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

---

## 9. 开发与提交规范

### 9.1 分支流程

- `master`：稳定主分支，只接受 PR。
- `dev`：日常开发集成分支。
- 功能分支从 `dev` 创建，完成后 PR 到 `dev`。
- 可用前缀：`feature/`、`fix/`、`docs/`、`chore/`、`ci/`。

### 9.2 代码规范

- 新增逻辑优先使用 TypeScript，避免扩散 `any`。
- `src/*` 导入优先使用 `@/`。
- `packages/shared/*` 导入使用 `@shared/`。
- 类型导入优先使用 `import type`。
- 组件名 PascalCase，组合式函数 camelCase，类型文件 `*.types.ts`，常量文件 `*.const.ts`。

### 9.3 模块边界红线

- 渲染进程禁止直接调用 Node / Electron API，统一走 `src/platform` → preload → IPC。
- 不要在模块顶层缓存服务实例（除非明确单例边界）。
- 不要新增 `getPlatformAccessor()` 这类 service accessor 兼容层。
- 不要把 `@injectParam(...)` 扩散到普通 Vue 业务代码。
- 平台专属字段优先放入 `extra`，确认通用后再提升为 `Song` 等模型字段。

### 9.4 提交前检查

常规改动：

```bash
npm run check:architecture
npm run test:run
```

涉及构建 / Electron / 路径：

```bash
npm run test:run
npm run build:web
npm run build:electron
```

文档改动：

```bash
npm run docs:build
```

---

## 10. 扩展阅读

- [README.md](file:///d:/Desktop/python/MusicWeb/luo_music_new/README.md)
- [AGENTS.md](file:///d:/Desktop/python/MusicWeb/luo_music_new/AGENTS.md)
- [开发分支流程](file:///d:/Desktop/python/MusicWeb/luo_music_new/docs/development-workflow.md)
- [构建与发布](file:///d:/Desktop/python/MusicWeb/luo_music_new/docs/build.md)
- [测试说明](file:///d:/Desktop/python/MusicWeb/luo_music_new/docs/testing.md)
- [服务层与 DI](file:///d:/Desktop/python/MusicWeb/luo_music_new/docs/service-layer.md)
- [架构设计](file:///d:/Desktop/python/MusicWeb/luo_music_new/docs/architecture/index.md)
- [本地音乐库架构](file:///d:/Desktop/python/MusicWeb/luo_music_new/docs/architecture/local-library.md)
- [插件拓展架构](file:///d:/Desktop/python/MusicWeb/luo_music_new/docs/architecture/plugin-extension-architecture.md)
- [Rust 原生音频引擎](file:///d:/Desktop/python/MusicWeb/luo_music_new/docs/architecture/native-audio-rust-engine.md)
- [SMTC 集成](file:///d:/Desktop/python/MusicWeb/luo_music_new/docs/architecture/smtc.md)
