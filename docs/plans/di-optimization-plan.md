# 依赖注入优化计划

## 背景

仓库已经具备一套可用的服务基础设施：

- `src/services/registry.ts` 已支持服务注册、单例缓存、循环依赖检测、`activate/deactivate` 生命周期和 `resetServices()`
- `src/services/injector.ts` 已收敛为“显式注解才允许构造注入”的模式
- `src/services/performanceMonitor.ts` 与 [`di-performance-monitoring`](../di-performance-monitoring.md) 已提供可观测性基础

但业务层接入仍然不完整，当前问题不是“没有 DI”，而是“默认路径还不稳定”：

- 业务代码仍存在直接访问 `platform`、`localStorage`、`document` 的情况
- `getPlatformAccessor()` 仍带有隐式 `setupServices()` 行为，边界不够清晰
- `playerStore`、`useHomePage`、`useSearch` 等热点模块仍依赖硬编码 import，测试大量依赖 `vi.mock()`
- 现有 DI 计划过于聚焦单次 `playerStore` 改造，无法覆盖仓库当前的整体 DI 路线

## 架构决策

本轮优化明确采用下面这条路线，不再摇摆：

1. 默认继续使用 `services.xxx()` 作为运行时获取服务的主路径。
2. 对测试敏感、状态复杂、外部依赖多的模块，补充“显式 deps 参数”或“工厂闭包注入”。
3. `@injectParam(...)` 构造注入仅用于基础设施层或明确需要实例化的类，不向 Vue 组件和普通 composable 大面积扩散。
4. 不引入新的完整 IoC 容器，不做 Inversify 化重写，不为了“更像 VS Code”而增加额外框架复杂度。

换句话说，目标是把当前的“最小 DI + service locator”收紧成一条稳定、可测试、可观测的默认路径，而不是升级成重量级容器体系。

## 目标

本次 DI 优化要同时解决四类问题：

1. 降低热点模块对硬编码依赖和模块级单例的耦合。
2. 让平台、存储、API、配置等边界能力优先通过服务层进入业务代码。
3. 降低测试对 `vi.mock()`、`vi.resetModules()` 和动态 import 的依赖。
4. 建立可验证的验收标准，避免 DI 继续停留在“有概念、无落地”的状态。

## 非目标

以下内容不纳入本轮：

- 不把所有 store/composable 都改成构造注入
- 不把所有模块从 Options API 改成 Composition API
- 不一次性重写所有直接依赖浏览器 API 的组件
- 不新增 request scope / child container / 复杂实例化树，除非本轮落地后出现明确阻塞

## 执行进度

更新日期：2026-04-07

后续工作请转到 [`docs/plans/di-followup-roadmap.md`](/plans/di-followup-roadmap)，本文件保持为本轮 Phase 1 到 Phase 3 的完成记录。

