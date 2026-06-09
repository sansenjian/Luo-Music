# LUO Music 当前问题清单（对比 VS Code 架构思路）

更新日期：2026-05-19

## 概览

当前状态：

- 第一阶段已完成（2026-03-21）
- 第二阶段已完成（2026-03-21）
- 第三阶段部分推进：服务层/DI 默认路径、Netease API 请求入口、服务 URL 与端口默认值已完成收口
- 后续来源接口方向已明确：业务层消费框架内部通用模型，QQ / Netease 只作为当前内置来源和迁移样例

当前项目已经具备部分 VS Code 风格基础设施，包括统一 IPC、服务层、事件系统、生命周期工具、Context Key、Command Service 和子进程服务管理。

真正的差距不在于“缺少更多概念”，而在于这些基础设施还要持续防止旁路回流。现在的主要问题集中在启动路径、生命周期一致性、可观测性闭环和大规模交互场景下的运行成本。

## 优先级结论

### P0

1. 主进程与渲染层边界仍有回流
2. 可观测性还未形成闭环
3. 基础设施重复实现仍需继续统一

### P1

1. 组件和 Store 体量偏大，后续维护成本会继续上升
2. 播放器与长列表的进一步性能治理仍有空间
3. 已完成收口的默认路径仍需持续防止旁路回流

### P2

1. 是否继续把更严格的 instantiation model 推广到业务层，后续再评估

## 详细问题

### 1. 启动路径过重

问题：

- 主进程启动时先初始化 IPC，再同步等待服务启动完成，之后才创建窗口。
- 当前服务启动是串行执行，首屏时间会被 QQ / Netease 子进程启动时间直接放大。

代码位置：

- `electron/main/index.ts`
- `electron/ServiceManager.ts`

具体表现：

- `initializeApp()` 中先执行 `await serviceManager.initialize(...)`，再执行 `windowManager.createWindow()`
- `ServiceManager.initialize()` 内部按配置逐个 `await this.startService(serviceId)`

影响：

- Electron 首屏可见时间偏慢
- 服务异常会直接拖累 UI 可用性
- 不符合 VS Code 常见的“先拉起 workbench，再后台激活子系统”的思路

建议：

- 改为先创建窗口，再后台并行预热服务
- 将非首屏必需服务改成按需启动
- 为主进程启动过程补分段耗时记录

### 2. 基础设施已形成默认路径，仍需防回流

问题：

- 仓库已经有 service layer，平台、存储、配置和 Netease API 请求入口已完成主要收口；后续重点是防止旧 accessor、旧 request 和配置常量旁路回流

代码位置：

- `src/services/index.ts`
- `src/services/configService.ts`
- `src/api/shared/neteaseServiceRequest.ts`
- `scripts/check-architecture-boundaries.cjs`

具体表现：

- 平台能力默认走 `services.platform()`
- Netease API 默认走 `services.api()` 或 `src/api/shared/neteaseServiceRequest.ts`
- 服务 URL 默认走 `services.config().getServiceBaseUrl()`
- 端口默认值集中在 `@shared/protocol/cache`
- 插件和平台适配层应返回 `Song`、`SearchResult`、`LyricResult`、`PlaylistDetail` 等框架通用模型，保护性归一化只放在桥接边界
- `check:architecture` 已阻止 Netease API 直连 `@/utils/http`、renderer HTTP 常量重新定义服务端口、生产代码重新引入旧 accessor

影响：

- 默认路径已经稳定，但如果没有自动检查，新增代码仍可能重新引入旧旁路
- 文档或示例一旦滞后，代码评审成本会升高

建议：

- 保持 `check:architecture` 作为防回流入口
- 新增业务代码默认使用 `services.xxx()` 或显式 `deps`
- 新增 Netease API 模块默认使用 `neteaseServiceRequest`
- 新增来源或插件先在边界内转换为框架内部通用模型，平台专属字段优先放入 `extra`
- 继续避免业务层直接拼服务 URL 或读取服务端口常量

### 3. DI 路线已明确，剩余是边界治理

问题：

- 当前项目有意保留“`services.xxx()` + 热点模块显式 `deps`”的务实路线，不再追求全业务构造注入；剩余工作是让这条路线稳定可维护

状态更新（2026-03-21）：

- `src/services/injector.ts` 已移除按参数位置猜测依赖和未知标识 fallback，构造注入改为显式 `@injectParam(...)`
- 当前路线已明确为“默认继续使用 `services.xxx()`，构造注入仅在显式标注时启用”，不再继续扩散半成品 DI

状态更新（2026-05-19）：

