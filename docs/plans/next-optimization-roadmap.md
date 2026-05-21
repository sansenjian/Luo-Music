# 下一步优化路线图

更新时间：2026-05-21

这份路线图承接当前服务层 / DI 收口和插件系统增强工作，用于记录下一轮真正值得推进的内容。

## 当前判断

- 服务层和 DI 不需要继续扩张机制复杂度。默认路径保持 `services.xxx()`，热点模块继续使用显式 `deps`。
- QQ 音乐和网易云只作为当前内置来源和迁移样例，后续接口不应围绕某个平台定制。
- 插件输入到框架的数据应尽量已经是框架内部通用模型；框架归一化只做保护性兜底。
- 剩余风险主要集中在边界防回流、插件运行时能力、旧登录链路兼容期、大歌单转换性能和可观测性闭环。

## P0：先稳住接口边界

### 1. 补齐插件标准模型和 SDK 边界

目标：

- 让插件作者面向稳定 SDK 类型实现能力，而不是依赖宿主内部实现细节。
- 继续强化 `Song`、`SearchResult`、`LyricResult`、`PlaylistDetail`、账号资料和资料库能力的通用模型边界。

建议动作：

- 继续维护已 SDK 化的 `PluginCallError`、`StandardSongUrl`、`PluginPlayerHook` 和基础 `contributionsV2` 合同。
- 继续为插件入站转换补充 fixtures，覆盖歌曲、歌词、歌单、账号资料、喜欢歌曲、用户歌单和歌单歌曲。
- 新增或补强测试，确保业务层收到的已经是框架内部模型，平台私有字段只进入 `extra` 或边界层。

完成标准：

- `packages/plugin-sdk` 暴露必要类型，且不暴露 renderer / Electron 内部实现。
- 插件服务或入站 normalizer 测试能覆盖旧字段、缺省字段和非法字段的保护性兜底。
- 新增业务代码不直接消费 QQ / Netease / 第三方平台原始响应字段。

### 2. 收口 legacy 登录兼容期

目标：

- 登录能力最终由插件提供，宿主只负责统一登录容器、受控存储、状态摘要和安全边界。

建议动作：

- 继续把网易云 / QQ 专属登录弹窗收口到 `PluginLoginModal.vue` 和 `resolvePlatformLoginRoute()` 后面。
- 播放、收藏、歌单、账号资料等能力遇到登录失效时，通过标准 `PlatformAuthState` 驱动宿主提示。
- 保留 `auth.importSession` 作为旧 Cookie 的一次性迁移入口，避免旧字段继续扩散到新的业务 payload。

完成标准：

- 组件层不再散落 `platform.id === 'netease'` / `platform.id === 'qq'` 判断。
- 新增平台登录只需要插件声明 `capabilities.auth.login = true` 并实现 `auth.*`。
- Cookie / token 只进入插件 `ctx.secrets`，不进入普通 storage、日志或 renderer 持久状态。

### 3. 把边界规则继续变成自动检查

目标：

- 防止已经收口的服务层、请求层、配置常量和插件 facade 重新出现旁路。

建议动作：

- 继续维护 Netease API 旧请求路径检查，阻止新增模块直接依赖 `@/utils/http`。
- 维护 `localStorage` 直接访问白名单检查，仅允许平台、存储或迁移边界使用。
- 维护插件调用边界检查：组件、store、composable 默认走 `services.plugins().auth/account/library` facade，不直接拼 `pluginService.call(platformId, 'account.xxx')`。
- 继续阻止业务层直接拼接服务 URL 或重新定义服务端口默认值。

完成标准：

- `npm run lint` 能覆盖核心架构边界检查。
- 新增业务代码默认走 `services.xxx()`、显式 `deps` 或插件 facade。

## P1：增强插件运行时能力

### 4. 建立统一 extension registry

目标：

- 让音乐源、命令、设置、UI 贡献和播放器 hook 走同一套声明与查询入口。

建议动作：

- 新增统一 extension registry，汇总 manifest、capabilities 和 contributions。
- 将音乐平台描述符逐步改为由 registry 派生。
- 为命令、设置项、声明式 UI 面板和播放器 hook 暴露统一查询入口。

