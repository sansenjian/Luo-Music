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
- `ConfigService` 已在 QQ 音乐 API 基础路径解析中使用，避免业务层直接固化 QQ 服务端口。
- `check:architecture` 已进入 `lint`，用于阻止部分结构边界回流。

## 当前主要差距

### 1. Netease adapter 仍保留旧 request 构造入口

`src/api/netease.ts` 仍通过 `new NeteaseAdapter(request)` 暴露 legacy adapter。它目前更多是兼容出口，不应继续作为新增业务调用路径。

建议：

- 新增 Netease API 入口优先使用 `src/api/shared/neteaseServiceRequest.ts`。
- 删除或改造 `neteaseAdapter` 前，先确认调用方是否仍需要 `ApiAdapter.fetch()` 形态。

### 2. 仍有配置常量直接从 `src/constants/http.ts` 暴露

`NETEASE_API_PORT`、`QQ_API_PORT`、`DEV_API_SERVER` 和 `QQ_API_SERVER` 仍作为兼容常量存在。当前服务层已经有 `ConfigService`，但还没有成为所有配置读取的唯一入口。

建议：

- 服务端口和 fallback URL 优先从 `services.config()` 或边界层读取。
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

1. 将剩余 Netease legacy adapter 调用方清零或改造为 `services.api()` 路径。
2. 继续收口 `ConfigService`，减少业务层直接读取端口和服务 URL。
3. 增加一条自动检查，阻止新增业务模块直接依赖 `@/utils/http` 作为 Netease 请求入口。
4. 按收益迁移旧 API 文件，不做一次性全仓请求层重写。