- `ApiService` 已覆盖主要 Netease API 入口
- `ConfigService` 已覆盖服务 fallback URL
- Netease legacy adapter 出口已删除
- URL 型兼容常量已删除，端口默认值已收口到 `@shared/protocol/cache`
- `check:architecture` 已加入多条服务边界防回流规则

代码位置：

- `src/services/injector.ts`
- `src/services/index.ts`

具体表现：

- `Injector.resolveDependencies()` 已改为仅解析显式注解的构造参数
- `Inject()` 不再对未知标识做静默 fallback
- 业务层主要依赖 `services.xxx()` 获取能力，测试敏感模块使用显式 `deps`
- `@injectParam(...)` 仅保留给基础设施类或明确由 `Injector` 创建的类

影响：

- 路线已经稳定，但新增模块仍需要遵守边界，否则会重新出现旧 request、旧 accessor 或顶层服务实例缓存

建议：

- 保留 `services.xxx()` 作为默认路径
- 继续只在高副作用/测试敏感模块使用显式 `deps`
- 不引入完整 IoC 或全业务构造注入
- 通过自动检查和文档示例防止旧模式回流

### 4. 生命周期管理没有贯穿热路径

问题：

- 项目已经有 `Disposable` / `DisposableStore`，但关键模块仍保留大量模块级状态和手动资源管理

状态更新（2026-03-21）：

- `src/store/player/runtime.ts` 已引入 `PlayerStoreRuntime` 托管 `audioEventHandler`、`playbackActions`、`ipcHandlers` 等运行时资源
- `src/store/player/audioEvents.ts`、`src/store/player/ipcHandlers.ts` 和 `src/utils/performance/monitor.ts` 已接入 `DisposableStore` / `EventEmitter`
- 当前剩余问题主要是进一步拆层和性能治理，不再是热路径缺少统一清理模型

代码位置：

- `src/base/common/lifecycle/disposable.ts`
- `src/store/playerStore.ts`
- `src/utils/performance/monitor.ts`

具体表现：

- `playerStore.ts` 已通过 runtime 持有 `audioEventHandler`、`playbackActions`、`ipcHandlers`
- 性能监控已为 `requestAnimationFrame` 和 `setInterval` 补齐 dispose 机制
- 仍需继续把同类模式推广到剩余重复基础设施实现

影响：

- 多实例隔离困难
- 热更新和测试场景更容易出现残留状态
- 未来复杂交互下更容易出现资源泄漏

建议：

- 将长生命周期资源纳入 `DisposableStore`
- 避免在 Store 模块顶层持有可变单例
- 为监控、轮询、订阅和拖拽逻辑建立统一清理模式

### 5. 长列表和核心交互仍有性能空间

问题：

- 歌单、播放器和相关交互目前还能工作，但在数据量上升后会比 VS Code 风格 workbench 更早遇到瓶颈

代码位置：

- `src/components/Playlist.vue`
- `src/components/Player.vue`
- `src/store/playerStore.ts`
- `src/views/Home.vue`

具体表现：

- `Playlist.vue` 每次都从 `songList` 全量映射生成展示数据
- `Playlist.vue` 直接 `v-for` 渲染整个列表，没有虚拟化
- `Player.vue` 体量达到 700+ 行
- `playerStore.ts` 体量达到 400+ 行
- `Home.vue` 中播放器组件被渲染两次，分别对应普通模式和紧凑模式

影响：

- 列表规模增大后 DOM 成本和计算成本都会上涨
- 播放器与状态逻辑耦合较深，后续拆分难度持续增加
- 热路径的性能问题更难定位

建议：

- 对歌单和用户歌单优先引入虚拟列表
- 将播放器状态、播放控制、IPC 同步、歌词逻辑继续拆层
- 检查双渲染组件是否可通过状态切换或更轻的结构复用降低成本

### 6. 基础设施重复实现，说明还没彻底统一

问题：

- 仓库已经有统一事件系统，但部分模块仍自行实现局部版本

代码位置：

- `src/base/common/event/event.ts`
- `src/services/commandService.ts`

具体表现：

- `commandService.ts` 自己定义了 `createEmitter()`
- 没有直接复用已有 `EventEmitter`

影响：

- 基础设施形态分叉
- 维护者需要理解多套近似但不完全一致的模式
- 后续调试和能力扩展更容易产生不一致行为

建议：

- 统一复用 `base/common` 中的事件与生命周期能力
- 让基础设施层真正成为唯一实现来源

### 7. 主进程与渲染层边界仍有回流

问题：

- Electron 主进程代码仍直接引用 `src/` 下的部分渲染层常量

代码位置：

- `electron/ipc/handlers/api.handler.ts`

具体表现：

