# DI 后续路线图

## 目的

这份路线图用于承接已经完成的 DI Phase 1 到 Phase 3 工作，聚焦“下一步还值得做什么”。

它不是重新设计 DI 方案，而是在当前已确定路线下继续推进：

1. 默认继续使用 `services.xxx()`
2. 热点模块继续采用显式 `deps`
3. `@injectParam(...)` 只保留在基础设施类

## 当前状态

已完成：

- 热点模块显式注入
  - [`src/store/playerStore.ts`](./../../src/store/playerStore.ts)
  - [`src/composables/useSearch.ts`](./../../src/composables/useSearch.ts)
  - [`src/features/home/composables/useHomePage.ts`](./../../src/features/home/composables/useHomePage.ts)
- 业务入口统一到主服务路径
  - 平台/播放器 accessor 兼容层已删除
  - `storage`、`platform`、`config`、部分 `api` 已走 `services.xxx()`
- 规则与示例文档已对齐
  - [`docs/service-layer.md`](./../service-layer.md)
  - [`docs/reference/examples/injector-example.ts`](./../reference/examples/injector-example.ts)
  - [`docs/di-performance-monitoring.md`](./../di-performance-monitoring.md)

仍然存在的现实限制：

- `ApiService` 已覆盖主要 Netease API 入口，但不是所有外部服务请求的默认入口
- `ConfigService` 已覆盖服务 fallback URL，URL 型兼容常量已删除，服务端口默认值已收口到共享协议边界
- `services.xxx()` 仍然是 service locator 形态，不是完整显式依赖图
- `check:architecture` 已覆盖 Netease 直连 request、renderer 端口常量、旧 accessor 和重点模块顶层 `services.xxx()` 缓存防回流
- 来源接口的长期方向是统一框架内部通用格式；QQ / Netease 只是当前内置来源和迁移样例，不应成为业务接口形态的中心

## 路线原则

### 1. 不再扩张 DI 机制复杂度

不引入：

- 完整 IoC 容器
- child container / request scope
- 全业务层构造注入
- 为了“更像 VS Code”而新增抽象层

### 2. 只做有收益的服务化

继续推进的前提是至少满足一条：

- 能显著降低测试替身成本
- 能减少业务层环境判断和边界绕行
- 能把散落常量/配置值收口到单一入口
- 能减少重复 transport / request 封装

### 3. 默认保持兼容迁移

除非收益足够大，否则不做：

- 大范围 API 形态改写
- 整体 store/composable 风格迁移
- 一次性全仓替换旧请求层

### 4. 来源接口统一到内部通用模型

后续 API、插件和服务层迁移都以框架内部模型为目标，而不是以某个具体音乐平台的响应为目标。

默认要求：

- 平台适配器和插件在边界内返回 `Song`、`SearchResult`、`LyricResult`、`PlaylistDetail` 等通用模型。
- 框架桥接层可以做保护性归一化，但只作为防御措施。
- 新增业务代码不要直接依赖 QQ / Netease / 第三方接口的原始字段。
- 平台专属字段先放 `extra`，只有跨来源稳定后才提升为通用字段。

## 优先级

## P0：收口过时分析结论

目标：

- 把旧的“已修复问题”从历史文档里标明状态
- 避免后续阅读者误判当前架构状态

建议更新：

- DI Phase 1 到 Phase 3 的完成记录已从 `docs/plans/` 清理；如需追溯请查看 Git 历史。
- [`docs/reports/service-layer-gap-report.md`](./../reports/service-layer-gap-report.md)
- [`docs/reports/vscode-gap-issues.md`](./../reports/vscode-gap-issues.md)

完成标准：

- 已删除 accessor 兼容层、已服务化入口、已完成测试迁移的内容要在文档里明确标记为“已完成/已过时”

## P1：扩大 `ApiService` 业务接入面

目标：

- 把 `ApiService` 从试点推进到“可持续复用”
- 保持 API 返回进入业务层前已经映射到框架内部通用模型

当前已接入：

