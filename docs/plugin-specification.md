# Luo-Music 插件规范 (Plugin Specification)

> 版本: 1.0.0
> 最后更新: 2026-05-01

## 1. 概述

Luo-Music 采用插件化架构，所有可扩展能力均通过插件提供。插件分两类：

| 类型                         | 来源                     | 运行时                            | 示例                                  |
| ---------------------------- | ------------------------ | --------------------------------- | ------------------------------------- |
| **第一方插件 (First-party)** | 随应用分发，源码在仓库内 | `local` — 主进程内直接加载        | 波形可视化、SMTC、桌面歌词、滑动切歌  |
| **第三方插件 (Third-party)** | 外部安装，独立分发       | `external-host` — Worker 线程隔离 | 网易云音乐、QQ 音乐、社区开发的音乐源 |

两类插件共享同一套接口约定 (`packages/plugin-sdk`)，区别仅在于运行时隔离级别和权限模型。

---

## 2. 插件分类与职责

插件管理页按 manifest `category` 自适应分组。未声明时默认为 `api`，兼容已有音乐源插件。

| `category`  | 页面分类 | 职责                                      |
| ----------- | -------- | ----------------------------------------- |
| `api`       | API      | 平台 API 功能，例如搜索、播放、歌词、登录 |
| `extension` | 拓展     | 播放器体验、播放控制、系统集成等优化功能  |
| `theme`     | 主题     | UI 外观、布局、主题样式等优化功能         |

### 2.1 音乐平台插件 (Music Platform Plugin)

提供音乐源能力：搜索、播放 URL、歌词、歌单等。这是第三方插件的核心场景。

**必须实现的方法** (至少 `search`)：

| 方法                | 输入                       | 输出                            | 说明                  |
| ------------------- | -------------------------- | ------------------------------- | --------------------- |
| `search`            | `{ keyword, limit, page }` | `{ list: PluginSong[], total }` | 关键字搜索            |
| `getSongUrl`        | `{ id, options? }`         | `string \| null`                | 获取播放地址          |
| `getSongDetail`     | `{ id }`                   | `PluginSong \| null`            | 歌曲详情              |
| `getLyric`          | `{ id }`                   | `{ lrc, tlyric, romalrc }`      | 歌词 (原文/翻译/音译) |
| `getPlaylistDetail` | `{ id }`                   | `PlaylistDetail \| null`        | 歌单详情              |

### 2.2 功能增强插件 (Feature Plugin)

提供 UI 增强或系统集成能力。这是第一方插件的核心场景。

**可选实现的钩子**：

| 钩子               | 调用时机 | 说明                     |
| ------------------ | -------- | ------------------------ |
| `onActivate`       | 插件启用 | 初始化资源、注册 UI 贡献 |
| `onDeactivate`     | 插件禁用 | 清理资源、注销 UI 贡献   |
| `onSettingsChange` | 设置变更 | 响应用户配置变更         |
| `dispose`          | 插件卸载 | 释放所有资源             |

> 功能增强插件规范目前为**预留设计**，首期先落地音乐平台插件的完整剥离。功能增强插件的正式规范将在第一方插件迁移完成后发布。

### 2.3 主题插件 (Theme Plugin)

主题插件通过 `contributions.themeResources` 声明渲染风格、CSS 变量和可选的主题 CSS。第一方主题和第三方主题使用同一套声明格式；差异只在启用状态由本地配置还是插件安装状态管理。

主题 CSS 是声明式样式贡献，不执行插件代码。宿主只在对应 `renderStyle` 被选中时挂载这段 CSS，切回其他风格时会自动卸载。

复杂主题推荐使用 `cssFile` 指向插件目录内的 CSS 文件；安装器会校验路径必须留在插件目录内，并把文件内容内联到运行时的 `cssText`。短样式仍可直接使用 `cssText`。

### 2.4 插件使用说明

所有插件都在应用侧边栏的「插件管理」页面集中管理。Electron 桌面端支持安装第三方插件：可以输入插件目录路径或 `manifest.json` 路径，也可以点击「浏览」选择目录；Web 端不提供本地插件安装能力，只展示当前运行环境可用的内置插件能力。

插件卡片会显示来源、版本、状态、权限声明和连续失败次数。第三方插件可卸载；第一方插件随应用分发，只能启用或停用。若插件进入 `circuit-tripped` 熔断状态，先停用再启用可重置熔断。

#### API 插件

API 插件提供音乐平台能力，例如搜索、播放地址、歌词、歌单详情和平台登录。

使用步骤：

1. 在「插件管理」页面打开「API 插件」分类。
2. Electron 桌面端安装第三方 API 插件；内置或已安装插件会直接显示在列表中。
3. 点击插件卡片的启用按钮。
4. 若插件声明了设置项，点击「设置」填写音质、Token、日志开关等配置并保存。
5. 回到首页搜索栏，在平台选择器中选择该插件对应的音乐平台。
6. 搜索歌曲、播放歌曲或打开歌词时，宿主会按插件声明的能力调用 `search`、`getSongUrl`、`getLyric` 等方法。

