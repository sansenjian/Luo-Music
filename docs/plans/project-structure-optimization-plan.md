# 项目结构优化详细规划

## 背景

LUO Music 当前已经形成 Vue 3 + Vite + Electron 双端工程结构，核心分层包括 `src/api/`、`src/platform/`、`src/services/`、`src/store/`、`src/composables/`、`src/components/` 与 `electron/`。

本次审查结论是：项目不是缺少结构，而是功能扩张后出现了几个结构性压力点：

- Electron 主进程大量复用 `src/platform/contracts/*` 与 `src/types/*`，共享合同放在渲染层目录下，边界不够中立。
- `components/`、`composables/`、`utils/` 文件数量持续增长，按技术类型分层已经不足以表达功能归属。
- 部分 Vue SFC、store 与 Electron service 文件严重超标，维护时需要同时理解 UI、状态、副作用和协议细节。当前实测行数：`playerStore.ts` 1,219 行、`PluginManagerSection.vue` 1,171 行、`LikedSongsView.vue` 966 行、`HomeSidebar.vue` 903 行、`UserAvatar.vue` 780 行、`electron/local-library/service.ts` 736 行。
- 根目录和文档存在漂移，例如 `.projectstructure` 仍是旧版结构快照，`docs/agent/typescript-style.md` 的根目录规则与实际不完全一致。
- 根 `api/` 与 `src/api/` 名称相近但职责不同：根 `api/` 是 Vercel Serverless Function 部署入口，`src/api/` 是渲染侧业务请求适配层。

## 目标

### 执行原则

- 先收口边界，再移动功能目录，最后清理兼容层。
- 每个阶段必须有可回滚的最小提交；同一提交不同时做文件移动和行为重构。
- 共享合同迁移优先于 feature 收拢，避免把旧的跨进程依赖带进新目录。
- 借鉴 VS Code 的依赖方向和运行时隔离，不照搬它的完整实例化体系。

### 主要目标

1. 把跨运行时共享合同从渲染层实现目录中剥离出来。
2. 让大型功能按业务域聚合，降低从组件、composable、store 之间来回跳转的成本。
3. 拆分胖模块，明确容器、展示、状态、副作用、协议适配的职责边界。
4. 更新文档结构索引，保证新成员看到的目录说明与实际仓库一致。
5. 在迁移过程中保持行为稳定，避免一次性大范围移动导致测试、打包和 Git 历史难以追踪。

### 非目标

- 不在本轮引入 monorepo workspace 管理，除非后续 `packages/` 下包数量继续增长。
- 不重写播放器、插件、本地音乐或 IPC 的业务行为。
- 不把所有文件一次性迁移到 `features/`。
- 不为了目录统一而移除仍有兼容价值的 legacy API；兼容层需要单独制定移除条件。

## 现状摘要

### 关键决策

| 决策                    | 结论                                                        | 原因                                                                                                            |
| ----------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 根 `api/` 是否迁移      | 暂不迁移，只强化文档和边界检查                              | Vercel 文件路由依赖根 `api/` 约定，移动成本高且收益低                                                           |
| shared 放在哪里         | 新建 `packages/shared`，不继续放在 `src/platform/contracts` | Electron、preload、renderer 都会使用，放在 `src` 下语义偏渲染层。注意：`packages/shared` 当前不存在，需从零创建 |
| 是否引入完整 VS Code DI | 不引入                                                      | 当前 `services.xxx()` + 热点模块显式 `deps` 已满足项目规模                                                      |
| feature 收拢粒度        | 只收拢成规模业务域                                          | 避免为了目录统一制造碎片化                                                                                      |
| 兼容层处理              | 允许短期 re-export，必须有移除条件                          | 降低迁移风险，防止兼容层长期失控                                                                                |

### 最短执行路线

| 顺序 | 工作                                                                 | 完成后收益                               |
| ---- | -------------------------------------------------------------------- | ---------------------------------------- |
| 1    | 对齐 README、agent 文档、项目概览和结构规划                          | 新成员和自动化代理不再误判目录职责       |
| 2    | 创建 `packages/shared` 骨架并迁移 protocol/config/log/audio 等纯合同 | 主进程不再反向依赖渲染层合同目录         |
| 3    | 增加结构边界检查脚本                                                 | 防止 Electron 再次导入 renderer 私有模块 |
| 4    | 迁移 `home` 到 `src/features/home`                                   | 验证 feature 收拢模式，风险相对最低      |
| 5    | 拆分 `PluginManagerSection.vue` 或 `playerStore.ts`                  | 处理最高维护成本的胖模块                 |
| 6    | 清理 shared 迁移留下的 re-export                                     | 让新旧路径不长期并存                     |

### 当前主要目录职责

