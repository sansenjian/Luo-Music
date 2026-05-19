# Luo-Music 插件统一接口与内部标准模型

> 状态: 设计草案
> 最后更新: 2026-04-27

> 当前落地进度: 已完成插件存储命名空间、`ctx.secrets`、入站标准化、播放 URL 刷新竞态保护，以及 SMTC / 滑动封面切歌第一方拓展插件入口；SMTC 已收口到 `useSmtcExtension()` 启动器，主进程会按插件开关启用 / 禁用 Chromium MediaSession features，停用时会 relaunch 使系统媒体面板彻底消失；完整平台登录 UI 插件化仍是后续阶段。

## 1. 目标

插件系统需要提供稳定的统一接口，供音乐源、平台登录、功能增强、UI 扩展和后续能力复用。项目内部不应深度绑定某个音乐平台、插件实现、Electron 能力或 Store 结构。

Luo-Music 本体的定位是本地播放器。宿主只负责本地播放、媒体库、插件编排、统一 UI 容器和安全边界；在线音乐平台的登录、会话、Cookie / token、账号资料和平台私有协议都属于插件职责。

本设计的核心原则是:

- 项目内部只流转标准模型。
- 插件负责把外部平台数据清洗成标准模型。
- 插件负责实现外部平台登录流程，宿主只提供统一调用入口和受控存储。
- 框架负责边界校验、默认值、旧字段兼容和安全兜底。
- 第一优先级是可用性稳定: 不串平台、不覆盖会话、不留下轮询、不用过期请求改写当前播放状态。
- 业务模块只依赖 `services.xxx()`、`src/platform` 合同和标准模型，不直接依赖插件实现。

框架可以处理少量小错误，例如 `null` 字段、旧字段名、缺省字符串，但这不是框架的主要责任。外部平台响应结构的解析、修正、登录态识别和会话刷新应在插件内完成。

插件管理页按 manifest `category` 自适应分为三类:

| category    | 页面分类 | 典型职责                                         |
| ----------- | -------- | ------------------------------------------------ |
| `api`       | API      | 平台 API 功能，例如搜索、播放、歌词、登录        |
| `extension` | 拓展     | 播放器优化能力，例如播放控制、系统集成、体验增强 |
| `theme`     | 主题     | UI 优化能力，例如主题、外观、布局                |

未声明 `category` 的旧插件按 `api` 处理，确保现有平台 API 插件继续显示在默认分类。

## 2. 分层边界

插件数据进入项目时必须经过统一入站边界:

```text
外部平台 API
  -> 平台登录 / 会话 / 数据接口
  -> 插件适配与清洗
  -> Plugin SDK 标准返回
  -> 入站边界校验与轻量 normalize
  -> 项目内部标准模型
  -> 播放器 / 歌词 / UI / 缓存 / IPC
```

登录也必须经过同一条边界。宿主不直接调用网易云、QQ 音乐或其它平台的登录 API，也不直接解析平台 Cookie / token。

当前可作为入站边界的模块:

- `ExternalAdapterProxy`: 渲染进程调用外部插件的音乐源能力。
- `PluginAdapterBridge`: 第一方或本地插件接入音乐平台适配器。
- `PluginCatalog` / `ExternalPluginHost`: 主进程插件加载、调用、权限和生命周期管理。
- `services.plugins()`: 渲染端统一插件服务入口。

这些边界负责把插件输出转换成内部标准模型。边界之外的业务代码不再散落平台字段兼容逻辑。

## 3. 标准数据模型

标准模型是项目内部流动的数据模板。插件可以通过 SDK 类型直接引用这些模型，业务代码也只依赖这些模型。

入站边界的 normalize 必须轻量、可预测，并遵守下面规则:

- `id`、`originalId`、`mvid`、`mediaId` 只接受 `string | number`。如果平台返回 boolean、object、array、`null` 或 `undefined`，边界应拒绝该条记录或返回 `PARSE_ERROR`，不做隐式字符串化。
- 文本字段缺省值统一为空字符串，例如 `name`、`album.name`、`album.picUrl`。
- 数组字段缺省值统一为空数组，例如 `artists`、`tracks`。
- `duration` 单位统一为毫秒，必须是非负整数。插件应返回毫秒；兼容旧插件或已知秒单位平台时，入站边界必须通过明确的适配规则转换为毫秒，不能凭数值大小猜测。非法值统一降级为 `0`。
- `platform` 必须等于插件声明的 `platformId`。本地音乐统一使用 `platform = 'local'`，由宿主核心本地音乐能力提供，不作为第三方在线平台插件。
- 入站边界可以补默认值和兼容旧字段，但不能猜测平台协议含义，例如不能从任意私有字段推导播放 URL、登录态或授权 token。

### 3.1 StandardArtist

```ts
export interface StandardArtist {
  id: string | number
  name: string
}
```

### 3.2 StandardAlbum

```ts
export interface StandardAlbum {
  id: string | number
  name: string
  picUrl: string
}
```

### 3.3 StandardSong

```ts
export interface StandardSong {
  id: string | number
  name: string
  artists: StandardArtist[]
  album: StandardAlbum
  duration: number
  mvid: string | number
  platform: string
  originalId: string | number
  extra?: Record<string, unknown>
  url?: string
  mediaId?: string | number
  unavailable?: boolean
  errorMessage?: string | null
}
```