- [`src/api/user.ts`](./../../src/api/user.ts)
- [`src/api/search.ts`](./../../src/api/search.ts)
- [`src/api/album.ts`](./../../src/api/album.ts)
- [`src/api/playlist.ts`](./../../src/api/playlist.ts)
- [`src/api/song.ts`](./../../src/api/song.ts)
- [`src/api/netease.ts`](./../../src/api/netease.ts) 已移除 legacy `NeteaseAdapter(request)` 出口

下一批建议目标：

- 保持自动检查，阻止新增 Netease API 模块直接依赖 `@/utils/http`。
- 继续观察是否还有业务调用绕过 `services.api()`。

优先顺序建议：

1. 维护 Netease API 旧请求路径自动检查
2. 按调用方风险继续迁移仍有收益的 API 文件
3. 观察是否还有业务调用需要 `ApiAdapter.fetch()` 形态

原因：

- 当前主要 API 文件已走 `services.api()` 或共享 Netease helper。
- 剩余问题更像防回流和少量特殊链路，不适合继续按文件名机械迁移。

完成标准：

- Netease API 新增入口默认使用 `services.api()`
- `src/api/netease.ts` 不再暴露 legacy adapter 出口
- 模块级测试能通过显式 deps 或服务替身覆盖核心路径
- 新增来源或插件不把平台原始响应直接暴露给 store / 组件

## P1：扩大 `ConfigService` 接入面

目标：

- 让端口、服务发现、环境差异尽量不再散落在业务模块中

当前试点：

- [`src/api/qqmusic.ts`](./../../src/api/qqmusic.ts)
- [`src/utils/http/index.ts`](./../../src/utils/http/index.ts)
- [`src/services/configService.ts`](./../../src/services/configService.ts)

建议继续收口：

- 其他拼接服务地址的入口优先改用 `getServiceBaseUrl()`
- 继续避免新增 `http://127.0.0.1:${port}` 形式的业务层 URL 拼接
- `NETEASE_API_PORT` / `QQ_API_PORT` 默认值只从 `@shared/protocol/cache` 引入

完成标准：

- 配置类常量主要留在服务层或边界层
- 业务模块不再自己拼服务 fallback URL

## P2：补服务层评审自动化

目标：

- 把现在文档里的规则，逐步变成自动检查

已完成：

- 新增静态检查，阻止生产代码重新引入 `platformAccessor/playerAccessor`
- 新增静态检查，阻止 API / store / composable 模块顶层固化 `services.xxx()` 返回值
- 新增静态检查，阻止 Netease API 模块直接依赖 `@/utils/http`
- 新增静态检查，阻止 renderer HTTP 常量重新定义服务端口默认值

后续可选方向：

- 增加对 `localStorage` 直接访问的白名单检查，仅允许边界模块使用

完成标准：

- 核心服务边界已有自动规则防止旧模式回流

## P2：补服务层采用度观测

目标：

- 不只看“服务存在”，还要看“用了多少”

建议观测项：

- `services.api()` 进入了多少业务模块
- `services.config()` 替换了多少旧常量入口
- 显式 `deps` 覆盖了多少热点模块
- 旧 request/adapter 写法是否重新出现

建议输出方式：

- 在 [`docs/di-performance-monitoring.md`](./../di-performance-monitoring.md) 基础上增加采用度清单
- 或者单独新增一次性报告文档

## 不建议继续做的事

下面这些方向当前收益不高，建议明确不做：

- 把所有业务模块改成 `Injector` + 构造函数注入
- 为了统一而把现有 composable 都改造成工厂类
- 引入新的 DI 第三方库
- 在没有明确收益前实现更复杂的实例化层

## 建议执行顺序

1. 更新过时分析文档，统一当前状态口径
2. 继续收口剩余配置型常量入口
3. 扩展自动检查，防止更多旧模式回流
4. 对特殊请求链路做按收益迁移，不做全仓机械替换

## 验收标准

一轮后续路线完成后，至少应满足：

- `ApiService` 成为 Netease API 新增入口的默认路径
- `ConfigService` 接入面继续扩大
- 文档中的过时问题陈述被清理
- 自动化规则能防止 Netease API 直连旧 request 入口
- `typecheck`、`lint`、受影响测试继续全绿
