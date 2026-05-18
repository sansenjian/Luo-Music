# 服务层 + DI 差距报告

## 评估结论

当前服务层已经从早期“最小 DI 试点”进入可持续收口阶段。`services.xxx()` 是默认服务入口，热点模块通过显式 `deps` 保持可测试性；后续重点不再是扩张 DI 机制，而是减少旧请求层、环境判断和配置常量的旁路入口。

## 已完成

- 服务注册与最小 DI 已稳定使用：`setupServices` / `services.*()`。
- 平台和播放器 accessor 兼容层已删除；`PlatformService` 已成为渲染侧平台判断的默认入口。
- 热点模块已支持显式依赖注入，例如 `playerStore`、`useSearch` 和 `useHomePage`。
- `ApiService` 已接入多条 Netease API 路径：
  - `src/api/user.ts`
  - `src/api/search.ts`
  - `src/api/album.ts`
  - `src/api/playlist.ts`
  - `src/api/song.ts`
- `src/api/netease.ts` 不再暴露 legacy `NeteaseAdapter(request)` 出口，Netease API 入口默认通过共享 helper 或 `services.api()`。
- `ConfigService` 已提供 `getServiceBaseUrl()`，QQ 音乐 fallback URL 与 Electron 生产环境 Netease 默认 URL 都从配置服务读取。
- `check:architecture` 已进入 `lint`，用于阻止部分结构边界回流。

## 当前主要差距

### 1. Netease 旧请求入口需要防回流

`src/api/netease.ts` 的 legacy adapter 出口已删除，主要 Netease API 文件已走 `src/api/shared/neteaseServiceRequest.ts`。后续重点是防止新增模块重新直接依赖 `@/utils/http`。

建议：

- 新增 Netease API 入口优先使用 `src/api/shared/neteaseServiceRequest.ts`。
- 保持 `check:architecture` 中的 Netease 请求边界检查，发现新直连时优先改为共享 helper。

### 2. 端口常量仍需继续收口为配置边界

`DEV_API_SERVER` 和 `QQ_API_SERVER` 已删除，运行时 fallback URL 统一通过 `services.config().getServiceBaseUrl()` 获取。`NETEASE_API_PORT` 和 `QQ_API_PORT` 仍作为默认端口常量存在，后续可继续评估是否只保留在服务层或共享协议边界内部。

建议：

- 服务端口和 fallback URL 优先从 `services.config()` 或边界层读取。
- 新增业务模块不要直接拼接 `http://127.0.0.1:${port}`。
- 共享协议常量继续放在 `@shared/protocol/cache`，避免 Electron 和 renderer 各自复制端口值。

### 3. 部分模块仍直接使用 runtime helper

少量启动、Sentry、HTTP transport 和窗口 resize 代码仍直接使用 `isElectronRuntime()`。这些属于运行时边界或低层工具，不需要机械替换；业务组件和 composable 应继续走 `services.platform()` 或显式 deps。

建议：

- 保留低层边界中的 runtime helper。
- 业务层新增平台判断默认注入 `PlatformService`，不要直接 import runtime helper。

### 4. DI 仍是 Service Locator 形态

当前仍是“`services.xxx()` + 热点模块显式 deps”的务实形态，不是完整显式依赖图。

现阶段不建议引入完整 IoC 容器。只有当某个模块出现明显测试替身成本、环境判断扩散或生命周期管理问题时，再做局部服务化。

## 建议推进路径

1. 保持 Netease 旧请求路径自动检查，避免 legacy adapter 或直连 request 回流。
2. 继续收口端口默认值，减少业务层直接读取端口。
3. 按收益迁移旧 API 文件，不做一次性全仓请求层重写。
4. 继续观察低层 runtime helper 的使用面，业务层新增平台判断默认走 `PlatformService`。