完成标准：

- 第一方插件和第三方插件都通过 manifest / contribution 进入系统。
- 业务层查询“有哪些能力”时不需要知道具体插件实现或平台类型。

### 5. 落地播放器 hook 运行器

目标：

- 为后续播放增强、歌词同步、可视化和桌面能力提供受控扩展点。

建议动作：

- 先支持第一方 / built-in hook，验证生命周期、权限、错误隔离和禁用清理。
- hook 调用进入熔断统计，避免单个插件持续拖慢播放热路径。
- 第三方 hook 暂时只开放稳定声明式能力，不允许任意 renderer 代码直接执行。

完成标准：

- 插件禁用、卸载或崩溃时，hook 能被清理，不留下监听、计时器或 pending promise。
- 播放热路径不会因为插件异常而中断核心播放器。

### 6. 继续第一方功能插件化

目标：

- 把适合作为功能增强的能力从宿主核心中剥离，让核心播放器保持稳定。

建议动作：

- 在 `builtin.smtc` 和 `builtin.cover-swipe` 模式验证稳定后，继续评估桌面歌词和波形可视化。
- 桌面歌词优先保留主数据源和 IPC 边界稳定，不做一次性重写。
- 波形可视化优先作为声明式或第一方受信插件，避免直接扩大第三方 UI 运行权限。

完成标准：

- 第一方功能可以在插件管理页启用 / 停用。
- 停用后对应资源会完整释放，且不会影响核心播放。

## P1：降低大数据场景风险

### 7. 大歌单入站转换懒处理

目标：

- 避免插件或平台返回大歌单时，一次性深克隆和 normalize 卡住 UI。

建议动作：

- 对大歌单转换做按需 normalize、分批转换或缓存转换结果。
- 为入站转换增加耗时记录，定位超过阈值的插件和 payload。
- 保持业务层看到的仍是通用模型，不把懒处理泄漏成平台专属结构。

完成标准：

- 大歌单导入、用户歌单详情和搜索结果加载不会因为全量深转换造成明显卡顿。
- normalizer 的性能优化不改变业务层数据合同。

## P2：补可观测性闭环

### 8. 建立关键链路诊断输出

目标：

- 让启动、IPC、服务预热、插件调用和入站转换可以被量化，而不是只靠手动观察。

建议动作：

- 为主进程启动、服务启动、IPC 热点通道、插件调用耗时和 normalizer 耗时输出结构化诊断。
- 将关键指标汇总到开发诊断页或稳定日志入口。
- 为性能基线保留对比能力，用于评估后续优化收益。

完成标准：

- 出现慢启动、慢 IPC、慢插件调用或大 payload 卡顿时，可以从诊断输出定位到具体阶段。
- 至少有一组轻量测试或脚本能防止诊断入口失效。

## 暂不推进

当前不建议做：

- 引入完整 IoC 容器或把全业务代码改为构造注入。
- 为 QQ / Netease 定制新的核心业务接口。
- 在迁移早期删除旧插件兼容路径。
- 开放第三方插件任意 Vue / ESM / npm 代码直接进入 renderer。
- 对所有 API 文件做机械式重写。

## 建议执行顺序

1. 先补插件 SDK 类型和入站模型 fixtures。
2. 收口 legacy 登录路由和状态提示。
3. 扩展 `check:architecture`，把服务层和插件 facade 边界固化。
4. 建立 extension registry，并让平台描述符逐步从 registry 派生。
5. 落地第一方播放器 hook 运行器。
6. 处理大歌单懒 normalize。
7. 补启动、IPC、插件调用和 normalizer 的诊断输出。

## 关联文档

- [DI 后续路线图](./di-followup-roadmap.md)
- [插件体系拓展架构](../plugin-extension-architecture.md)
- [服务层 / DI 规则](../service-layer.md)
- [服务层 + DI 差距报告](../reports/service-layer-gap-report.md)
- [LUO Music 当前问题清单](../reports/vscode-gap-issues.md)