使用注意：

- 只有 `enabled: true` 且声明 `capabilities.search: true` 的 API 插件会出现在搜索栏平台选择器里。
- 插件禁用后不会继续参与搜索、播放地址刷新或歌词请求。
- 插件需要访问外部服务时，必须在 `permissions.network.domains` 中声明域名；未声明域名的请求会被宿主拒绝。
- 需要持久化用户配置或临时挑战状态的插件应声明 `permissions.storage: true`；需要保存 Cookie、token 等敏感凭据的插件必须声明 `permissions.secrets: true` 并使用 `ctx.secrets`。
- 未声明 `storage` / `secrets` 权限时，Worker 运行期访问会被宿主拒绝；插件升级后若 manifest 降权移除相关权限，宿主会清理该插件已有的对应持久化数据。
- 若插件支持登录能力，登录入口由宿主按 `capabilities.auth` 展示；登录态过期或插件禁用后，相关平台能力可能不可用。

#### 拓展插件

拓展插件用于增强播放器体验、播放控制或系统集成。当前第一方拓展示例包括 Windows SMTC 和滑动封面切歌。

使用步骤：

1. 在「插件管理」页面打开「拓展插件」分类。
2. 找到目标拓展插件并点击启用。
3. 若插件声明了设置项，点击「设置」调整插件参数。
4. 返回播放器使用对应能力；拓展通常不出现在搜索平台选择器中，而是直接改变播放器行为或系统集成。

使用注意：

- 拓展插件的可用平台取决于宿主运行环境。例如 Windows SMTC 仅在 Electron 桌面端有意义。
- 拓展插件禁用后应立即停止新增行为；涉及主进程、系统媒体控制或后台任务的插件应在停用时清理资源。
- 当前第三方拓展插件只建议使用声明式贡献点；不要让第三方插件直接操作 renderer DOM 或绕过 preload / IPC 边界。

#### 主题插件

主题插件用于提供新的渲染风格。它可以通过 `cssVariables` 调整颜色、圆角、阴影、间距等主题变量，也可以通过 `cssText` 对带有稳定 `data-ui` 标记的界面结构做更完整的视觉定制。

使用步骤：

1. 在「插件管理」页面打开「主题插件」分类。
2. Electron 桌面端安装第三方主题插件，或启用内置主题插件。
3. 打开设置里的渲染风格选项，选择主题插件贡献的风格名称。
4. 主题切换后，宿主会写入 `data-render-style`，应用主题变量，并挂载当前主题的 `cssText`。
5. 禁用或卸载当前正在使用的主题插件时，宿主会回退到 `classic`。

使用注意：

- 一个主题插件可以通过 `contributions.themeResources` 提供多个渲染风格。
- `renderStyle` 应使用稳定且全局唯一的命名，例如 `vendor.theme-name`。
- 主题 CSS 推荐以 `:root[data-render-style='...']` 作为选择器前缀，避免影响其他主题。
- 主题 CSS 应优先选择 `[data-ui='player']`、`[data-ui='sidebar']`、`[data-ui='workspace-panel']` 等稳定标记，不依赖内部临时 class。
- 宿主会拒绝挂载包含 `@import` 或远程 `url(http/https/javascript)` 的 `cssText`，避免主题样式隐式发起网络请求。

---

## 3. 清单文件 (Manifest)

每个插件必须提供清单文件。第三方插件使用 JSON 格式 (`manifest.json`)，第一方插件使用 TypeScript 对象。

### 3.1 完整字段