| 目录                   | 当前职责                                                             | 问题                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/`             | 渲染侧请求与响应适配                                                 | 与根 `api/` 名称接近，且部分请求仍未统一服务入口                                                                                                   |
| `src/platform/`        | Web / Electron 差异、音乐平台适配、共享 contracts                    | contracts 被 Electron 复用，目录语义偏渲染层                                                                                                       |
| `src/services/`        | 服务注册、服务访问入口、DI 边界                                      | 路线清晰，主要风险是后续新增旁路入口                                                                                                               |
| `src/store/`           | Pinia 全局状态                                                       | `playerStore.ts` 高达 1,219 行，入口与子模块边界可继续收敛                                                                                         |
| `src/composables/`     | 页面逻辑、副作用、可复用状态编排                                     | 约 55 个文件，功能归属需要更清晰                                                                                                                   |
| `src/components/`      | Vue 展示与交互组件                                                   | 约 67 个文件，部分 SFC 过大（`PluginManagerSection.vue` 1,171 行、`LikedSongsView.vue` 966 行、`HomeSidebar.vue` 903 行、`UserAvatar.vue` 780 行） |
| `electron/`            | 主进程、preload、IPC、本地库、插件宿主                               | 对 `src` 共享类型依赖较多                                                                                                                          |
| `packages/plugin-sdk/` | 插件 SDK                                                             | 已经具备包化迹象，但 shared 合同尚未独立                                                                                                           |
| 根 `api/`              | Vercel Serverless Function 路由，承载 `/api/*` 与 `/qq-api` 部署入口 | 与 `src/api/` 容易混淆                                                                                                                             |
| `docs/`                | VitePress 文档站                                                     | 部分历史结构文档和实际代码不同步                                                                                                                   |

### 结构风险等级

| 风险                                | 等级 | 说明                                                                                                             |
| ----------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| Electron 依赖 `src` contracts/types | 高   | 进程边界和目录语义不清，后续主进程构建容易被渲染侧改动影响                                                       |
| 大型组件和 store                    | 高   | `playerStore.ts` 1,219 行、`PluginManagerSection.vue` 1,171 行等，改一处功能需要理解过多上下文，测试定位成本升高 |
| 功能目录分散                        | 中   | 页面、组件、composable、store 分散，影响功能级迭代效率                                                           |
| 文档漂移                            | 中   | 新成员和自动化代理容易按旧目录做错误判断                                                                         |
| 根目录命名歧义                      | 中   | 根 `api/` 与 `src/api/` 需要明确说明，避免把部署 handler 当作业务 API 层                                         |

## 目标目录形态

### 阶段性目标结构

```text
luo_music_new/
  api/                         # Vercel Serverless Function 路由，只服务部署入口
  config/                      # Vite / packaging 共享配置
  docs/                        # VitePress 文档站
  electron/                    # Electron main / preload / IPC / host 能力
  packages/
    plugin-sdk/                # 插件开发 SDK
    shared/                    # 跨 renderer / preload / main 的共享合同（待新建）
      common/                  # 待新建：通用基础工具
      contracts/
      protocol/
      types/
  plugins/
    built-in/
    third-party/
    examples/
  scripts/
  server/                      # 本地 API 服务入口
  src/
    app/                       # 应用启动、全局扩展、bootstrap，可选阶段引入
    api/                       # 渲染侧 API 适配
    assets/
    base/                       # 待新建：由 src/utils/ 逐步演化的通用基础设施
    components/                # 真正跨功能复用的展示组件
    composables/               # 真正跨功能复用的 composable
    features/
      home/
        components/
        composables/
        types.ts
      user-center/
        components/
        composables/
        types.ts
      player/
        components/
        composables/
        store/
      local-library/
        components/
        composables/
      plugins/
        components/
        composables/
    platform/                  # 运行时适配实现，不再承载跨进程公共合同
    services/
    store/                     # 全局 store 入口和跨功能 store
    types/                     # 渲染层专用类型，逐步减少跨进程类型
    utils/                     # 跨功能纯工具和低层工具
```

### 最小落地原则

- `packages/shared` 先只承载已经被 `electron/` 和 `src/` 同时使用的类型、协议和常量。
- `features/` 只迁移已经明显成规模的功能域，不迁移单文件小模块。
- `src/components/` 保留真正通用组件，例如全局 toast、modal 基座、基础播放器展示件。
- `src/composables/` 保留跨页面复用 composable，例如窗口、媒体会话、主题资源等。
- 原路径可以短期保留 re-export 桥接，但每个桥接文件必须写明移除条件。

## 与 VS Code 结构对比

参考 [VS Code 官方 Source Code Organization](https://github.com/microsoft/vscode/wiki/source-code-organization)，VS Code 的 core 位于 `src/vs/`，主层级包括 `base`、`platform`、`editor`、`workbench`、`code` 和 `server`；同一层内部再按 `common`、`browser`、`node`、`electron-browser`、`electron-main` 等运行时拆分。LUO Music 不需要照搬它的完整体量，但可以借鉴三个核心原则：

1. 共享基础能力必须比业务层更底层。
2. 运行时专属代码要通过目录和 import 规则隔离。
3. 大功能应以贡献 / feature 形式接入主应用，而不是让主入口直接依赖所有内部细节。

### 分层映射

| VS Code 层级                        | VS Code 职责                                   | LUO Music 当前对应                                                          | 当前差距                                                                                     | 建议动作                                                                         |
| ----------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/vs/base/common`                | 平台无关基础工具、事件、生命周期               | 当前无 `src/base/`，对应代码在 `src/utils/` 中                              | 纯基础能力和业务工具仍混在 `utils`，`src/base/` 需新建                                       | 新建 `src/base/common/` 只放通用基础设施；业务工具继续留在 `utils` 或 feature 内 |
| `src/vs/base/browser` / `base/node` | 浏览器或 Node 专属基础能力                     | `src/platform/web/`、`electron/utils/`、部分组件 DOM helper                 | 运行时维度没有统一命名，浏览器 / Node 能力分散                                               | 不强行改名，但新增代码要明确落在 `platform`、`electron` 或 `packages/shared`     |
| `src/vs/platform`                   | 服务接口、DI、跨 workbench/code 复用的基础服务 | `src/services/`、`src/platform/`                                            | 服务层和平台适配层已经存在，但 shared contracts 放在 `src/platform` 中，被 Electron 反向依赖 | 将跨端协议抽到 `packages/shared`；保留 `services.xxx()` 作为默认服务入口         |
| `src/vs/workbench`                  | 主 UI 工作区、核心服务和 contrib 功能          | `src/views/`、`src/components/`、`src/composables/`、未来 `src/features/`   | 当前按技术类型聚合，功能归属需要跨目录查找                                                   | 用 `src/features/<feature>/` 承载首页、用户中心、本地音乐、插件管理等大功能      |
| `src/vs/workbench/contrib`          | 功能贡献，外部不依赖 contrib 内部细节          | 未来 `src/features/*`                                                       | 还没有 feature 级 public API 和私有边界                                                      | 每个 feature 暴露少量入口文件，禁止其他 feature 直接引用内部组件                 |
| `src/vs/code/electron-main`         | 桌面入口、主进程组装                           | `electron/main/`、`electron/WindowManager.ts`、`electron/ServiceManager.ts` | Electron 结构已接近，但仍引用 `src` 下共享类型                                               | Electron 只依赖 `@shared/*`、自身模块和必要第三方                                |
| `src/vs/code/electron-sandbox`      | preload / sandbox 桥接                         | `electron/sandbox/`                                                         | 已有 `window.services` 和 legacy bridge，仍存在兼容层                                        | 保留服务化 bridge，逐步收缩 `legacyElectronApi`                                  |
| `src/vs/server`                     | 远程 / server 入口                             | `server/`、根 `api/`                                                        | LUO 有本地服务端和 Vercel serverless 两套入口，容易混淆                                      | 明确 `server/` 是本地服务端，根 `api/` 是 Vercel Function，不互相替代            |
| `extensions/`                       | 内置扩展和扩展宿主生态                         | `plugins/`、`packages/plugin-sdk/`                                          | 插件体系已经有 manifest 和 SDK，但 feature 接入边界仍需固化                                  | 插件只通过 SDK、服务层和标准模型接入，不直接 import renderer store               |

### 运行时边界对比

| VS Code 运行时目录           | 允许能力                             | LUO Music 建议对应                                          | 约束                                            |
| ---------------------------- | ------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------- |
| `common`                     | 基础 JS / TS，无 DOM、Node、Electron | `packages/shared/*`、`src/base/common/*`（待新建）          | 不依赖 Vue、Pinia、DOM、Electron、Node-only API |
| `browser`                    | DOM 和 Web API                       | `src/platform/web/*`、Web 专用 composable                   | 不直接调用 Electron / Node 能力                 |
| `node`                       | Node API                             | `server/`、构建脚本、部分 Electron utility                  | 不被浏览器渲染层直接导入                        |
| `electron-main`              | Electron 主进程 API                  | `electron/main/*`、`electron/ipc/*`、`electron/*Manager.ts` | 不依赖 renderer feature、component、store       |
| `electron-browser` / sandbox | DOM + preload 暴露能力               | `electron/sandbox/*`、`src/platform/electron/*`             | 只通过显式 bridge / IPC 暴露能力                |

### 关键差异

| 维度        | VS Code 做法                                                            | LUO Music 当前状态                                     | 结论                                          |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------- |
| 规模        | 超大型编辑器平台，拥有 editor、workbench、extension host、remote server | 中型音乐播放器，双端 + 插件 + 本地音乐                 | 不能照搬所有抽象，只借鉴边界规则              |
| DI          | `platform` 层提供服务标识符、构造注入和 instantiation service           | 当前路线是 `services.xxx()` 默认 + 热点模块显式 `deps` | 继续保持现路线，不为“像 VS Code”而扩散重型 DI |
| 功能接入    | 大量功能放在 `workbench/contrib`，通过贡献入口注册                      | 功能散落在 components/composables/store                | 用 `features/` 学习 contrib 的边界思想        |
| 跨端共享    | 通过 `common` 和环境目录控制依赖方向                                    | contracts/types 仍在 `src` 下被 Electron 复用          | `packages/shared` 是最直接的改进点            |
| 插件生态    | 扩展宿主进程 + extension API                                            | 插件 SDK + Electron 插件宿主                           | 继续强化 SDK/标准模型，不让插件穿透 store     |
| Server 入口 | `server` 是远程开发入口                                                 | `server/` 本地服务端，根 `api/` Vercel Function        | 必须写清两个 server 概念的差异                |

### 可借鉴但不照搬

可以借鉴：

- `base/common` 的纯基础设施理念。
- `platform` 作为服务接口和跨层能力边界的定位。
- `workbench/contrib` 的功能贡献边界，用 `features/` 做轻量版本。
- `common/browser/node/electron-main` 的运行时依赖方向。
- 桌面、Web 入口区分清楚，共享代码只放在 shared/common 路径。

不建议照搬：

- 全量 `IInstantiationService` 和构造注入体系。
- `editor/workbench/code/server` 的完整层级数量。
- 为每个小功能都创建 contribution 注册链。
- 把现有 Pinia / Vue Composition API 业务代码强行改成 VS Code class service 风格。

## 分阶段执行计划

### Phase 0：文档与边界固化

#### 目标

在移动代码前，先让文档、命名和评审规则一致，降低后续迁移误判。Phase 0 的文档清理可快速收尾（1-2 次提交），不阻塞 Phase 1 的 shared alias 配置。

- 不需要业务代码改动。
- 只允许修改 README、docs 和架构规则文档。

#### 任务

1. 更新 README 的项目结构，补充 `packages/`、`plugins/`、`config/`、根 `api/` 的职责。
2. 先用 `rg` 搜索仓库中是否有文件或脚本引用了 `.projectstructure`，确认无活跃引用后删除或重写，避免它继续提供旧版 JS 结构快照。
3. 修正 `docs/agent/typescript-style.md` 中“根目录仅保留 `AGENTS.md` 和 `README.md`”的规则，使其符合当前仓库现实。
4. 在 `docs/agent/architecture.md` 中明确：
   - 根 `api/` 是部署路由，不是渲染层 API。
   - `src/api/` 是渲染侧请求适配。
   - `server/` 是本地 API 服务端，不等同于 Vercel Serverless Function。
   - 跨 Electron / renderer 的协议不应继续扩散在渲染实现目录中。
5. 给 `packages/shared` 迁移制定命名规则：优先 `@shared/*`，禁止 Electron 新增 `@/components`、`@/store`、`@/composables` 依赖。
6. 审计 `src/utils/` 目录：标记哪些是纯基础工具（不依赖 Vue/DOM/Electron，后续可迁入 `src/base/common/`），哪些是业务工具（留在 `utils` 或随 feature 迁移），为后续 `src/base/` 的建立提供依据。

#### 退出条件

- README、agent 文档和 VitePress 索引能说明当前真实目录职责。
- 新增评审规则可以判断 Electron 依赖 `src` 时是否合理。
- `git diff --check` 通过。

#### 建议验证

```bash
npm run docs:build
```

### Phase 1：抽离跨运行时共享合同

#### 目标

把 Electron、preload、renderer 共同依赖的协议、常量、schema 和类型放到中立目录，先解决最高优先级的边界问题。

#### 准入条件

- Phase 0 的文档清理（README、`.projectstructure`）已完成。
- `@shared/*` 的 tsconfig alias 配置与 Phase 1 第一步合并执行，不单独阻塞。
- 先确认 `packages/shared` 目录骨架已创建（`package.json`、`tsconfig.json`、各子目录的 barrel export），再开始迁移内容。
- `tsconfig`、Vite、Electron Vite、Vitest 的 alias 更新策略已确认。
- 先选纯类型 / 常量模块，不从复杂 schema 开始。

#### 迁移范围

优先迁移这些当前被 `electron/` 依赖的模块：

| 当前路径                                                                    | 目标路径建议                            |
| --------------------------------------------------------------------------- | --------------------------------------- |
| `src/platform/contracts/protocol/`（目录，含 `channels.ts`、`cache.ts` 等） | `packages/shared/protocol/`（整体迁移） |
| `src/platform/contracts/ipc.ts`                                             | `packages/shared/contracts/ipc.ts`      |
| `src/platform/contracts/config.ts`                                          | `packages/shared/contracts/config.ts`   |
| `src/platform/contracts/log.ts`                                             | `packages/shared/contracts/log.ts`      |
| `src/platform/contracts/audio.ts`                                           | `packages/shared/contracts/audio.ts`    |
| `src/platform/contracts/netease.ts`                                         | `packages/shared/contracts/netease.ts`  |
| `src/platform/contracts/sandbox.ts`                                         | `packages/shared/contracts/sandbox.ts`  |
| `src/types/localLibrary.ts`                                                 | `packages/shared/types/localLibrary.ts` |
| `src/types/schemas.ts` 中跨进程使用部分                                     | `packages/shared/types/schemas.ts`      |

#### 批次建议

| 批次 | 范围                                                            | 原因                               |
| ---- | --------------------------------------------------------------- | ---------------------------------- |
| 1    | `protocol/` 目录（`channels.ts`、`cache.ts` 等）                | 纯常量和类型，影响面清晰           |
| 2    | `contracts/config.ts`、`contracts/log.ts`、`contracts/audio.ts` | 多端共享但业务逻辑少               |
| 3    | `contracts/ipc.ts`、`contracts/sandbox.ts`                      | preload / IPC 面更广，需要集中验证 |
| 4    | `types/localLibrary.ts`、`types/schemas.ts` 的跨端部分          | 类型影响范围最大，放最后           |

#### 执行顺序

1. 创建 `packages/shared` 目录骨架：`package.json`（name: `@luo/shared`）、`tsconfig.json`、各子目录（`common/`、`contracts/`、`protocol/`、`types/`）及 `index.ts` barrel export。如果后续需要迁移的内容已在 Phase 0 的 `src/utils/` 审计中有对应的 `common/` 候选，则在本步骤迁移入 `packages/shared/common/`。
2. 更新 `tsconfig.json` paths：

```json
{
  "paths": {
    "@shared/*": ["packages/shared/*"]
  }
}
```

3. 先迁 protocol 和纯常量，避免一开始触碰复杂 schema。
4. 更新 Electron import，从 `@/platform/contracts/*` 改为 `@shared/*`。
5. 更新 renderer import，优先改底层服务和平台适配层，页面组件可通过旧 re-export 过渡。
6. 保留 `src/platform/contracts/*` 的短期 re-export，标注 deprecated，后续 Phase 4 删除。
7. 运行类型检查、Electron 相关测试和 IPC 测试。

#### 退出条件

- Electron 主进程不再从 `@/components`、`@/store`、`@/composables`、`@/views` 导入任何内容。
- Electron 对 `@/types` 和 `@/platform/contracts` 的依赖数量明显下降，新增代码只允许用 `@shared/*`。
- `packages/shared` 内不依赖 Vue、Pinia、Electron、DOM API。
- 每批迁移都有对应测试或构建验证记录。

#### 建议验证

```bash
npm run typecheck
npm run test:run -- tests/electron tests/platform
npm run build:electron:bundle
```

### Phase 2：按 feature 收拢大型业务域

#### 目标

降低功能开发时的目录跳转成本，让页面组件、局部 composable、局部类型和局部展示组件靠近。

#### 准入条件

- Phase 1 至少完成 protocol/contracts 的主要迁移，避免把旧 shared 路径带入 feature。
- 目标 feature 有清晰边界和对应测试。
- 当前阶段只移动文件和修 import，不做行为重构。

#### 迁移候选

| 功能域       | 当前主要位置                                                                              | 目标                          |
| ------------ | ----------------------------------------------------------------------------------------- | ----------------------------- |
| 首页         | `src/components/home/`、`src/composables/home/`、`src/views/Home.vue`                     | `src/features/home/`          |
| 用户中心     | `src/components/user/`、`src/composables/user-center/`、`src/views/UserCenter.vue`        | `src/features/user-center/`   |
| 插件管理设置 | `src/components/settings/PluginManagerSection.vue`、`src/composables/usePluginManager.ts` | `src/features/plugins/`       |
| 本地音乐     | `src/components/home/local-music/`、`src/composables/local-library/`                      | `src/features/local-library/` |
| 播放器       | `src/components/Player.vue`、`src/store/player/`、`src/utils/player/`                     | 暂缓，等 Phase 3 拆分后再决定 |

#### 执行策略

- 迁移前先对 `src/composables/`（约 55 个文件）做归属审计：标记每个 composable 属于哪个 feature，哪些是真正跨功能复用的，哪些应迁入 `features/`。
- 每次只迁移一个功能域。
- 先迁”已经有子目录”的功能域，例如 `home`，因为路径边界清楚，风险最低，可验证 feature 收拢模式是否可行。
- 迁移时优先保持文件内容不变，只改 import。
- 迁移后再做拆分，不把”移动文件”和”重构逻辑”混在同一提交。
- 对外仍需要复用的组件，保留在 `src/components/` 或创建明确的 re-export。
- 每个 feature 约定一个 `index.ts` 作为 public API，禁止其他 feature 直接引用其内部组件或 composable。

#### Composable 归属判定矩阵

归属审计按以下规则判定每个 composable 的去向，避免主观分歧：

| 条件                             | 归属                                                    | 示例                                                           |
| -------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| 只被一个 feature 的组件/页面引用 | 迁入该 feature                                          | `useHomeRecentPlayPanel.ts` → `src/features/home/composables/` |
| 被 2+ feature 引用               | 留在 `src/composables/`                                 | `useMediaSession.ts`、`useKeyboardShortcuts.ts`                |
| 依赖 Electron/preload 专属 API   | 留在 `src/composables/` 或迁入 `src/platform/electron/` | `useIpcActiveLyricState.ts`、`useDesktopLyricSettings.ts`      |
| 纯通用逻辑，与任何 feature 无关  | 留在 `src/composables/`                                 | `useDeferredMount.ts`、`useSlider.ts`                          |

#### 推荐迁移顺序

1. `home` — 已有 `components/home/` 和 `composables/home/` 子目录，功能边界最清晰，风险最低，用于验证 feature 收拢模式
2. `user-center` — 已有 `composables/user-center/`，边界较清晰
3. `plugins` — 与 `PluginManagerSection.vue` 拆分联动
4. `local-library` — 涉及 Electron 端，需 shared 迁移稳定后再动
5. `player` — 依赖最多、体量最大，等 Phase 3 拆分 playerStore 后再收拢

#### 退出条件

- 新功能开发时，功能专属组件和 composable 优先落在 `src/features/<feature>/`。
- `src/components/` 文件数量逐步下降，只保留跨功能组件。
- `src/composables/` 文件数量逐步下降，只保留跨功能逻辑。
- route 级文件保持轻量，主要负责页面组装。
- 已迁移 feature 有明确 public 入口，其他 feature 不引用其内部组件。

#### 建议验证

```bash
npm run typecheck
npm run test:run -- tests/views tests/components tests/composables
npm run build:web
```

### Phase 3：拆分胖模块

#### 目标

将高行数文件拆成可测试、可替换、职责单一的模块，降低变更风险。

#### 准入条件

- 目标文件已有测试，或本阶段先补最小回归测试。
- 先拆状态和副作用，再拆展示组件。
- 保持外部 API 稳定，调用方不应被迫一次性重写。

#### 优先处理清单

| 文件                                               | 当前行数 | 当前问题                               | 拆分方向                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | -------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/store/playerStore.ts`                         | 1,219    | store facade 承载过多职责              | 保留入口，按职责拆分：`src/store/player/playbackActions.ts`（播放控制动作）、`src/store/player/hydration.ts`（状态恢复）、`src/store/player/ipcBridge.ts`（Electron IPC 通信）、`src/store/player/playlistOps.ts`（播放列表操作）、`src/store/player/errorRecovery.ts`（错误恢复，已有 `playbackErrorHandler.ts`）。当前 `src/store/player/` 已有 `audioEvents.ts`，新模块继续下沉 |
| `src/components/settings/PluginManagerSection.vue` | 1,171    | UI、状态、命令和列表渲染混合           | 拆 `PluginManagerToolbar`、`PluginManagerList`、`PluginManagerInstallDialog`、`usePluginManagerSection`                                                                                                                                                                                                                                                                            |
| `src/components/user/LikedSongsView.vue`           | 966      | 数据查询、列表状态、播放操作和 UI 混合 | 拆 feature composable 与歌曲列表展示组件                                                                                                                                                                                                                                                                                                                                           |
| `src/components/home/HomeSidebar.vue`              | 903      | 导航、拖拽、弹层、集合选择混合         | 拆 sidebar shell、collection menu、resize/position composable                                                                                                                                                                                                                                                                                                                      |
| `src/components/UserAvatar.vue`                    | 780      | 用户资料、菜单、登录状态和弹层混合     | 拆 avatar trigger、profile menu、login actions                                                                                                                                                                                                                                                                                                                                     |
| `electron/local-library/service.ts`                | 736      | 本地库服务流程较长                     | 保持 facade，扫描、同步、迁移、查询协调下沉                                                                                                                                                                                                                                                                                                                                        |

#### 拆分准则

- SFC 拆分优先按”可独立测试的交互块”拆，不按模板长度机械拆。
- 容器 composable 负责状态和命令，展示组件只接收 props/emits。
- store 入口保留外部 API 稳定，内部模块可逐步拆。
- Electron service 保持主 public API 不变，内部通过 helpers 或 coordinator 拆分。
- 每个 fat module 拆分完成后，立即运行该模块关联的测试和构建验证，不攒到阶段末尾集中检查。

#### 退出条件

- 新增或拆出的模块有对应单元测试，至少覆盖命令分发、状态变化或异常路径。
- 大型 SFC 的核心业务逻辑不再直接堆在 `<script setup>` 中。
- 迁移前后用户可见行为一致。

#### 建议验证

```bash
npm run typecheck
npm run test:run -- tests/store/player tests/components tests/electron/localLibrary.service.test.ts
```

### Phase 4：清理兼容层与过渡 re-export

#### 目标

完成前几个阶段后，删除只为迁移存在的桥接路径，避免新旧结构长期并存。

#### 准入条件

- 对应新路径已稳定至少一个阶段。
- `rg` 确认旧路径调用方清零或只剩兼容测试。
- 删除前已有替代路径文档。

#### 清理候选

| 候选                                    | 清理条件                                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/platform/contracts/*` re-export    | 先清零所有直接 import（`rg` 确认再无 `from '@/platform/contracts/*'` 引用），再删除 re-export 文件本身；两步分开，不把 re-export 自身算作调用方 |
| `src/types/*` 中跨进程类型              | Electron 和 shared 依赖已迁移完                                                                                                                 |
| `electron/sandbox/legacyElectronApi.ts` | renderer 全部改用 `window.services`，文档和测试覆盖新路径                                                                                       |
| `src/utils/error/legacy.ts`             | 调用方全部切到新 error center 或 services error                                                                                                 |
| `src/utils/player/lyric-parser.ts`      | 旧歌词 API 调用方清零                                                                                                                           |
| `src/store/index.ts` 迁移说明文件       | 不再承担兼容说明价值                                                                                                                            |

#### 退出条件

- `rg "legacy|deprecated|兼容"` 的结果只剩有明确保留原因的条目。
- 删除兼容层不会破坏 Electron、Web、测试和打包。
- 文档中记录已删除路径和替代路径。

#### 建议验证

```bash
npm run typecheck
npm run test:run
npm run build:web
npm run build:electron
```

### Phase 5：约束自动化

#### 目标

把结构规则变成可执行检查，避免后续回退。

#### 准入条件

- shared、feature、API 目录边界已经在文档中稳定。
- 违规样例和白名单策略明确，避免误伤测试与构建脚本。

#### 建议检查

1. 新增脚本检查 Electron 禁止导入渲染实现目录：

```text
electron/** 不允许导入：
- @/components/*
- @/composables/*
- @/views/*
- @/store/*
- @/services/*，除非在白名单中
```

2. 新增脚本检查 `src/features/*` 内部不反向依赖其他 feature 的私有模块。判定规则：每个 feature 约定 `index.ts` 为 public API，脚本检查跨 feature import 时只允许引用 `index.ts` 导出的内容；feature 内非 `index.ts` 文件不允许被其他 feature 导入。
3. 扩展 `scripts/ensure-no-shadow-configs.cjs` 或新增 `scripts/check-architecture-boundaries.cjs`。
4. 在 CI 或 `npm run lint` 前后加入边界检查。

#### API 目录边界检查

新增检查时应明确区分三个入口：

| 路径       | 允许职责                                                                | 禁止事项                                               |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| 根 `api/`  | Vercel Serverless Function handler，服务线上 `/api/*` 和 `/qq-api` 路由 | 被 `src/`、`electron/` 或 `packages/` 作为普通模块导入 |
| `src/api/` | 渲染侧请求封装、参数归一化、响应适配和 API 专用类型                     | 放置 Vercel handler、Node-only serverless 逻辑         |
| `server/`  | 本地开发和 Electron 打包链路使用的 API 服务端                           | 承担 Vercel 文件路由职责                               |

#### 退出条件

- 结构违规能在本地命令中快速暴露。
- 检查规则有白名单文件，避免硬编码散落在脚本里。白名单建议采用如下 JSON 格式，集中存放在 `scripts/architecture-boundaries.whitelist.json`：

```json
{
  "allowedElectronImports": {
    "@shared/*": true,
    "@/platform/contracts/*": "deprecated, migrate to @shared/*",
    "@/types/schemas": "allowed until schemas migration completes",
    "@/types/localLibrary": "allowed until localLibrary migration completes"
  },
  "featurePublicAPI": {
    "src/features/home": ["index.ts"],
    "src/features/player": ["index.ts", "types.ts"]
  }
}
```

- 文档记录违规示例和推荐替代路径。

## 迁移优先级矩阵

| 优先级 | 工作                                             | 依赖                | 收益                            | 风险 |
| ------ | ------------------------------------------------ | ------------------- | ------------------------------- | ---- |
| P0     | 文档同步与 `.projectstructure` 处理              | 无                  | 低风险，立刻减少误导            | 低   |
| P0     | `packages/shared` 抽离 protocol/contracts 第一批 | Phase 0             | 进程边界清晰，降低构建耦合      | 中   |
| P0     | Electron import 切到 `@shared/*` 第一批          | shared 第一批       | 主进程边界更明确                | 中   |
| P1     | 结构边界检查脚本                                 | shared 第一批       | 防止旧依赖方向回流              | 中   |
| P1     | `home` feature 收拢                              | shared 主要路径稳定 | 验证 feature 模式，改动范围清晰 | 中   |
| P1     | `playerStore.ts` 拆分（1,219 行）                | 相关测试可运行      | 全项目最大文件，降低维护成本    | 中高 |
| P1     | `PluginManagerSection.vue` 拆分（1,171 行）      | 相关测试可运行      | 降低大组件维护成本              | 中   |
| P2     | `user-center` / `local-library` 收拢             | `home` 迁移经验沉淀 | 功能归属更明确                  | 中   |
| P2     | legacy re-export 清理                            | 调用方清零          | 减少历史包袱                    | 中高 |
| P3     | player feature 大规模收拢                        | playerStore 拆分后  | 长期收益高                      | 高   |

## 推荐提交切分

1. `docs: align project structure boundaries`
2. `chore(audit): classify composable ownership for feature migration`
3. `chore(shared): create shared package skeleton with barrel exports`
4. `refactor(shared): migrate protocol and constants to shared`
5. `refactor(electron): consume shared protocol contracts`
6. `chore(architecture): check renderer/electron boundaries`
7. `refactor(home): move home modules under feature`
8. `refactor(player): extract playerStore sub-modules from facade`
9. `refactor(plugins): extract plugin manager view model`
10. `refactor(plugins): split plugin manager presentation`
11. `refactor(shared): migrate ipc and sandbox contracts`
12. `refactor(compat): remove deprecated contract re-exports`

## 首轮建议落地范围

第一轮只做 P0，目标是把目录边界变成稳定事实，不碰业务行为：

| 步骤 | 文件范围                                    | 说明                                                                                  |
| ---- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1    | README、`docs/PROJECT.md`、`docs/agent/*`   | 对齐根 `api/`、`src/api/`、`server/`、`packages/shared` 的职责                        |
| 1.5  | `src/composables/`（约 55 个文件）          | 归属审计：标记每个 composable 属于哪个 feature，哪些是跨功能复用的，为 Phase 2 做准备 |
| 2    | `packages/shared/protocol/*`                | 迁移 IPC channel 和 cache 常量                                                        |
| 3    | `electron/**`、`src/platform/**`            | 只改 import，不改行为                                                                 |
| 4    | `scripts/check-architecture-boundaries.cjs` | 检查 Electron 禁止依赖 renderer 私有目录                                              |
| 5    | tests / build config                        | 补 alias 和最小验证                                                                   |

第一轮不做：

- 不移动 `home`、`user-center`、`player` 等 feature。
- 不拆大型 SFC。
- 不删除 legacy bridge。
- 不迁移复杂 schema。

## 风险与回滚策略

| 风险                              | 触发场景                     | 缓解                                                  |
| --------------------------------- | ---------------------------- | ----------------------------------------------------- |
| import 大量变化导致构建失败       | shared 抽离阶段              | 每批迁移一个目录，先保留 re-export                    |
| Vite / electron-vite alias 不一致 | 新增 `@shared/*`             | 同步修改 `tsconfig`、Vite、Electron Vite、Vitest 配置 |
| 测试 mock 路径失效                | 文件移动后测试仍 mock 旧路径 | 先迁源码，再集中迁测试 import                         |
| Git diff 过大难以 review          | 移动与重构混做               | 每次提交只做移动或只做逻辑拆分                        |
| legacy API 被误删                 | 清理阶段缺少调用方统计       | 删除前用 `rg` 和测试确认调用方清零                    |

### 测试迁移策略

- 源码迁移完成后，集中迁移对应测试文件的 import 路径，不与源码迁移混在同一提交。
- `tests/` 目录结构应逐步对齐新的 `features/` 和 `packages/shared/` 布局：`tests/features/<feature>/`、`tests/shared/`。
- 测试 mock 路径需同步更新，尤其注意 `vi.mock()` 中的模块路径。

### 回滚操作清单

| 阶段                    | 回滚操作                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Phase 1（shared 迁移）  | 恢复 `tsconfig` paths 删除 `@shared/*`；re-export 文件仍保留，旧 import 可直接恢复；删除迁移提交 |
| Phase 2（feature 收拢） | 删除 feature 目录，恢复 `src/components/` 和 `src/composables/` 下的原文件（git revert 即可）    |
| Phase 3（胖模块拆分）   | 恢复拆分前文件，保留拆分出的子模块作为未使用代码（安全删除）                                     |
| Phase 4（兼容层清理）   | 恢复被删除的 re-export 和 legacy 文件（git revert）                                              |
| Phase 5（边界检查脚本） | 删除脚本，恢复 `lint` 配置                                                                       |

## 验收总清单

- `docs` 中项目结构说明与真实目录一致。
- `electron/` 新代码不再依赖渲染层实现目录。
- `packages/shared` 不依赖 Vue、Pinia、Electron、DOM API。
- `src/components/`（约 67 个文件）与 `src/composables/`（约 55 个文件）中的功能专属文件逐步迁入 `src/features/*`。
- 700 行以上文件数量减少（当前 6 个），新增复杂逻辑有对应测试。
- 文档站、Web 构建、Electron bundle 和核心测试通过。

## 建议长期目标

长期可以把项目收敛为四条清晰主线：

1. `packages/shared`：跨运行时合同和协议。
2. `electron`：宿主能力、文件系统、IPC、插件执行和本地库。
3. `src/features`：面向用户功能的 renderer 业务模块。
4. `src/services` / `src/platform`：renderer 的能力入口和运行时差异适配。

这样可以保留现有架构的务实路线，同时减少跨层依赖和目录膨胀带来的维护成本。
