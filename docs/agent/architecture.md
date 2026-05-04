# 架构边界与任务入口

## 模块边界

- 根目录 `api/`：仅用于 Vercel Serverless Function 部署路由，例如 `/api/*` 与 `/qq-api` 重写；不要从 `src/`、`electron/` 或通用包导入。
- `src/api/`：仅负责 HTTP 请求、响应适配、接口类型定义；不要放视图逻辑。
- `src/platform/`：统一封装 Web / Electron 差异；不要直接耦合 UI。
- `src/store/`：全局共享状态唯一数据源；播放器、登录、下载等状态不要多处维护。
- `src/composables/`：沉淀可复用的状态编排、副作用和页面逻辑。
- `src/components/`：保持展示与交互职责，优先用 Props / Events 通信。
- `src/views/`：负责页面组装，不承载底层适配。
- `electron/`：仅运行在主进程或 preload 环境；不要混入前端浏览器逻辑。

## 服务与状态

- 默认通过 `services.xxx()` 获取平台、日志、配置、错误处理和其他服务。
- 只有在测试替身需求明显或模块副作用很重时，才加显式 `deps` 注入入口。
- 不要继续新增 service accessor 兼容层，例如 `getPlatformAccessor()` 这类入口。
- 除非是明确的单例边界模块，否则不要在模块顶层缓存服务实例。

## 网络与错误处理

- 区分根 `api/` 与 `src/api/`：根 `api/` 是部署 handler，`src/api/` 才是渲染侧业务请求入口。
- 请求逻辑优先收敛到 `src/api/` 与 `src/utils/http/`。
- 错误处理优先复用 `src/utils/error/`，不要在页面或组件里散落重复分支。
- 平台接口异常要区分网络问题、鉴权问题、空数据和平台差异。

## 页面 / 组件组织

- 页面级状态放 Pinia 或页面级 composable。
- 组件局部状态才使用 `ref` / `reactive`。
- 复杂交互优先拆成 composable + 展示组件，避免单组件持续膨胀。
- 样式改动优先局部收敛，避免影响全局播放器和通用组件。

## 任务入口

### QQ 音乐或平台适配

- `src/api/qqmusic.ts`
- `src/platform/music/qq.ts`
- `src/platform/music/interface.ts`

### 请求层问题

- `src/utils/http/`
- `src/utils/error/`
- `src/api/adapter.ts`

### 播放器逻辑

- `src/store/playerStore.ts`（入口）/ `src/store/player/`（子模块：playbackActions、lyricSync、runtime 等）
- `src/utils/player/`（core、modules、constants、helpers）
- `src/components/Player.vue`

### 状态与用户数据

- `src/store/`（playerStore、searchStore、userStore、playlistStore 等）
- `src/composables/`
- `src/components/user/`
- `src/views/UserCenter.vue`