```jsonc
{
  // ─── 必填 ─────────────────────────────────────────
  "manifestVersion": 1, // 清单格式版本，当前为 1
  "id": "com.example.my-plugin", // 全局唯一 ID，反向域名格式
  "name": "My Plugin", // 显示名称
  "version": "1.0.0", // 语义化版本
  "platformId": "myplatform", // 平台标识符，用于内部路由
  "category": "api", // "api" | "extension" | "theme"，未声明默认 api

  // ─── 来源与运行时 ─────────────────────────────────
  "source": "external", // "core" | "builtin" | "external"
  "runtime": "external-host", // "local" | "external-host"

  // ─── 入口 (第三方必填) ────────────────────────────
  "entry": {
    "main": "index.mjs", // 入口文件名 (相对于插件根目录)
    "module": "esm" // "esm" | "cjs"
  },

  // ─── 兼容性 (第三方必填) ──────────────────────────
  "engines": {
    "pluginApi": "^1.0.0", // 依赖的 plugin-sdk 版本
    "app": ">=2.3.0" // 依赖的最低应用版本
  },

  // ─── 选填元数据 ──────────────────────────────────
  "description": "示例音乐源插件",
  "author": "Your Name",
  "homepage": "https://github.com/you/luo-music-my-plugin",

  // ─── 能力声明 ────────────────────────────────────
  "capabilities": {
    "search": true,
    "songUrl": true,
    "songDetail": false,
    "lyric": true,
    "playlistDetail": false,
    "needsHydration": false, // 搜索结果是否需要二次补全
    "supportsLyricFetch": true, // 是否支持独立歌词获取
    "supportsUrlRefreshOnFailure": false // 播放失败时是否可刷新 URL
  },

  // ─── 权限声明 ────────────────────────────────────
  "permissions": {
    "network": {
      "domains": ["api.example.com", "cdn.example.com"]
    },
    "storage": true
  },

  // ─── 声明式贡献 ──────────────────────────────────
  "contributions": {
    "themeResources": [
      {
        "id": "com.example.my-plugin.ocean",
        "label": "海风主题",
        "renderStyle": "example.ocean",
        "description": "提供偏冷色的界面变量覆盖。",
        "cssVariables": {
          "--accent": "#006d77",
          "--ui-primary-bg": "#006d77",
          "--ui-primary-text": "#ffffff"
        },
        "cssFile": "theme.css"
      }
    ],
    "settings": [
      {
        "key": "bitrate",
        "type": "select",
        "label": "默认音质",
        "default": "standard",
        "options": [
          { "value": "standard", "label": "标准" },
          { "value": "higher", "label": "较高" },
          { "value": "lossless", "label": "无损" }
        ]
      },
      {
        "key": "verboseLog",
        "type": "boolean",
        "label": "详细日志"
      },
      {
        "key": "apiToken",
        "type": "text",
        "label": "API Token"
      }
    ]
  }
}
```

### 3.2 字段约束

| 字段          | 第三方                 | 第一方 (builtin)       | 说明                     |
| ------------- | ---------------------- | ---------------------- | ------------------------ |
| `id`          | 反向域名格式           | `builtin.{platformId}` | 全局唯一                 |
| `category`    | 可选，默认 `api`       | 可选，默认 `api`       | 插件管理页分组           |
| `source`      | 必须为 `external`      | `builtin`              | —                        |
| `runtime`     | 必须为 `external-host` | `local`                | —                        |
| `entry`       | 必填                   | 不需要                 | 第三方需要入口文件       |
| `engines`     | 必填                   | 可选                   | 版本兼容性               |
| `permissions` | 必填                   | 不需要                 | 第三方需声明权限才能使用 |

---

## 4. 插件接口 (Plugin SDK)

SDK 位于 `packages/plugin-sdk/`，是插件开发的唯一依赖。

### 4.1 安装

```bash
npm install @luo-music/plugin-sdk
```

### 4.2 核心类型

```typescript
// ─── 插件上下文 (注入给插件的运行时 API) ─────────
interface PluginContext {
  platformId: string // 插件的平台标识
  settings: Readonly<Record<string, unknown>> // 只读用户设置
  storage: PluginStorage // 键值持久化
  http: RestrictedHttpClient // 受限 HTTP 客户端
  logger: PluginLogger // 结构化日志
}

// ─── 存储接口 ──────────────────────────────────
interface PluginStorage {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  clear(): Promise<void>
}

// ─── 受限 HTTP (仅允许访问声明的域名) ───────────
interface RestrictedHttpClient {
  get<T>(url: string, params?: Record<string, unknown>): Promise<T>
  post<T>(url: string, body?: unknown): Promise<T>
}

// ─── 日志接口 ──────────────────────────────────
interface PluginLogger {
  trace(message: string, meta?: Record<string, unknown>): void
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}
```

### 4.3 数据模型

插件数据模型和应用内部 `Song` / `SearchResult` / `LyricResult` / `PlaylistDetail` 保持同构。插件作者应在插件内部完成外部接口到通用模型的映射，再把结果返回给宿主。

宿主在桥接层会做保护性归一化，用来处理旧插件、缺字段或类型不稳定的返回值；但这只是安全网，不是主要开发方式。新插件不要把 QQ 音乐、网易云音乐或其他来源的原始响应直接返回给框架。

平台专属字段优先放在 `extra`，例如第三方接口 token、来源原始 ID、专属音质字段等。只有当字段变成跨来源稳定能力后，才应提升到通用模型。

