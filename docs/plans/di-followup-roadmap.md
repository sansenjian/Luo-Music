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
  - [`src/composables/useHomePage.ts`](./../../src/composables/useHomePage.ts)
- 业务入口统一到主服务路径
  - 平台/播放器 accessor 兼容层已删除
  - `storage`、`platform`、`config`、部分 `api` 已走 `services.xxx()`
- 规则与示例文档已对齐
  - [`docs/service-layer.md`](./../service-layer.md)
  - [`docs/reference/examples/injector-example.ts`](./../reference/examples/injector-example.ts)
  - [`docs/di-performance-monitoring.md`](./../di-performance-monitoring.md)

仍然存在的现实限制：

- `ApiService` 只是试点，不是默认业务 API 入口
- `ConfigService` 只是部分落地，不是唯一配置入口
- `services.xxx()` 仍然是 service locator 形态，不是完整显式依赖图

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

## 优先级

## P0：收口过时分析结论

目标：

- 把旧的“已修复问题”从历史文档里标明状态
- 避免后续阅读者误判当前架构状态

建议更新：

- [`docs/plans/di-optimization-plan.md`](./di-optimization-plan.md)
- [`docs/reports/service-layer-gap-report.md`](./../reports/service-layer-gap-report.md)
- [`docs/reports/vscode-gap-issues.md`](./../reports/vscode-gap-issues.md)

完成标准：

- 已删除 accessor 兼容层、已服务化入口、已完成测试迁移的内容要在文档里明确标记为“已完成/已过时”

## P1：扩大 `ApiService` 业务接入面

目标：

- 把 `ApiService` 从试点推进到“可持续复用”

当前试点：

- [`src/api/user.ts`](./../../src/api/user.ts)

下一批建议目标：

- [`src/api/search.ts`](./../../src/api/search.ts)
- [`src/api/playlist.ts`](./../../src/api/playlist.ts)
- [`src/api/song.ts`](./../../src/api/song.ts)

优先顺序建议：

1. `search.ts`
2. `playlist.ts`
3. `song.ts`

原因：

- `search.ts` 结构最简单，迁移风险最低
- `playlist.ts` 次之
- `song.ts` 涉及更多特殊参数、fallback 和音质逻辑，放最后

完成标准：

- 至少 2 个 Netease API 模块切到 `services.api()`
- 模块级测试能通过显式 deps 或服务替身覆盖核心路径

## P1：扩大 `ConfigService` 接入面

目标：

- 让端口、服务发现、环境差异尽量不再散落在业务模块中

当前试点：

- [`src/api/qqmusic.ts`](./../../src/api/qqmusic.ts)

建议继续收口：

- 其他拼接服务地址的入口
- 仍直接依赖 `QQ_API_SERVER` / `NETEASE_API_PORT` / `QQ_API_PORT` 的业务模块

完成标准：

- 配置类常量主要留在服务层或边界层
- 业务模块不再自己拼服务 fallback URL

## P2：补服务层评审自动化

目标：

- 把现在文档里的规则，逐步变成自动检查

建议方向：

- 新增静态检查，阻止业务层重新引入 `platformAccessor/playerAccessor`
- 增加 lint 规则或脚本，提示模块顶层固化 `services.xxx()` 返回值
- 增加对 `localStorage` 直接访问的白名单检查，仅允许边界模块使用

完成标准：

- 至少有 1 条规则能自动阻止旧模式回流

## P2：补服务层采用度观测

目标：

- 不只看“服务存在”，还要看“用了多少”

建议观测项：

- `services.api()` 进入了多少业务模块
- `services.config()` 替换了多少旧常量入口
- 显式 `deps` 覆盖了多少热点模块
- 旧 request/adapter 写法还有多少保留点

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
2. 迁移 `src/api/search.ts` 到 `services.api()`
3. 迁移 `src/api/playlist.ts` 到 `services.api()`
4. 继续收口剩余配置型常量入口
5. 增加 1 条自动检查，防止旧模式回流

## 验收标准

一轮后续路线完成后，至少应满足：

- `ApiService` 不再只有试点模块
- `ConfigService` 接入面继续扩大
- 文档中的过时问题陈述被清理
- 至少有 1 条自动化规则防止服务边界回流
- `typecheck`、`lint`、受影响测试继续全绿