- [x] Phase 1.1 `playerStore`：已完成 `createPlayerStore(deps, storeId)` 工厂化改造，默认 `usePlayerStore()` 保持不变；`music/storage/platform/audioManager` 已支持显式注入；相关定向测试已通过。
- [x] Phase 1.2 `useSearch`：已完成 `useSearch(deps?)` 改造，测试已改为直接注入替身 `searchStore`，不再依赖模块级 `vi.mock()`。
- [x] Phase 1.3 `useHomePage`：已完成 `toastStore/searchStore/homeShell` 的显式 deps 注入；测试已改为直接传入替身依赖，去掉对 `useHomeShell` 模块 mock 的依赖。
- [x] Phase 1.4 验证与收尾：本轮涉及的 5 组测试已全部通过，变更文件单独执行 ESLint 通过；仓库级 `typecheck` 与 `lint` 仍存在存量问题，未由本次 DI 改造引入。
- [x] 存量问题清理：已修复 `EventsView.vue`、平台/服务测试类型问题以及 `vite.config.js` 的 ESLint 问题；仓库级 `typecheck` 与 `lint` 已全部通过。
- [x] 依赖警告清理：已定位 `(DEP0147)` 来源为 `@electron-forge/maker-zip -> cross-zip@4.0.1`，新增 `scripts/patch-cross-zip.cjs` 并通过 `postinstall` 持久化替换为 `fs.rm/fs.rmSync`。
- [x] 依赖警告清理补充：已定位 `(DEP0187)` 来源为 `electron-winstaller/lib/sign.js` 在未启用 `windowsSign` 时对未初始化路径调用 `existsSync`；已复用 `scripts/patch-cross-zip.cjs` 在 `postinstall` 中为 `resetSignTool()` 增加空值保护。
- [x] Phase 2.1 服务入口收口：已将 `src/components/LyricFloat.vue` 和 `src/utils/error/center.ts` 从 `getPlatformAccessor()/getPlayerAccessor()` 兼容入口切换到 `services.platform()/services.player()` 主路径；相关测试与 lint 已通过。
- [x] Phase 2.2 存储/默认入口收口：已将 [`src/composables/useIpcActiveLyricState.ts`](./../src/composables/useIpcActiveLyricState.ts) 的 debug 开关读取切换为 `services.storage()`；已将 [`src/store/playerStore.ts`](./../src/store/playerStore.ts) 的默认平台依赖从 accessor 兼容层切回 `services.platform()` 主路径；相关测试与 lint 已通过。
- [x] Phase 2.3 兼容层清理：已删除未再被业务代码使用的 [`src/services/platformAccessor.ts`](./../src/services/platformAccessor.ts) 与 [`src/services/playerAccessor.ts`](./../src/services/playerAccessor.ts)；仓库级 `typecheck` 与 `lint` 已通过。
- [x] Phase 2.4 配置边界收口：已将 [`src/api/qqmusic.ts`](./../src/api/qqmusic.ts) 的生产环境 QQ API fallback 地址从 `QQ_API_SERVER` 常量切换为 `ConfigService` 端口解析；相关测试与 lint 已通过。
- [x] Phase 2.5 API 边界试点：已将 [`src/api/user.ts`](./../src/api/user.ts) 的 Netease 用户请求切换为 `services.api().request('netease', ...)`，并补充模块级测试 [`tests/api/user.test.ts`](./../tests/api/user.test.ts)；相关受影响测试与 lint 已通过。
- [x] Phase 3.1 规则固化：已重写 [`docs/service-layer.md`](../service-layer.md)，明确 `services.xxx()` 默认场景、显式 `deps` 推荐场景、`@injectParam(...)` 限制场景与评审清单。
- [x] Phase 3.2 示例对齐：已重写 [`docs/reference/examples/injector-example.ts`](../reference/examples/injector-example.ts)，示例改为与当前仓库路线一致的三种用法，不再传播过时的 `getService()` / 泛化构造注入建议。
- [x] Phase 3.3 监控口径对齐：已更新 [`docs/di-performance-monitoring.md`](../di-performance-monitoring.md)，补充当前 `services.xxx()` / 显式 `deps` 路线下的回归检查建议。

## 现状归纳

### 已有能力

- 服务标识符：`src/services/types.ts`
- 服务注册与生命周期：`src/services/registry.ts`
- 服务装配入口：`src/services/index.ts`
- 显式构造注入：`src/services/injector.ts`
- 性能监控：`src/services/performanceMonitor.ts`

### 主要缺口

根据 [`service-layer-gap-report`](/reports/service-layer-gap-report) 与 [`vscode-gap-issues`](/reports/vscode-gap-issues)，当前缺口集中在三类：

1. 业务边界未完全收口
   - 仍有模块直接依赖 `platform`、`localStorage`、`document`
   - `getPlatformAccessor()` 仍承担隐式初始化职责

2. 热点模块缺少显式依赖入口
   - `src/store/playerStore.ts`
   - `src/composables/useSearch.ts`
   - `src/composables/useHomePage.ts`

3. 服务层接入深度不足
   - `ApiService`、`ConfigService` 尚未成为业务层默认入口
   - 测试仍大量通过 mock 模块而不是传入替身依赖

## 优化原则

### 1. 优先收口默认路径

新代码优先通过服务层或显式 deps 进入业务模块，避免继续引入“直接 import 环境能力”的新旁路。

### 2. 显式依赖优先用最小接口

`deps` 类型只暴露当前模块真实使用的方法，不传整个 store 或完整 service 类型，降低替身成本。

### 3. 不在模块初始化阶段固化服务实例

避免顶层缓存 `services.xxx()` 返回值，默认改为 getter、工厂参数或 action 内按需读取，保留 `resetServices()` 和 override 的意义。

### 4. 生命周期继续交给 runtime / Disposable 模式

DI 优化不能破坏现有 `PlayerStoreRuntime`、生命周期钩子和服务激活/反激活链路。

### 5. 所有优化都必须可测量

不仅要“代码更优雅”，还要能通过测试复杂度、覆盖率、监控指标和文档约束体现效果。

## 范围与优先级

### P0：热点模块降耦合

优先处理直接影响测试成本和耦合度的模块：

- `src/store/playerStore.ts`
- `src/composables/useSearch.ts`
- `src/composables/useHomePage.ts`
- 对应测试：
  - `tests/store/playerStore.test.ts`
  - `tests/store/playerStore.playSongByIndex.test.ts`
  - `tests/store/playerStore.lifecycle.test.ts`
  - `tests/composables/useSearch.test.ts`
  - `tests/composables/useHomePage.test.ts`

### P1：服务边界收口

逐步替换现有直接环境依赖：