```typescript
interface PluginSong {
  id: string | number
  name: string
  artists: PluginArtist[]
  album: PluginAlbum
  duration: number // 毫秒
  mvid: string | number
  platform: string // 必须等于 platformId
  originalId: string | number
  extra?: Record<string, unknown> // 平台特有数据 (如 mediaId)
  url?: string
  mediaId?: string | number
  retryCount?: number
  unavailable?: boolean
  errorMessage?: string | null
}

interface PluginArtist {
  id: string | number
  name: string
}

interface PluginAlbum {
  id: string | number
  name: string
  picUrl: string
}

interface SearchResult {
  list: PluginSong[]
  total: number
}

interface LyricResult {
  lrc: string // LRC 格式原文歌词
  tlyric: string // LRC 格式翻译歌词
  romalrc: string // LRC 格式音译歌词
}

interface PlaylistDetail {
  id: string | number
  name: string
  coverImgUrl: string
  description?: string
  trackCount?: number
  tracks: PluginSong[]
}

interface StandardAccountProfile {
  id: string | number
  nickname: string
  avatarUrl?: string
  homepageUrl?: string
  extra?: Record<string, unknown>
}

interface StandardPageInfo {
  limit: number
  offset: number
  total?: number
  hasMore: boolean
}

interface StandardSongPage {
  list: PluginSong[]
  page: StandardPageInfo
}

interface StandardPlaylistSummary {
  id: string | number
  name: string
  coverImgUrl?: string
  description?: string
  trackCount?: number
  subscribed?: boolean
  creator?: StandardAccountProfile
  extra?: Record<string, unknown>
}

interface StandardPlaylistPage {
  list: StandardPlaylistSummary[]
  page: StandardPageInfo
}
```

账号和资料库能力使用独立方法名:

| 方法                        | 输入                           | 输出                             | 说明             |
| --------------------------- | ------------------------------ | -------------------------------- | ---------------- |
| `account.getProfile`        | `{ userId? }`                  | `StandardAccountProfile \| null` | 获取账号资料摘要 |
| `library.getLikedSongs`     | `{ userId?, limit?, offset? }` | `StandardSongPage`               | 获取喜欢歌曲分页 |
| `library.getPlaylists`      | `{ userId?, limit?, offset? }` | `StandardPlaylistPage`           | 获取用户歌单分页 |
| `library.getPlaylistTracks` | `{ id, limit?, offset? }`      | `StandardSongPage`               | 获取歌单歌曲分页 |

业务层必须通过 `services.plugins().account` / `services.plugins().library` facade 访问这些能力，不要直接拼接 `pluginService.call(platformId, 'library.xxx')`。

### 4.4 插件定义

```typescript
import { defineMusicPlugin, type MusicPluginDefinition } from '@luo-music/plugin-sdk'

const myPlugin: MusicPluginDefinition = defineMusicPlugin({
  manifest: {
    manifestVersion: 1,
    id: 'com.example.my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    platformId: 'myplatform',
    source: 'external',
    runtime: 'external-host',
    capabilities: {
      /* ... */
    }
  },

  async create(ctx: PluginContext) {
    // 初始化插件实例
    return {
      async search(input) {
        // 实现 search
      },
      async getSongUrl(input) {
        // 实现 getSongUrl
      },
      // ... 其他方法
      async dispose() {
        // 清理资源
      }
    }
  }
})

export default myPlugin
```

---

## 5. 第三方插件开发指南

### 5.1 目录结构

```
my-plugin/
├── manifest.json    # 清单文件 (必须)
├── index.mjs        # 入口文件 (必须，与 manifest.entry.main 一致)
├── README.md        # 说明文档 (推荐)
└── schema.mjs       # 数据验证 (可选)
```

### 5.2 最小可运行插件

```
my-plugin/
├── manifest.json
└── index.mjs
```

**manifest.json**:

```json
{
  "manifestVersion": 1,
  "id": "com.example.minimal",
  "name": "Minimal Plugin",
  "version": "0.1.0",
  "category": "api",
  "platformId": "minimal",
  "source": "external",
  "runtime": "external-host",
  "entry": { "main": "index.mjs", "module": "esm" },
  "engines": { "pluginApi": "^1.0.0", "app": ">=2.3.0" },
  "capabilities": {
    "search": true,
    "songUrl": false,
    "songDetail": false,
    "lyric": false,
    "playlistDetail": false,
    "needsHydration": false,
    "supportsLyricFetch": false,
    "supportsUrlRefreshOnFailure": false
  },
  "permissions": {
    "network": { "domains": ["api.example.com"] },
    "storage": false
  }
}
```

**index.mjs**:

```javascript
export default {
  async create(ctx) {
    ctx.logger.info('Minimal plugin initialized')

    return {
      async search(input) {
        const { keyword, limit, page } = input
        const url = `https://api.example.com/search?q=${encodeURIComponent(keyword)}&limit=${limit}&page=${page}`

        const data = await ctx.http.get(url)

        return {
          list: data.songs.map(song => ({
            id: song.id,
            name: song.title,
            artists: [{ id: song.artist_id, name: song.artist_name }],
            album: { id: song.album_id, name: song.album_name, picUrl: song.cover },
            duration: song.duration_ms,
            mvid: 0,
            platform: ctx.platformId,
            originalId: song.id
          })),
          total: data.total
        }
      },

      async dispose() {
        ctx.logger.info('Minimal plugin disposed')
      }
    }
  }
}
```

### 5.3 完整音乐源插件示例

以网易云音乐的第三方插件形式为例，演示完整能力：

```
luo-music-netease/
├── manifest.json
├── index.mjs
├── normalize.mjs     # 数据标准化
├── schema.mjs        # 响应验证
└── README.md
```

**manifest.json**:

```json
{
  "manifestVersion": 1,
  "id": "com.luomusic.plugin.netease",
  "name": "Netease Music",
  "version": "1.0.0",
  "description": "网易云音乐第三方插件，提供搜索、播放、歌词等完整功能",
  "author": "Luo-Music Community",
  "category": "api",
  "platformId": "netease",
  "source": "external",
  "runtime": "external-host",
  "entry": { "main": "index.mjs", "module": "esm" },
  "engines": { "pluginApi": "^1.0.0", "app": ">=2.3.0" },
  "capabilities": {
    "search": true,
    "songUrl": true,
    "songDetail": true,
    "lyric": true,
    "playlistDetail": true,
    "needsHydration": true,
    "supportsLyricFetch": true,
    "supportsUrlRefreshOnFailure": true
  },
  "permissions": {
    "network": {
      "domains": ["music.163.com", "interface.music.163.com", "interface3.music.163.com"]
    },
    "storage": true
  },
  "contributions": {
    "settings": [
      {
        "key": "audioLevel",
        "type": "select",
        "label": "默认音质",
        "default": "standard",
        "options": [
          { "value": "standard", "label": "标准" },
          { "value": "higher", "label": "较高" },
          { "value": "exhigh", "label": "极高" },
          { "value": "lossless", "label": "无损" },
          { "value": "hires", "label": "Hi-Res" }
        ]
      },
      {
        "key": "verboseLog",
        "type": "boolean",
        "label": "详细日志",
        "default": false
      }
    ]
  }
}
```

**index.mjs**:

```javascript
import { normalizeSong, normalizePlaylist } from './normalize.mjs'

// API 基地址 (需要搭配 NeteaseCloudMusicApi 服务端)
const API_BASE = 'http://localhost:3000'

export default {
  async create(ctx) {
    const level = ctx.settings.audioLevel || 'standard'
    ctx.logger.info('Netease plugin initialized', { level })

    return {
      async search({ keyword, limit = 30, page = 1 }) {
        const offset = (page - 1) * limit
        const data = await ctx.http.get(`${API_BASE}/cloudsearch`, {
          keywords: keyword,
          type: 1,
          limit,
          offset
        })

        if (!data.result || !data.result.songs) {
          return { list: [], total: 0 }
        }

        return {
          list: data.result.songs.map(song => normalizeSong(song, ctx.platformId)),
          total: data.result.songCount || 0
        }
      },

      async getSongUrl({ id, options }) {
        const level = (typeof options === 'string' ? options : options?.level) || 'standard'

        try {
          const v1 = await ctx.http.get(`${API_BASE}/song/url/v1`, {
            id,
            level,
            timestamp: Date.now()
          })
          if (v1.data?.[0]?.url) return v1.data[0].url
        } catch {
          // 回退到旧接口
        }

        const legacy = await ctx.http.get(`${API_BASE}/song/url`, {
          id,
          timestamp: Date.now()
        })
        return legacy.data?.[0]?.url ?? null
      },

      async getSongDetail({ id }) {
        const data = await ctx.http.get(`${API_BASE}/song/detail`, {
          ids: String(id),
          timestamp: Date.now()
        })
        const song = data.songs?.[0]
        return song ? normalizeSong(song, ctx.platformId) : null
      },

      async getLyric({ id }) {
        const data = await ctx.http.get(`${API_BASE}/lyric`, {
          id,
          timestamp: Date.now()
        })

        return {
          lrc: data.lrc?.lyric || '',
          tlyric: typeof data.tlyric === 'string' ? data.tlyric : data.tlyric?.lyric || '',
          romalrc: typeof data.romalrc === 'string' ? data.romalrc : data.romalrc?.lyric || ''
        }
      },

      async getPlaylistDetail({ id }) {
        const data = await ctx.http.get(`${API_BASE}/playlist/detail`, { id })
        const playlist = data.playlist
        if (!playlist?.id) return null

        return normalizePlaylist(playlist, ctx.platformId)
      },

      async dispose() {
        ctx.logger.info('Netease plugin disposed')
      }
    }
  }
}
```

**normalize.mjs**:

```javascript
export function normalizeSong(song, platformId) {
  return {
    id: song.id || 0,
    name: song.name || '',
    artists: (song.ar || song.artists || []).map(ar => ({
      id: ar.id || 0,
      name: ar.name || ''
    })),
    album: {
      id: song.al?.id || song.album?.id || 0,
      name: song.al?.name || song.album?.name || '',
      picUrl: song.al?.picUrl || song.album?.picUrl || ''
    },
    duration: song.dt || song.duration || 0,
    mvid: song.mv || song.mvid || 0,
    platform: platformId,
    originalId: song.id || 0
  }
}