- 直接引用 `src/platform/music/netease.constants.ts`
- 直接引用 `src/constants/audio.ts`

影响：

- `electron/`、`src/`、`shared/` 的分层边界被削弱
- 未来拆包、重构和构建隔离时更容易出现依赖方向问题

建议：

- 将真正需要跨端共享的常量下沉到 `electron/shared/` 或独立 `shared/` 层
- 保持主进程对渲染层零反向依赖

### 8. 可观测性仍以控制台为主，没有形成闭环

问题：

- 已经有性能监控和 service metrics，但多数仍停留在本地日志和控制台阶段

代码位置：

- `src/utils/performance/monitor.ts`
- `src/services/performanceMonitor.ts`
- `electron/ipc/IpcService.ts`

具体表现：

- Web Vitals、FPS、内存占用主要只做 `console.log` / `console.warn`
- Service metrics 有追踪，但没有稳定接入诊断面板、构建检查或回归基线
- IPC 中间件有基础日志，但缺少延迟分布和热点通道分析输出

影响：

- 出现卡顿、慢启动、IPC 抖动时，问题定位仍偏人工
- 架构优化收益难以量化

建议：

- 为启动阶段、IPC 通道、服务启动、列表渲染建立统一诊断数据
- 将关键指标汇总到开发诊断页或结构化日志
- 为核心基线建立对比机制，而不是只保留一次性观察

## 与 VS Code 的关键差距总结

当前与 VS Code 相比，最主要的差距不是“有没有某个基础类”，而是以下三点：

1. 默认路径不够统一
2. 生命周期控制没有贯穿所有关键模块
3. 大规模运行时成本还没有被系统化治理

## 建议的推进顺序

### 第一阶段

状态：已完成（2026-03-21）

1. 调整启动路径，先开窗再后台预热服务
2. 清理旁路入口，统一平台、存储、环境访问方式
3. 为歌单列表引入虚拟化

已完成项：

- `electron/main/index.ts`：主窗口创建不再等待服务预热完成
- `electron/ServiceManager.ts`：服务启动改为并行预热
- `src/services/storageService.ts`：收口 storage 访问入口
- 平台能力统一收口为 `services.platform()`
- `src/App.vue`、`src/composables/useHomeShell.ts`、`src/store/playerStore.ts`：清理 `localStorage` 旁路访问
- `src/composables/useHomePage.ts`、`src/components/home/HomeServerSelect.vue`：清理 `document.querySelector` 和全局 click 收起逻辑
- `src/components/Playlist.vue`：引入固定行高虚拟化

验证：

- `tests/services/index.test.ts`
- `tests/composables/useHomeShell.test.ts`
- `tests/components/Playlist.test.ts`
- `tests/composables/useHomePage.test.ts`
- `tests/components/home/HomeHeader.test.ts`
- `tests/components/home/HomeServerSelect.test.ts`
- `tests/electron/ServiceManager.test.ts`
- `tests/electron/mainIndex.test.ts`

### 第二阶段

状态：已完成（2026-03-21）

1. 明确 DI 路线，停止构造注入向普通业务层扩散
2. 将播放器和相关 Store 继续拆层
3. 把 `Disposable` / `EventEmitter` 彻底推广到热路径

已完成项：

- `src/services/injector.ts`：移除按参数位置猜测与静默 fallback，构造注入改为显式 `@injectParam(...)`
- `tests/services/injector.test.ts`：补齐显式注入、缺失注解与单例行为校验
- `src/store/player/runtime.ts`、`src/store/playerStore.ts`：将播放器运行时资源收敛到 `PlayerStoreRuntime`，由 Store owner 负责创建、复用与重置
- `src/store/player/audioEvents.ts`、`src/store/player/ipcHandlers.ts`：将热路径监听切换为 `DisposableStore` 托管
- `src/utils/performance/monitor.ts`：补齐 `DisposableStore` 清理与 `onDidChangeMetrics` 事件出口

验证：

- `tests/services/configErrorDecorators.test.ts`
- `tests/services/injector.test.ts`
- `tests/utils/performanceMonitor.test.ts`
- `tests/store/playerStore.lifecycle.test.ts`
- `tests/store/player/audioEvents.test.ts`
- `tests/store/player/ipcHandlers.test.ts`
- `tests/store/player/playbackActions.test.ts`

### 第三阶段

1. 修复主进程对渲染层的反向依赖
2. 建立启动、IPC、服务层、列表渲染的可观测性闭环
3. 逐步补齐基于性能和架构边界的回归检查

## 一句话结论

项目现在的主要优化空间，不是再增加一层“像 VS Code 的抽象”，而是把已经存在的抽象真正统一、落地并覆盖关键热路径。