- `src/views/Home.vue`
- `src/components/CacheManager.vue`
- `src/components/LyricFloat.vue`
- `src/components/Player.vue`
- `src/components/SettingsPanel.vue`
- `src/components/UserAvatar.vue`
- `src/App.vue`

重点不是“一次全部改完”，而是优先把平台、存储、配置三类依赖改成统一入口。

### P2：服务层规则补强

在不升级为重型容器的前提下补齐团队约束：

- 明确什么时候用 `services.xxx()`
- 明确什么时候允许 deps 注入
- 明确 `injectParam` 的使用边界
- 为新服务接入增加文档和测试模板

## 分阶段计划

### Phase 0：统一路线与基线

目标：先把“怎么做”说清楚，避免边做边改口径。

输出物：

- 本规划文档更新完成
- 当前热点模块依赖清单
- 当前测试痛点清单
- DI 性能监控基线记录

执行项：

1. 明确仓库 DI 路线为“`services.xxx()` 默认 + 热点模块显式 deps”。
2. 列出仍存在直接环境依赖的热点模块。
3. 将本计划与服务层差距报告、性能监控文档对齐。

完成标准：

- 后续实现不再围绕“是否引入完整容器”反复讨论。
- 规划、差距报告、测试策略三者口径一致。

### Phase 1：改造热点模块

目标：先把收益最大、测试最痛的模块改好。

### 1. `playerStore` 改造

采用“工厂闭包 + 默认导出不变”的方式：

```ts
export type PlayerStoreDeps = {
  getMusicService?: () => Pick<MusicService, 'getSongUrl' | 'getSongDetail' | 'getLyric'>
  getStorageService?: () => Pick<StorageService, 'setItem'>
  getPlatformAccessor?: () => PlatformService
  audioManager?: typeof playerCore
}

export function createPlayerStore(deps: PlayerStoreDeps = {}, storeId = 'player') {
  const resolved = { ...getDefaultPlayerStoreDeps(), ...deps }
  return defineStore(storeId, {
    // state / getters / actions
  })
}

export const usePlayerStore = createPlayerStore()
```

落地要求：

- 保持 `usePlayerStore` 现有调用签名不变
- 将依赖 `music/platform/storage/audioManager` 的 helper 移入工厂闭包
- 模块级仅保留纯函数和类型定义
- 不在模块顶层缓存具体 service 实例

### 2. `useSearch` 改造

为 `useSearch()` 增加可选 `deps`：

```ts
export type SearchComposableDeps = {
  searchStore?: Pick<
    ReturnType<typeof useSearchStore>,
    | 'keyword'
    | 'results'
    | 'totalResults'
    | 'isLoading'
    | 'error'
    | 'server'
    | 'hasResults'
    | 'search'
    | 'clearResults'
    | 'setServer'
    | 'playResult'
    | 'addToPlaylist'
    | 'addAllToPlaylist'
  >
}
```

目标：

- 测试可直接注入最小替身 store
- 去掉对整个 store 模块的强依赖 mock

### 3. `useHomePage` 改造

为 `toastStore`、`searchStore`、`homeShell` 增加最小 deps 注入接口。

目标：

- 将状态编排逻辑与具体 store/composable 实例解耦
- 降低测试对全局 Pinia 和模块 mock 的依赖

Phase 1 验收标准：

- `playerStore` 导出 `createPlayerStore(...)`，默认 `usePlayerStore` 不变
- `useSearch(deps?)` 和 `useHomePage(deps?)` 可接受显式替身依赖
- 目标测试不再依赖大规模 `vi.mock()` + `vi.resetModules()`
- `npm run test:run`、`npm run typecheck`、`npm run lint` 全通过

### Phase 2：清理服务边界旁路

目标：减少“服务层存在，但业务层继续绕开”的情况。

执行项：

1. 平台能力统一收口
   - 新代码优先使用 `services.platform()` 或由上层传入的平台抽象
   - `getPlatformAccessor()` 不再作为推荐默认入口，逐步收缩为兼容层

2. 存储能力统一收口
   - 清理 `localStorage` 直接调用
   - 统一改为 `services.storage()` 或显式注入的 storage 能力

3. 配置能力统一收口
   - 端口、URL、环境差异优先经过 `ConfigService`
   - 先从 QQ / Netease 相关高频入口试点

4. API 能力统一收口
   - 先选择 1 到 2 个高频入口切到 `services.api()` 或 `MusicService`
   - 验证抽象可行后再逐步扩展

Phase 2 验收标准：

- 重点模块不再新增直接 `localStorage` / `document.querySelector` / 原始环境判断
- `platform` / `storage` / `config` / `api` 的新接入优先经过服务层
- 相关模块补齐测试或更新现有测试

### Phase 3：规则固化与文档闭环

目标：防止 DI 方案再次回到半成品状态。

执行项：