export function normalizePlaylist(playlist, platformId) {
  return {
    id: playlist.id,
    name: playlist.name,
    coverImgUrl: playlist.coverImgUrl || '',
    description: playlist.description,
    trackCount: playlist.trackCount,
    tracks: (playlist.tracks || []).map(track => normalizeSong(track, platformId))
  }
}
```

### 5.4 安装方式

1. 打开应用 → 侧边栏点击「插件」
2. 输入插件目录路径或点击「浏览」选择
3. 点击「安装」
4. 插件启用后即可在搜索栏的平台选择器中使用

---

## 6. 第一方插件规范

第一方插件随应用分发，无需用户安装。当前已支持把功能增强项作为 `category: "extension"` 的第一方插件显示在插件管理页。

### 6.1 当前实验性功能 → 插件迁移状态

| 实验性功能                 | 目标插件 ID             | 平台     | 类型     | 状态                       |
| -------------------------- | ----------------------- | -------- | -------- | -------------------------- |
| 波形可视化 (Waveform)      | `builtin.waveform`      | 全平台   | 功能增强 | 待迁移                     |
| Windows SMTC               | `builtin.smtc`          | Electron | 功能增强 | 已迁移到插件管理页「拓展」 |
| 滑动封面切歌 (Cover Swipe) | `builtin.cover-swipe`   | 全平台   | 功能增强 | 已迁移到插件管理页「拓展」 |
| 桌面歌词 (Desktop Lyric)   | `builtin.desktop-lyric` | Electron | 功能增强 | 待迁移                     |

当前已迁移的第一方拓展插件复用原有运行逻辑和持久化状态，用户只通过插件管理页启用 / 停用；设置面板不再显示对应实验开关。

### 6.2 第一方插件结构

```
plugins/built-in/
├── netease/           # 网易云 (音乐平台插件, 迁移为第三方参考)
│   ├── index.ts
│   ├── manifest.ts
│   └── schema.ts
├── qq/                # QQ 音乐 (音乐平台插件, 迁移为第三方参考)
│   ├── index.ts
│   ├── manifest.ts
│   └── schema.ts
├── waveform/          # 波形可视化 (功能增强插件)
│   ├── index.ts
│   └── manifest.ts
├── smtc/              # Windows SMTC (功能增强插件)
│   ├── index.ts
│   └── manifest.ts
├── cover-swipe/       # 滑动切歌 (功能增强插件)
│   ├── index.ts
│   └── manifest.ts
└── desktop-lyric/     # 桌面歌词 (功能增强插件)
    ├── index.ts
    └── manifest.ts
```

### 6.3 第一方插件 Manifest 模板

```typescript
import type { PluginManifest } from '../../../packages/plugin-sdk'

export const manifest = {
  manifestVersion: 1,
  id: 'builtin.waveform',
  name: 'Waveform Visualization',
  version: '1.0.0',
  description: '进度条波形可视化',
  category: 'extension',
  platformId: 'waveform',
  source: 'builtin',
  runtime: 'local',
  capabilities: {
    search: false,
    songUrl: false,
    songDetail: false,
    lyric: false,
    playlistDetail: false,
    needsHydration: false,
    supportsLyricFetch: false,
    supportsUrlRefreshOnFailure: false
  }
} satisfies PluginManifest

export default manifest
```

---

## 7. 安全模型

### 7.1 第三方插件隔离

```
┌──────────────────────────────────────────────────┐
│  主进程 (Main Process)                            │
│  ┌─────────────────────────────────────────────┐ │
│  │  PluginCatalog                               │ │
│  │  ┌───────────┐  ┌────────────────────────┐  │ │
│  │  │ Built-in   │  │ ExternalPluginHost     │  │ │
│  │  │ (local)    │  │ ┌────────────────────┐ │  │ │
│  │  │           │  │ │  Worker Thread      │ │  │ │
│  │  │  直接调用  │  │ │  ┌──────────────┐  │ │  │ │
│  │  │           │  │ │  │ 插件沙箱      │  │ │  │ │
│  │  │           │  │ │  │ - storage: 代理│  │ │  │ │
│  │  │           │  │ │  │ - http: 受限   │  │ │  │ │
│  │  │           │  │ │  │ - logger: 转发 │  │ │  │ │
│  │  │           │  │ │  └──────────────┘  │ │  │ │
│  │  │           │  │ └────────────────────┘ │  │ │
│  │  └───────────┘  └────────────────────────┘  │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 7.2 权限执行