规则:

- `platform` 必须等于插件声明的 `platformId`。
- `originalId` 保留平台原始歌曲 ID。
- `extra` 只放确实无法标准化的平台私有数据。
- `url` 和 `mediaId` 如果影响播放刷新流程，应由插件明确返回，不应让业务层猜测。

### 3.4 StandardPlaylist

```ts
export interface StandardPlaylist {
  id: string | number
  name: string
  coverImgUrl: string
  description?: string
  trackCount?: number
  tracks: StandardSong[]
}
```

规则:

- `tracks` 必须是已标准化的 `StandardSong[]`。
- 插件可以先返回不含播放 URL 的歌曲，但必须保证歌曲 ID、平台和必要元数据可用于后续 `getSongUrl`。
- 大歌单不要求一次性深度 normalize 全量歌曲。列表页可以先 normalize 可见区域和播放即将使用的条目，剩余条目按需转换，避免 500 首以上歌单导入时阻塞 UI。

### 3.5 StandardSongUrl

```ts
export interface StandardSongUrl {
  url: string | null
  mediaId?: string | number
  expiresAt?: number
  level?: 'standard' | 'higher' | 'exhigh' | 'lossless' | 'hires' | 'unknown'
  bitrate?: number
}
```

规则:

- `url` 为 `null` 表示当前歌曲不可播放或插件无法取得播放地址。
- 短期有效 URL 应尽量提供 `expiresAt`，供播放器判断是否需要刷新。
- 旧版 `getSongUrl` 返回 `string | null` 时，由适配层转换为 `{ url }`。
- `level` 无法准确判断时返回 `unknown` 或省略，不要硬映射到错误音质。
- `StandardSong.url` 只作为搜索结果或详情中的快速缓存。正式播放、刷新和失败重试必须以 `getSongUrl()` 返回的 `StandardSongUrl` 为准；两者同时存在时，`StandardSongUrl` 优先。
- `mediaId` 表示平台用于刷新播放地址的媒体文件标识，不是授权 token。若某平台的字段包含敏感授权信息，应放入 `ctx.secrets`，不要放进 `mediaId` 或 `extra`。

### 3.6 StandardLyric

```ts
export interface StandardLyric {
  lrc: string
  tlyric: string
  romalrc: string
}
```

规则:

- `lrc` 是原文 LRC。
- `tlyric` 是翻译 LRC。
- `romalrc` 是音译或罗马音 LRC。
- 三个字段必须始终是字符串，没有内容时返回空字符串。
- 插件应负责把平台原始歌词结构转换为这个模板。

框架允许兼容少量旧字段，例如 `rlyric` -> `romalrc`，但插件新实现不应依赖这种兜底。

结构化逐行翻译暂不进入 v1 标准模型。平台如果只提供逐行动态翻译，插件应先转换为 `tlyric` LRC 字符串；后续确实需要保留富结构时，再通过 `StandardLyricV2` 增量加入。

### 3.7 StandardAuthState

登录态是平台能力，不是 Luo-Music 本体账号体系。宿主只需要展示标准化状态，并用它决定是否提示用户登录。

```ts
export interface StandardAccountProfile {
  id: string | number
  nickname: string
  avatarUrl?: string
  homepageUrl?: string
  extra?: Record<string, unknown>
}

export interface StandardAuthState {
  platform: string
  status: 'anonymous' | 'pending' | 'authenticated' | 'expired' | 'error'
  account?: StandardAccountProfile
  expiresAt?: number
  message?: string
}

export interface StandardLoginChallenge {
  challengeId: string
  type: 'qr' | 'browser' | 'form' | 'none'
  title?: string
  statusText?: string
  qrImageUrl?: string
  authorizeUrl?: string
  expiresAt?: number
  pollIntervalMs?: number
  canRefresh?: boolean
  cancelable?: boolean
  helpUrl?: string
  fields?: StandardLoginField[]
}

export interface StandardLoginField {
  key: string
  label: string
  type: 'text' | 'password' | 'otp'
  required?: boolean
}
```

规则:

- `platform` 必须等于插件声明的 `platformId`。
- `StandardAuthState` 不包含原始 Cookie、refresh token、bearer token 或平台私有密钥。
- 原始会话凭据只允许保存在插件自己的 `ctx.secrets` 命名空间，宿主按 opaque 数据托管，不解析、不拼接、不跨插件共享。
- `StandardLoginChallenge` 只描述宿主如何展示统一登录 UI；二维码生成、授权 URL、轮询、表单提交和成功判断都由插件实现。
- `password` 和 `otp` 字段值是敏感输入，只能在一次 `submitLogin()` 调用中传递给插件，不允许进入日志、诊断记录、普通 storage 或 renderer 持久化状态。
- 多个平台可以同时处于 `authenticated`。默认搜索 / 播放平台属于用户偏好设置，不放入 `StandardAuthState`，避免把“当前选择”误写成平台会话属性。

### 3.8 账号与资料库标准模型

账号资料、喜欢歌曲、用户歌单和歌单歌曲属于通用资料库能力，不属于某个具体音乐平台的专属接口。插件应该返回框架内部可直接消费的标准模型；宿主的归一化只做保护性兜底，不作为插件返回原始响应的长期入口。