1. 补充示例
   - 更新 [`injector-example.ts`](../reference/examples/injector-example.ts) 或服务层文档
   - 给出“默认服务获取”和“显式 deps 注入”的对照示例

2. 固化评审规则
   - 服务依赖是否被模块顶层固化
   - 是否引入了新的环境能力旁路
   - 是否能通过显式 deps 降低测试替身成本

3. 监控回归
   - 使用 [`di-performance-monitoring`](../di-performance-monitoring.md) 记录初始化时间
   - 识别新增服务或迁移后是否引入初始化回归

Phase 3 验收标准：

- 文档中明确三类用法边界：
  - `services.xxx()` 的默认场景
  - `deps` 注入的推荐场景
  - `injectParam(...)` 的限制场景
- 关键示例、测试和评审口径一致

## 详细改造清单

### `playerStore` 需要收口的依赖

| 依赖来源                | 当前形态                 | 目标形态                          |
| ----------------------- | ------------------------ | --------------------------------- |
| `services.music()`      | action/helper 内直接调用 | 改为 `getMusicService()`          |
| `services.storage()`    | action 内直接调用        | 改为 `getStorageService()`        |
| `getPlatformAccessor()` | 模块级 helper 间接调用   | 改为 `getPlatformAccessor()` deps |
| `playerCore`            | 模块级硬编码 import      | 改为 `audioManager` deps          |

### 建议优先迁移的 helper

- `notifyPlayerStateSnapshot()`
- `createPlayerStateSnapshot()`
- `getPlaybackActions()`
- `playSongByIdFromIpc()`
- `toggleCompactMode()`
- `clearPlaylist()`
- `afterHydrate()`

### 可继续保留为模块级纯函数的部分

- `toIpcSerializable()`
- `toPlayMode()`
- `isSameSong()`
- `normalizeLyricTypes()`

## 风险与应对

### 风险 1：`playerStore` 改造面大，容易引入行为回归

应对：

- 保持 `usePlayerStore` 对外签名不变
- 不同时进行 Options API -> Composition API 重写
- 先用测试锁定 `seek`、`togglePlay`、`playSongByIndex`、IPC 同步、hydration 这些高风险路径

### 风险 2：deps 注入扩散过度，导致调用方负担增加

应对：

- 只在热点模块导出工厂或可选 deps 入口
- 普通消费者继续使用默认导出
- deps 类型严格限定为最小接口

### 风险 3：服务层继续被隐式入口削弱

应对：

- 新代码不再新增隐式 `setupServices()` 入口
- 将 `getPlatformAccessor()` 明确标记为兼容层，而不是推荐模式
- PR 评审时检查是否存在新旁路

### 风险 4：优化后没有客观收益

应对：

- 记录迁移前后测试写法变化
- 对比 `vi.mock` 数量、`resetModules` 使用次数和服务初始化指标
- 用测试和监控，而不是“主观感觉更优雅”作为结论依据

## 验收指标

### 代码层

- `playerStore`、`useSearch`、`useHomePage` 完成显式 deps 改造
- 新增业务代码不再引入新的直接环境依赖
- 服务实例不在模块顶层固化

### 测试层

- 目标测试套件使用显式替身依赖替代大规模模块 mock
- 不再依赖 `vi.resetModules()` 才能测通热点路径
- 修复缺陷时优先补可复现测试

### 运行层

- `npm run test:run`
- `npm run typecheck`
- `npm run lint`

### 可观测性

- 关键服务初始化时间无明显回归
- 若单个服务初始化时间超过 100ms，需要补充解释或拆分方案

## 建议执行顺序

1. 先完成 `playerStore` 的工厂化改造和测试迁移。
2. 再完成 `useSearch`、`useHomePage` 的 deps 注入。
3. 随后清理 `platform/storage/config/api` 四类旁路入口。
4. 最后补文档、示例和评审规则，形成闭环。

## 涉及文件

### Phase 1

- `src/store/playerStore.ts`
- `src/composables/useSearch.ts`
- `src/composables/useHomePage.ts`
- `tests/store/playerStore.test.ts`
- `tests/store/playerStore.playSongByIndex.test.ts`
- `tests/store/playerStore.lifecycle.test.ts`
- `tests/composables/useSearch.test.ts`
- `tests/composables/useHomePage.test.ts`

### Phase 2

- `src/views/Home.vue`
- `src/components/CacheManager.vue`
- `src/components/LyricFloat.vue`
- `src/components/Player.vue`
- `src/components/SettingsPanel.vue`
- `src/components/UserAvatar.vue`
- `src/App.vue`
- 涉及 `ConfigService` / `ApiService` 试点落地的相关模块

### Phase 3

- `docs/service-layer.md`
- `docs/reference/examples/injector-example.ts`
- `docs/di-performance-monitoring.md`
- 相关测试与评审说明