| 权限       | 声明方式                      | 执行策略                                       |
| ---------- | ----------------------------- | ---------------------------------------------- |
| 网络访问   | `permissions.network.domains` | 未声明域名的请求在 Host 层被拒绝               |
| 持久化存储 | `permissions.storage`         | 未声明时 storage API 抛出异常                  |
| 设置读取   | 自动                          | 所有插件可读取自身声明的设置                   |
| 日志输出   | 自动                          | 所有插件可输出日志，但标签自动加上插件 ID 前缀 |

### 7.3 熔断器 (Circuit Breaker)

- 连续失败 5 次后自动触发熔断 (`circuit-tripped`)
- 熔断状态下所有方法调用直接返回错误
- 用户手动禁用再启用插件可重置熔断状态
- 诊断记录保留最近 100 条错误

---

## 8. 插件生命周期

```
安装 (Install)
  │  验证 manifest → 校验完整性 → 拷贝文件 → 创建状态记录
  ▼
加载 (Load)
  │  Built-in: 直接 import
  │  External: Worker 线程加载入口
  ▼
运行 (Running)
  │  方法调用 → 结果返回 → 状态更新
  │  失败计数 → 熔断判定
  ▼
卸载 (Unload)
  │  调用 dispose → 终止 Worker → 删除文件 → 清除状态
  ▼
完成 (Disposed)
```

### 8.1 方法调用超时

- 默认超时: 15 秒
- 超时后 Promise reject，调用方收到超时错误
- 超时计入连续失败次数

---

## 9. 版本兼容性

### 9.1 Manifest 版本

当前 `manifestVersion` 为 `1`。当清单格式发生不兼容变更时递增。

### 9.2 引擎版本

第三方插件应在 `engines` 中声明兼容范围：

```json
{
  "engines": {
    "pluginApi": "^1.0.0",
    "app": ">=2.3.0"
  }
}
```

- `pluginApi`: 对应 `packages/plugin-sdk` 的版本
- `app`: 对应 Luo-Music 应用的版本

---

## 10. 调试与诊断

### 10.1 日志

第三方插件通过 `ctx.logger` 输出的日志会：

- 自动添加 `[plugin:{platformId}]` 前缀
- 转发到主进程的日志系统
- 在开发工具中可见

### 10.2 设置

插件的设置 UI 自动生成，由 `contributions.settings` 定义。支持三种类型：

| 类型      | 渲染       | 值类型                            |
| --------- | ---------- | --------------------------------- |
| `boolean` | 复选框     | `boolean`                         |
| `text`    | 文本输入框 | `string`                          |
| `select`  | 下拉选择   | `string` (来自 `options[].value`) |

### 10.3 主题资源

主题插件通过 `contributions.themeResources` 声明一个或多个主题资源：

| 字段           | 类型                     | 说明                                                  |
| -------------- | ------------------------ | ----------------------------------------------------- |
| `id`           | `string`                 | 主题资源唯一 ID，建议包含插件 ID 前缀                 |
| `label`        | `string`                 | 设置面板中展示的渲染风格名称                          |
| `renderStyle`  | `string`                 | 写入 `documentElement.dataset.renderStyle` 的风格标识 |
| `description`  | `string`                 | 可选说明                                              |
| `cssVariables` | `Record<string, string>` | 可选 CSS 变量覆盖，仅接受 `--*` 变量名                |
| `cssFile`      | `string`                 | 可选主题 CSS 文件路径，相对插件目录                   |
| `cssText`      | `string`                 | 可选主题 CSS，仅在该 `renderStyle` 激活时挂载         |

启用主题插件后，对应 `renderStyle` 会出现在界面设置的「渲染风格」选项中。禁用或卸载当前渲染风格所属插件时，宿主会回退到 `classic`。

主题 CSS 推荐总是用当前渲染风格做前缀，避免意外影响其他风格：

```css
:root[data-render-style='example.ocean'] [data-ui='player'] {
  border-radius: 24px;
}
```

宿主会在根节点暴露以下属性，方便主题定位：

| 属性                       | 说明                              |
| -------------------------- | --------------------------------- |
| `data-render-style`        | 当前渲染风格 ID                   |
| `data-theme-resource-pack` | 当前主题资源 ID，经典风格为空     |
| `data-theme-plugin`        | 当前主题来源插件 ID，经典风格为空 |

当前稳定的 UI 标记包括：