```ts
export interface StandardPlaylistSummary {
  id: string | number
  name: string
  coverImgUrl?: string
  description?: string
  trackCount?: number
  subscribed?: boolean
  creator?: StandardAccountProfile
  extra?: Record<string, unknown>
}

export interface StandardPageInfo {
  limit: number
  offset: number
  total?: number
  hasMore: boolean
}

export interface StandardSongPage {
  list: PluginSong[]
  page: StandardPageInfo
}

export interface StandardPlaylistPage {
  list: StandardPlaylistSummary[]
  page: StandardPageInfo
}
```

方法名:

- `account.getProfile`
- `library.getLikedSongs`
- `library.getPlaylists`
- `library.getPlaylistTracks`

业务层必须通过 `services.plugins().account` / `services.plugins().library` facade 调用这些能力。`src/services/pluginService.ts` 是允许直接使用插件方法名字符串的边界；组件、composable 和 store 不应直接调用 `pluginService.call(platformId, 'account.xxx' | 'library.xxx')`。

## 4. 歌词统一流转

歌词是最容易出现平台差异的能力，应作为内部标准模型的第一批落地点。

推荐流转:

```text
插件 getLyric()
  -> StandardLyric
  -> 边界校验
  -> LyricDocument
  -> LyricLine[]
  -> LyricEngine / LyricDisplay / Desktop Lyric
```

职责划分:

| 责任                             | 插件 | 框架 |
| -------------------------------- | ---- | ---- |
| 调用平台 API                     | 是   | 否   |
| 解析平台私有字段                 | 是   | 否   |
| 输出 `lrc/tlyric/romalrc` 字符串 | 是   | 校验 |
| 兼容少量旧字段名                 | 否   | 是   |
| 解析 LRC 时间轴                  | 否   | 是   |
| 生成 `LyricLine[]`               | 否   | 是   |
| 桌面歌词和页面展示               | 否   | 是   |

这样可以保证所有歌词展示、IPC 快照和播放器同步都使用同一种内部结构。

## 5. 登录与会话边界

登录功能必须在插件内部实现。原因是每个音乐平台的授权方式、Cookie 结构、二维码轮询协议、登录失效信号和账号资料接口都不同；如果宿主承载这些逻辑，本地播放器会重新绑定具体平台，插件边界也会失效。

推荐流转:

```text
用户点击某个平台登录
  -> getLoginCapablePlatformDescriptors() 发现可登录平台
  -> services.plugins().auth.startLogin(platformId)
  -> 插件调用平台登录接口
  -> 返回 StandardLoginChallenge
  -> 宿主展示统一登录容器
  -> services.plugins().auth.pollLogin(platformId, challengeId)
     或 services.plugins().auth.submitLogin(platformId, challengeId, values)
  -> 插件保存 Cookie / token 到 ctx.secrets
  -> 返回 StandardAuthState
  -> 宿主更新平台登录摘要和 UI
```

当前落地策略:

- 登录入口像搜索源一样由平台描述符驱动。启用的插件只要声明 `capabilities.auth.login = true`，就会自动出现在头像菜单的登录选项中；新增一个支持登录的平台 API 插件，不需要再改 `UserAvatar.vue` 的固定菜单。
- `getLoginCapablePlatformDescriptors()` / `getLoginPlatformOptions()` 是登录入口对应的发现 API，规则与 `getSearchablePlatformDescriptors()` / `getSearchPlatformOptions()` 保持一致。
- `services.plugins().auth` 已作为宿主认证 facade 落地，负责调用插件 `auth.getState` / `auth.startLogin` / `auth.pollLogin` / `auth.submitLogin` / `auth.cancelLogin` / `auth.importSession` / `auth.refresh` / `auth.logout` 并把登录态归一化为宿主内部 `PlatformAuthState`。业务 UI 只消费 facade 返回的标准挑战和状态摘要，不直接解析插件返回值或平台 Cookie。
- `auth.importSession` 是过渡期的窄迁移入口，用于把宿主旧登录链路中已经存在的标准会话凭据交还给插件处理。宿主传入 `StandardImportedAuthSession`，插件自行决定如何验证、刷新账号摘要并写入自己的 `ctx.secrets`；renderer 不暴露通用 secrets 读写能力。
- `PluginLoginModal.vue` 作为通用插件登录容器，支持 `auth.startLogin`、`auth.pollLogin` 和关闭时的 `auth.cancelLogin`。网易云 / QQ 插件已提供 `auth.*` handler；头像菜单暂时仍把它们路由到专属弹窗作为兼容适配，并在插件状态匿名且声明 `capabilities.auth.importSession = true` 时把 `userStore.cookie` / `userStore.qqCookie` 转换为标准导入会话。
- 头像菜单的登录入口必须通过 `resolvePlatformLoginRoute()` 选择通用插件登录或 legacy 登录桥。平台特例只能留在这个路由策略里，组件层不要继续散落 `platform.id === 'netease'` / `platform.id === 'qq'` 判断。
- 内置第三方插件 manifest 增加 `auth` 能力时必须 bump 插件版本，确保 `ensureBundledPlugins()` 能自动刷新已安装插件。过渡期内，已安装但尚未刷新 manifest 的网易云 / QQ 插件仍通过兼容桥显示登录入口，避免用户看到“暂无可登录平台”。