| 选择器                                | 说明                |
| ------------------------------------- | ------------------- |
| `[data-ui='home-window']`             | 应用主窗口          |
| `[data-ui='home-shell']`              | 主布局网格          |
| `[data-ui='titlebar']`                | 顶部栏              |
| `[data-ui='title-nav']`               | 顶部返回 / 前进导航 |
| `[data-ui='title-brand']`             | 顶部品牌区域        |
| `[data-ui='search-bar']`              | 搜索栏              |
| `[data-ui='window-controls']`         | 头像与窗口控制区域  |
| `[data-ui='window-control-button']`   | 窗口控制按钮        |
| `[data-ui='user-avatar']`             | 顶部头像入口容器    |
| `[data-ui='user-avatar-trigger']`     | 顶部头像触发按钮    |
| `[data-ui='user-avatar-image']`       | 顶部头像图片        |
| `[data-ui='user-avatar-placeholder']` | 顶部头像占位图标    |
| `[data-ui='sidebar']`                 | 侧边栏              |
| `[data-ui='sidebar-link']`            | 侧边栏导航项        |
| `[data-ui='playlist-card']`           | 侧边栏歌单项        |
| `[data-ui='sidebar-footer']`          | 侧边栏底部区域      |
| `[data-ui='player-panel']`            | 独立播放器面板      |
| `[data-ui='player']`                  | 播放器控件          |
| `[data-ui='player-left']`             | 封面与歌曲信息区域  |
| `[data-ui='player-cover-swipe']`      | 可滑动封面区域      |
| `[data-ui='player-cover']`            | 播放封面            |
| `[data-ui='player-track']`            | 歌曲标题与歌手信息  |
| `[data-ui='player-progress']`         | 播放进度区          |
| `[data-ui='player-controls']`         | 播放控制按钮组      |
| `[data-ui='player-play-button']`      | 主播放按钮          |
| `[data-ui='player-volume']`           | 音量控制区          |
| `[data-ui='workspace-panel']`         | 工作区宿主面板      |
| `[data-ui='workspace']`               | 歌词 / 播放列表区域 |
| `[data-ui='tabbar']`                  | 工作区标签栏        |
| `[data-ui='tab']`                     | 工作区标签按钮      |
| `[data-ui='lyrics']`                  | 歌词容器            |
| `[data-ui='lyrics-scroll']`           | 歌词滚动区域        |
| `[data-ui='lyrics-list']`             | 歌词列表            |
| `[data-ui='lyric-line']`              | 单行歌词            |
| `[data-ui='docked-player-bar']`       | 底部吸附播放器      |
| `[data-ui='statusbar']`               | 非吸附状态栏        |

为避免第三方主题通过 CSS 触发隐式网络请求，宿主会拒绝挂载包含 `@import` 或远程 `url(http/https/javascript)` 的 `cssText`。通过 `cssFile` 读取的内容同样会在渲染进程按这条规则检查。

### 10.4 存储

- `ctx.storage` 对第三方插件为异步代理 (通过 Worker 消息传递)
- 数据持久化在主进程的 `electron-store` 中
- 命名空间隔离：每个插件只能访问自己的数据

---

## 11. 迁移路线

### 阶段一: 音乐平台插件剥离 (当前)

1. 将 `plugins/built-in/netease` 和 `plugins/built-in/qq` 改造为独立可安装的第三方插件格式
2. 保留 `plugins/built-in/` 中的 TypeScript 源码作为开发参考
3. 在 `plugins/examples/` 中提供完整的网易云音乐第三方插件示例
4. 更新 `packages/plugin-sdk` 类型定义以覆盖所有用例

### 阶段二: 实验性功能迁移

1. 波形可视化 → `builtin.waveform`
2. Windows SMTC → `builtin.smtc`（已完成）
3. 滑动切歌 → `builtin.cover-swipe`（已完成）
4. 桌面歌词 → `builtin.desktop-lyric`

每个功能插件化后：

- 从设置面板的「实验功能」区移除
- 在插件管理面板中显示为第一方插件
- 可独立启用/禁用

### 阶段三: 功能增强插件 API

1. 定义功能增强插件的 UI 贡献协议 (注册组件到指定插槽)
2. 定义生命周期钩子 (`onActivate`, `onDeactivate`, `onSettingsChange`)
3. 支持第三方功能增强插件

---

## 附录 A: 完整第三方插件模板

```
my-music-plugin/
├── manifest.json
├── index.mjs
├── normalize.mjs
├── schema.mjs
├── README.md
└── LICENSE
```

**README.md 模板**:

````markdown
# My Music Plugin

Luo-Music 第三方音乐源插件。

## 安装

1. 下载或克隆此仓库
2. 在 Luo-Music 中打开「插件」面板
3. 点击「浏览」选择此目录
4. 点击「安装」

## 功能

- 搜索歌曲
- 获取播放地址
- 获取歌词 (原文/翻译/音译)
- 查看歌单详情

## 配置

| 设置项     | 类型    | 默认值   | 说明         |
| ---------- | ------- | -------- | ------------ |
| audioLevel | select  | standard | 默认音质     |
| verboseLog | boolean | false    | 详细日志模式 |

## 前置依赖

- 需要运行 XXX API 服务 (端口 3000)

## 开发

```bash
# 安装 SDK 类型
npm install @luo-music/plugin-sdk --save-dev
```
````

## 许可证

MIT

```

```