建议的认证方法:

```ts
export type PluginAuthMethodName =
  | 'auth.getState'
  | 'auth.startLogin'
  | 'auth.pollLogin'
  | 'auth.submitLogin'
  | 'auth.cancelLogin'
  | 'auth.importSession'
  | 'auth.refresh'
  | 'auth.logout'

export interface StandardImportedAuthSession {
  credential: {
    type: 'cookie' | 'token' | 'opaque'
    value: string
  }
  account?: StandardAccountProfile
  expiresAt?: number
  extra?: Record<string, unknown>
}

export interface PluginAuthFacade {
  getState(platformId: string): Promise<StandardAuthState>
  startLogin(
    platformId: string,
    options?: { mode?: 'qr' | 'browser' | 'form' }
  ): Promise<StandardLoginChallenge>
  pollLogin(platformId: string, challengeId: string): Promise<StandardAuthState>
  submitLogin(
    platformId: string,
    challengeId: string,
    values: Record<string, string>
  ): Promise<StandardAuthState>
  cancelLogin(platformId: string, challengeId: string): Promise<void>
  importSession(
    platformId: string,
    session: StandardImportedAuthSession
  ): Promise<StandardAuthState>
  refresh(platformId: string): Promise<StandardAuthState>
  logout(platformId: string): Promise<StandardAuthState>
}
```

职责划分:

| 责任                                   | 插件                      | 宿主               |
| -------------------------------------- | ------------------------- | ------------------ |
| 调用平台登录 API                       | 是                        | 否                 |
| 生成二维码、授权 URL 或表单字段        | 是                        | 展示标准描述       |
| 轮询扫码状态、提交验证码、判断登录成功 | 是                        | 调用统一接口       |
| 取消登录挑战和轮询                     | 停止平台侧会话            | 关闭 UI 时主动调用 |
| 解析和刷新 Cookie / token              | 是                        | 否                 |
| 持久化平台会话凭据                     | 通过 `ctx.secrets`        | 加密 / opaque 托管 |
| 展示登录入口、状态、头像和昵称         | 返回标准状态              | 是                 |
| 处理登录过期提示                       | 返回 `expired` 或标准错误 | 是                 |
| 登出和清理平台会话                     | 是                        | 调用统一接口       |

### 5.1 凭据存储模型

插件化后的 Cookie 保存方式不应继续复用普通设置存储。推荐把插件存储拆成两类:

```ts
export interface PluginStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  set<T = unknown>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  clear(): Promise<void>
}

export interface PluginSecretStore {
  get<T = unknown>(key: string): Promise<T | undefined>
  set<T = unknown>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  clear(): Promise<void>
}

export interface PluginContext {
  platformId: string
  settings: Readonly<Record<string, unknown>>
  storage: PluginStorage
  secrets: PluginSecretStore
  http: RestrictedHttpClient
  logger: PluginLogger
}
```

职责:

- `ctx.storage`: 保存插件配置、普通缓存和非敏感状态，例如默认音质、功能开关、分页游标。
- `ctx.secrets`: 保存 Cookie、token、refresh token、csrf token、设备 ID 等平台会话凭据。
- `userStore`: 只保存昵称、头像、是否已登录、当前平台等展示摘要，不保存真实 Cookie / token。
- `PluginStorage` 的命名空间固定为 `plugin:<pluginId>:storage`。
- `PluginSecretStore` 的命名空间固定为 `plugin:<pluginId>:secrets`。不能使用 `platformId` 作为命名空间主键，因为不同作者可能提供同一个平台的替代插件，使用 `platformId` 会导致 Cookie 和缓存互相覆盖。
- 加密上下文必须包含 `platformId` 和插件 ID。即使底层使用同一个系统凭据能力，也要保证一个插件无法通过 key 猜测读取另一个插件的 secrets。

Electron 端实现建议:

1. 第一阶段先提供独立的 `ctx.secrets` API，即使底层仍临时使用 `electron-store`，也要和普通 `storage` 分离。
2. 第二阶段使用 Electron `safeStorage` 或系统凭据能力加密落盘。
3. 第三阶段为 `ctx.http`、插件日志和诊断记录增加 Cookie / token 脱敏。
4. 第四阶段在插件安装和启用时展示权限: “该插件会保存平台登录凭据”。

限制:

- 第三方音乐源插件只要实现登录，就必然能接触它所属平台的会话凭据。宿主不能把凭据完全隐藏给该插件。
- 宿主能做的是加密落盘、命名空间隔离、权限提示、域名限制、日志脱敏、卸载清理和调用熔断。
- 宿主不应把 `ctx.secrets` 暴露给 renderer，也不应提供跨插件读取凭据的接口。

实现约束:

- `LoginModal.vue`、`QQLoginModal.vue` 这类平台专属登录 UI 不应继续作为宿主核心能力；迁移目标是统一登录容器 + 插件返回的 `StandardLoginChallenge`。
- `userStore` 不应长期保存平台 Cookie。它最多缓存 `StandardAuthState.account` 这类展示摘要，真实会话凭据留在 `ctx.secrets`。
- `src/api/user.ts`、`src/api/qqmusic.ts` 中的平台登录请求应逐步迁入对应音乐平台插件。
- 音乐能力调用发现登录失效时，插件应返回标准错误或 `StandardAuthState.status = 'expired'`，由宿主统一提示重新登录。
- 插件不得持久化用户输入的明文密码或一次性验证码。确需保存长期凭据时，只能保存平台返回的 Cookie / token 到 `ctx.secrets`。
- 宿主必须对 `password`、`otp`、Cookie、token、authorization、set-cookie 等字段做日志和诊断脱敏。
- `StandardLoginChallenge.cancelable !== false` 时，用户关闭登录窗口必须调用 `cancelLogin()`。插件禁用、卸载、页面退出或登录窗口销毁时，宿主也必须取消该插件所有未完成 challenge，避免僵尸轮询回写状态。

## 6. 插件能力与贡献点

现有音乐源能力继续保留:

- `search`
- `getSongUrl`
- `getSongDetail`
- `getLyric`
- `getPlaylistDetail`

为了让登录菜单可用优先落地，v1 `MusicPluginCapabilities` 已允许可选 `auth` 分组:

```ts
export interface MusicPluginCapabilities {
  search: boolean
  songUrl: boolean
  songDetail: boolean
  lyric: boolean
  playlistDetail: boolean
  needsHydration: boolean
  supportsLyricFetch: boolean
  supportsUrlRefreshOnFailure: boolean
  auth?: {
    login?: boolean
    logout?: boolean
    refresh?: boolean
    profile?: boolean
    preferredMode?: 'qr' | 'browser' | 'form'
    modes?: Array<'qr' | 'browser' | 'form'>
  }
}
```

后续扩展能力通过统一贡献点注册，而不是在业务代码中硬编码插件逻辑。

建议的能力分组:

```ts
export interface PluginCapabilityMap {
  music?: {
    search?: boolean
    songUrl?: boolean
    songDetail?: boolean
    lyric?: boolean
    playlistDetail?: boolean
    urlRefresh?: boolean
  }
  auth?: {
    login?: boolean
    logout?: boolean
    refresh?: boolean
    profile?: boolean
    preferredMode?: 'qr' | 'browser' | 'form'
    modes?: Array<'qr' | 'browser' | 'form'>
  }
  commands?: boolean
  ui?: boolean
  player?: boolean
  storage?: boolean
  network?: {
    domains: string[]
  }
  secrets?: boolean
}
```

建议的贡献点:

```ts
export type PluginContribution =
  | PluginSettingsContribution
  | PluginAuthContribution
  | PluginCommandContribution
  | PluginMenuContribution
  | PluginPanelContribution
  | PluginPlayerHookContribution

export interface PluginAuthContribution {
  preferredMode?: 'qr' | 'browser' | 'form'
  modes: Array<'qr' | 'browser' | 'form'>
}
```

说明:

- `settings`: 插件设置项，由框架生成 UI。
- `auth`: 平台登录入口、登录模式和账号状态展示描述。多个模式并存时，宿主默认使用 `preferredMode`；用户手动切换时通过 `startLogin(..., { mode })` 指定。
- `secrets`: 插件是否需要保存平台登录凭据；需要时必须在 manifest 权限中声明。
- `commands`: 插件命令，例如刷新、同步、导入。
- `menus`: 菜单入口，只绑定命令，不直接执行 UI 逻辑。
- `panels`: 声明式面板扩展。
- `playerHooks`: 播放器生命周期钩子，例如播放前、URL 失效、播放失败。

### 6.1 受限网络访问

第三方插件访问网络只能通过宿主提供的 `ctx.http`。`ExternalPluginHost` 不应向插件暴露原生 `fetch`、`XMLHttpRequest`、Node `http` / `https`、WebSocket 或任意可绕过白名单的网络能力。

```ts
export interface RestrictedHttpRequestOptions {
  headers?: Record<string, string>
  timeoutMs?: number
}

export interface RestrictedHttpClient {
  get<T = unknown>(
    url: string,
    params?: Record<string, unknown>,
    options?: RestrictedHttpRequestOptions
  ): Promise<T>
  post<T = unknown>(url: string, body?: unknown, options?: RestrictedHttpRequestOptions): Promise<T>
}
```

执行规则:

- 请求域名必须命中 manifest `permissions.network.domains`，未声明时拒绝。
- 域名匹配只看标准化后的 hostname，不允许通过重定向、IP 字面量、混淆域名或自定义协议绕过。
- 默认超时由宿主控制，插件可以通过 `timeoutMs` 申请更短超时，但不能无限等待。
- `headers` 允许插件显式传入 Cookie / authorization，但日志、错误对象和诊断记录必须脱敏。
- built-in / first-party 插件可以在可信路径中使用更高权限，但仍应优先走 `ctx.http`，方便审计和迁移到第三方隔离模型。

### 6.2 标准错误模型

插件方法不应让业务层依赖错误字符串。统一错误至少包含 `code`、`message` 和可选 `retryable`:

```ts
export type PluginErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'AUTH_DENIED'
  | 'LOGIN_CHALLENGE_EXPIRED'
  | 'LOGIN_POLLING_TIMEOUT'
  | 'PARSE_ERROR'
  | 'UNSUPPORTED_OPERATION'
  | 'PLUGIN_TIMEOUT'
  | 'PLUGIN_CRASHED'

export interface PluginCallError {
  code: PluginErrorCode
  message: string
  platformId: string
  retryable?: boolean
  cause?: unknown
}
```

规则:

- 登录失效必须返回 `AUTH_EXPIRED` 或 `AUTH_REQUIRED`，宿主据此显示统一登录入口。
- 平台响应结构异常返回 `PARSE_ERROR`，边界记录诊断但不把原始敏感响应暴露给 UI。
- 插件崩溃、超时、连续失败由宿主包装为 `PLUGIN_CRASHED` / `PLUGIN_TIMEOUT`，并进入熔断统计。

### 6.3 播放器 Hook 边界

`PluginPlayerHookContribution` 只允许声明受控 hook，不允许直接拿播放器实例。

```ts
export type PluginPlayerHookName =
  | 'beforePlay'
  | 'beforeResolveUrl'
  | 'onUrlExpired'
  | 'onPlayError'
  | 'afterTrackChanged'

export interface PluginPlayerHookResult {
  allow?: boolean
  replacementUrl?: StandardSongUrl
  message?: string
}
```

规则:

- `beforePlay` 可以返回 `allow: false` 阻止播放，并给出标准提示。
- `beforeResolveUrl` / `onUrlExpired` 可以返回 `replacementUrl`，但必须仍是 `StandardSongUrl`。
- 所有 hook 都要有超时，超时后按未提供结果处理，不能阻塞播放器主流程。
- 播放 URL 刷新必须带请求代号，例如 `playbackVersion` 或 `{ platform, originalId, mediaId }` 快照。刷新响应回来时，若当前播放歌曲已变化，必须丢弃结果，不能替换当前歌曲 URL。

## 7. 第三方 UI 插件边界

第三方 UI 插件可以开放，但必须走声明式协议。

v1 不允许第三方 UI 插件把任意 Vue 组件、ESM 代码或 npm 包直接加载到 renderer。可接受的模式是:

- built-in / first-party UI 插件在可信代码路径中运行，接受代码审查。
- third-party UI 插件只提交声明式贡献，例如设置项、菜单、命令、受控面板 schema。
- 如果未来开放第三方自定义 UI 代码，必须放入独立渲染沙箱，例如 iframe / webview / 独立窗口，并通过序列化消息协议访问宿主能力。

允许:

- 注册设置项。
- 注册平台登录入口或授权面板描述。
- 注册命令。
- 注册菜单入口。
- 注册受控面板或受控渲染描述。
- 通过 `services.plugins()` 与插件宿主通信。

禁止:

- 直接 import `src/store/*`。
- 直接访问 Electron、Node、文件系统或主进程对象。
- 直接拿到播放器内部实例。
- 直接注入任意 Vue 组件到应用运行时。
- 直接读写 `userStore` 中的平台登录字段。
- 绕过 manifest 权限声明访问网络或持久化存储。
- 在 renderer 中动态 import 第三方 UI 代码。

需要访问播放器能力时，只能通过稳定 facade:

```ts
export interface PluginPlayerFacade {
  getState(): Promise<PluginPlayerState>
  playNext(): Promise<void>
  playPrevious(): Promise<void>
  refreshCurrentUrl(): Promise<void>
  registerHook(hook: PluginPlayerHook): PluginDisposable
}
```

## 8. 兼容策略

当前 v1 插件 API 不做破坏性修改。

兼容方式:

- 旧版 `PluginSong` 通过适配层转换为 `StandardSong`。
- 旧版 `getSongUrl(): string | null` 转换为 `StandardSongUrl`。
- 旧版 `LyricResult` 等价于 `StandardLyric`。
- 旧版 `MusicPluginCapabilities` 继续映射到音乐源能力。
- 现有网易云 / QQ 登录组件先视为过渡实现，迁移时包装成对应插件的 `auth.*` handler。
- 现有 `userStore.cookie` / `userStore.qqCookie` 迁移到插件 `ctx.secrets` 后，仅保留一次性迁移读取，不作为长期兼容入口。
- 入站边界先同时接受旧 `PluginSong` 和新 `StandardSong`，业务层逐步收敛到只接收标准模型。不要在旧插件仍存在时一次性删除兼容转换。
- 旧接口和旧字段先标记 `@deprecated`，并在诊断日志中统计调用量。只有确认旧路径使用量足够低后，才能进入删除阶段。
- `LoginModal.vue`、`QQLoginModal.vue` 在统一登录容器完成前保留为适配层，不直接删除；组件入口必须经过 `resolvePlatformLoginRoute()`，避免新增散落的平台判断。
- 新字段通过可选 `capabilitiesV2` 和 `contributionsV2` 增量加入。

推荐 manifest 扩展:

```ts
export interface PluginManifestV2Extensions {
  category?: 'api' | 'extension' | 'theme'
  engines?: {
    pluginApi?: string
    app?: string
  }
  capabilitiesV2?: PluginCapabilityMap
  contributionsV2?: PluginContribution[]
}
```

在实现完成前，文档和 SDK 可先声明这些类型，运行时继续使用现有 v1 字段。

## 9. 迁移路线

### 阶段一: 文档与类型

- [x] 新增标准模型文档。
- [x] 在 SDK 中补充 `PluginContext.pluginId`、`ctx.secrets` 和 `auth.*` 方法名。
- 明确歌词、歌曲、歌单、播放 URL 的入站责任。
- 补充 `StandardAuthState`、`StandardLoginChallenge` 和 `auth.*` 能力草案。
- [x] 补充 `PluginSecretStore` / `ctx.secrets` 最小类型。
- [x] `RestrictedHttpClient` 已支持 `headers` 和 `timeoutMs`，供插件携带自身凭据发起受控请求。
- [ ] `PluginCallError`、`PluginPlayerHook` 仍待 SDK 化。

### 阶段二: 入站适配层

- [x] 在 `ExternalAdapterProxy` 和 `PluginAdapterBridge` 中集中做标准模型转换。
- [x] 让音乐服务和播放器优先接收标准模型。
- 将旧模型兼容逻辑集中到入站边界，业务层进入过渡期后逐步移除散落的平台字段兼容逻辑。
- [x] 已把 `duration` 非法值降级为 `0`，并保持毫秒作为唯一入站单位；旧插件秒单位兼容表仍待按平台补充。
- [ ] 对大歌单转换做按需 normalize 或懒转换，避免全量深克隆导致 UI 卡顿。

### 阶段三: 登录插件化

- [x] SDK 和外部插件调用链已接受 `auth.*` 方法名；宿主服务层已提供完整 `PluginAuthFacade`，组件通过 `services.plugins().auth` 访问认证能力。
- [x] 登录入口已像搜索源一样从已启用平台描述符自适应生成；`capabilities.auth.login = true` 的平台会自动出现在头像菜单。
- [x] 已新增通用 `PluginLoginModal.vue`，支持二维码 / 浏览器 challenge 的最小统一容器和关闭时取消 challenge。
- [x] `userStore` 已增加通用 `PlatformAuthState` 摘要缓存，头像菜单、缓存管理和侧边栏登录摘要不再直接依赖 QQ / 网易云专属展示状态。
- [x] 登录入口路由已收口到 `resolvePlatformLoginRoute()`；非 legacy 登录平台默认进入 `PluginLoginModal.vue`，网易云 / QQ 暂时经 legacy 登录桥保留旧 cookie 写入链路。
- [x] SDK 和服务层已提供 `account` / `library` facade；网易云插件已输出标准 profile、liked songs、playlists、playlist tracks，QQ 插件已输出标准 profile。
- [~] 网易云、QQ 音乐插件侧已提供 `auth.*` 登录请求、轮询、Cookie 托管和标准旧会话导入；宿主旧登录组件仍保留一段兼容期。
- 将平台专属登录弹窗完全收口为统一登录容器，具体二维码、授权 URL、表单字段由插件返回。
- [x] 新增 `PluginSecretStore` / `ctx.secrets`，并通过 Worker 代理给外部插件。
- [x] `storage` / `secrets` 命名空间按 `pluginId` 隔离，避免同平台替代插件互相覆盖。
- [x] manifest 权限和平台描述已支持 `permissions.secrets`。
- [x] 提供 `auth.importSession` 一次性迁移，把 `userStore.cookie` / `userStore.qqCookie` 以 `StandardImportedAuthSession` 导入对应插件，由插件写入自身 secrets；迁移后旧字段只读读取一段时间，不再作为长期兼容入口。
- [x] 宿主/Worker 调用链已支持 `auth.cancelLogin` 方法名；通用插件登录窗口关闭时会主动取消 challenge，网易云 / QQ 兼容弹窗仍走现有本地轮询清理。
- 播放、歌单、收藏等能力遇到登录失效时，通过标准状态驱动宿主提示。

### 阶段四: 扩展注册中心

- [x] 插件管理页已按 manifest `category` 分为 API / 拓展 / 主题；平台描述符会透传分类，未声明时默认 `api`。
- 新增统一 extension registry。
- 将音乐平台描述符由 registry 派生。
- 为命令、设置、UI、播放器 hook 暴露统一查询和调用入口。

### 阶段五: 功能插件化

- [x] 将 Windows SMTC 暴露为 `builtin.smtc` 第一方拓展插件，由插件管理页启用 / 停用。
- [x] `App.vue` 不再直接组合 SMTC 细节；SMTC 的 Electron 判断、插件开关、窗口归属和 MediaSession 注册已集中到 `src/extensions/smtc/useSmtcExtension.ts`。
- [x] `builtin.smtc` 停用时会同步调用 `playerCore.setSystemMediaSessionEnabled(false)`，避免清空 metadata 后仍以浏览器默认媒体源残留到 Windows 媒体面板。
- [x] `builtin.smtc` 开关会通过 `smtc:set-enabled` 同步到主进程；应用启动时按该状态设置 `enable-features` 或 `disable-features`，运行时开关不一致时在 Windows 下 relaunch 使 Chromium feature 状态真正生效。
- [x] 将滑动封面切歌暴露为 `builtin.cover-swipe` 第一方拓展插件，由插件管理页启用 / 停用。
- 将波形可视化、桌面歌词逐步迁移到第一方插件。
- 第三方 UI 插件只开放声明式贡献点。
- 每个能力通过 manifest 声明和权限校验进入系统。

### 阶段六: 生命周期与清理

- [x] 插件禁用 / 卸载会停止外部 Worker，终止 pending 调用。
- [x] 插件卸载时删除 `plugin:<pluginId>:storage` 和 `plugin:<pluginId>:secrets` 所在状态记录。
- [x] 插件升级时保留已授权的 storage / secrets；manifest 降权移除 `permissions.storage` / `permissions.secrets` 时会清理不再被授权的持久化数据，Worker 运行期也会拒绝未声明权限的访问。
- 熔断后保留诊断摘要，但不能保留原始 Cookie、token、密码、验证码或完整请求头。

## 10. 实现约束

- 渲染进程禁止直接调用 Node 或 Electron，必须通过 preload / IPC / `src/platform`。
- 服务访问默认走 `services.xxx()`。
- `src/api/` 只做请求与响应适配。
- `src/api/` 不新增平台专属登录流程；平台登录、会话刷新和凭据解析属于插件。
- `src/platform/` 负责运行时差异收口。
- `src/store/` 只保存共享状态和展示摘要，不承载插件协议解析或平台会话凭据。
- Cookie / token / refresh token 等敏感凭据只能进入 `ctx.secrets`。过渡期内，已存在于旧登录链路的 `userStore.cookie` / `userStore.qqCookie` 只能通过 `auth.importSession` 交还给对应插件，不能再扩散到 `ctx.storage`、日志或新的业务 IPC payload。
- 第三方插件网络访问只能经过 `ctx.http`，外部插件沙箱不得暴露原生网络 API。
- 第三方 UI 插件 v1 只允许声明式贡献，不允许任意代码直接进入 renderer。
- 插件 SDK 类型必须保持稳定，避免把内部实现细节暴露给插件作者。

## 11. 可用性检查清单

实现阶段优先验证下面 6 个容易直接造成用户可见 bug 的点:

1. `duration` 入站后必须是毫秒、非负整数；旧插件秒单位必须经明确规则转换，非法值为 `0`。
2. storage / secrets 命名空间必须使用 `pluginId`，不能用 `platformId`，避免同平台替代插件互相覆盖登录态。
3. 登录窗口关闭、插件禁用、插件卸载时必须取消未完成登录 challenge 和轮询请求。
4. 播放 URL 刷新响应必须校验当前播放快照，不匹配就丢弃，避免旧请求覆盖新歌曲 URL。
5. 旧 API 和旧字段只标记 `@deprecated` 并统计使用量，不在迁移早期删除兼容路径。
6. 大歌单转换必须支持懒 normalize 或分批处理，避免一次性深克隆导致 UI 卡顿。

当前实现状态:

- [x] 1: 入站 normalizer 已统一毫秒、非负整数和非法值降级。
- [x] 2: `PluginStateStore`、外部 Worker storage / secrets 已改为 `pluginId` 命名空间。
- [~] 3: 插件禁用 / 卸载会停止 Worker；通用插件登录窗口关闭会触发 `auth.cancelLogin`，网易云 / QQ 兼容弹窗仍走本地轮询清理。
- [x] 4: 播放 URL 刷新不再在请求未校验前改写歌曲；响应回来后校验当前播放快照。
- [~] 5: 旧模型兼容已集中到入站 normalizer；旧路径调用量统计待补。
- [~] 6: 已在文档约束中保留；实际懒转换策略待歌单列表场景继续优化。

验证记录:

- `npm run typecheck`
- `npm run lint`
- `npx vitest run tests/composables/useMediaSession.test.ts tests/services/pluginService.test.ts tests/components/SettingsPanel.test.ts tests/composables/useExperimentalFeatures.test.ts tests/App.test.ts`：5 个测试文件、54 个测试通过。
- `npx vitest run tests/composables/useMediaSession.test.ts tests/utils/player/core/playerCore.test.ts tests/App.test.ts`：3 个测试文件、107 个测试通过，覆盖 SMTC 停用时的底层 Audio 系统媒体暴露同步。
- `npx vitest run tests/extensions/smtc/useSmtcExtension.test.ts tests/App.test.ts`：覆盖 SMTC 拓展启动器和 App 层接线。
- `npx vitest run tests/electron/mainIndex.test.ts tests/composables/useExperimentalFeatures.test.ts tests/services/pluginService.test.ts tests/extensions/smtc/useSmtcExtension.test.ts tests/App.test.ts`：覆盖主进程 SMTC feature 默认禁用、渲染端开关同步、插件服务和启动器接线。
- `npm run test:run`：当前环境中 `better-sqlite3` 原生模块被正在运行的 Electron 进程锁定，无法切换到 Node 测试运行时。
- `npx vitest run`：180 个测试文件通过；`tests/electron/localLibrary.repository.test.ts` 和 `tests/electron/localLibrary.service.test.ts` 因 `better-sqlite3.node` 的 Node / Electron ABI 不匹配失败，需关闭 Electron 后重新执行 `npm run test:run` 让脚本恢复原生模块。
