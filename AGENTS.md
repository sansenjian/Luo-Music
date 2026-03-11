# AGENTS.md

## 项目速览

- 项目名称：LUO Music
- 技术栈：Vue 3、Vite、Pinia、Electron、TypeScript、Vitest
- 运行环境：Windows 优先，Node.js 24.x，pnpm 优先
- 当前状态：代码库正在从 JavaScript 迁移到 TypeScript，并同时支持 Web 与 Electron 桌面端
- 包管理现状：项目已使用 `pnpm-lock.yaml`，默认按 pnpm 工作流维护

## 快速命令

### 安装依赖

```bash
pnpm install
```

### 开发与构建

```bash
pnpm dev
pnpm dev:web
pnpm dev:electron
pnpm server
pnpm build:web
pnpm build:electron
pnpm test:run
```

### 文档与排查

```bash
pnpm docs:dev
pnpm docs:build
pnpm analyze:deps
pnpm check:unused
```

## 关键目录

| 目录 | 职责 | 注意事项 |
| --- | --- | --- |
| `src/api/` | 音乐平台接口封装 | 必须优先使用 TypeScript，禁止扩散 `any` |
| `src/platform/` | 平台能力抽象 | 不直接耦合 UI |
| `src/store/` | Pinia 状态管理 | 跨组件状态保持唯一数据源 |
| `src/composables/` | 组合式逻辑复用 | 优先沉淀状态编排与副作用逻辑 |
| `src/utils/` | 通用工具与底层能力 | 公共能力优先下沉到这里复用 |
| `src/components/` | 展示与交互组件 | 避免堆积平台逻辑与请求逻辑 |
| `src/views/` | 页面视图 | 页面负责组装，不承载底层平台适配 |
| `src/router/` | 路由入口与页面组织 | 路由变更需关注页面生命周期影响 |
| `electron/` | 主进程与 Preload | 禁止混入前端浏览器逻辑 |
| `electron/utils/paths.ts` | 路径工具 | 构建、打包、路径异常时优先检查这里 |
| `tests/` | 测试目录 | 优先复用现有 mocks 与组织方式 |
| `docs/` | 项目文档与分析材料 | 修改文档结构后补跑文档构建 |
| `scripts/` | 构建辅助脚本 | 包含构建、清理、依赖排查相关逻辑 |

## 核心开发规则

### 1. 模块边界

- `src/api/`：仅负责 HTTP 请求、响应适配与相关类型定义，不承载视图逻辑
- `src/platform/`：负责平台适配器实现，向上层返回统一格式数据，不直接耦合 UI
- `src/store/`：负责跨组件共享状态，不在多个组件内重复维护同一状态源
- `src/components/`：保持纯展示与交互，优先通过 Props 与 Events 通信，避免堆积平台逻辑
- `src/composables/`：优先沉淀可复用的状态编排与副作用逻辑
- `electron/`：仅运行在主进程或 preload 环境，前端渲染进程禁止直接 `require('electron')`

### 2. TypeScript 迁移规范

#### 迁移优先级

- 高优先级：`src/api/`、`src/utils/http/`，属于高风险模块，要求 100% 类型覆盖
- 中优先级：`src/store/`，优先补接口与状态结构，再收紧实现细节
- 低优先级：`src/components/`，优先补齐 Props、Emits 与公开方法类型

#### 通用约束

- 新增逻辑优先使用 TypeScript
- 不要扩散 `any`，优先补充接口、类型别名与函数签名
- 公共模块导出前，保证输入输出类型明确
- 迁移旧 JS 文件时，优先保持行为一致，再做结构优化
- 若必须临时使用宽松类型，限制影响范围，并在后续任务中继续收紧

#### 类型定义位置

- 实体类型优先集中在 `src/types/entities.ts`
- API 专用类型放在对应文件旁，例如 `src/api/xx.types.ts`
- 组件 Props 类型优先使用 `defineProps<{}>()` 内联声明或就近提取

### 3. 命名与文件组织

#### 文件命名

- 组件使用 PascalCase，例如 `LyricFloat.vue`
- 工具与组合式函数使用 camelCase，例如 `usePlayer.ts`
- 类型定义使用驼峰加 `.types.ts`，例如 `api.types.ts`
- 常量使用 kebab-case 加 `.const.ts`，例如 `player-config.const.ts`
- 测试文件与目标文件保持同名语义，使用 `.test.js` 或 `.test.ts`

#### 文档组织

- **根目录**：仅保留 [`AGENTS.md`](./AGENTS.md) 和 [`README.md`](./README.md)
- **docs/ 目录**：所有其他 Markdown 文档都应放在 [`docs/`](./docs/) 目录下
  - 构建文档：`docs/build.md`
  - 迁移指南：`docs/electron-vite-migration.md`
  - 测试文档：`docs/testing.md`
  - API 文档：`docs/api-documentation.md`
  - 组件文档：`docs/components-documentation.md`
  - 错误处理：`docs/error-handling.md`
  - 其他专题文档

#### 导入顺序

- 1 组：框架与第三方库
- 2 组：内部模块与类型
- 3 组：相对路径与样式文件
- 同组内保持稳定顺序，依赖 ESLint 自动修复时遵循工具结果
- 类型导入优先使用 `import type`

### 4. Electron 构建约束

- 产物格式：主进程构建产物为 CJS，源码保持 ESM 兼容
- 路径处理：统一收敛到 `electron/utils/paths.ts`，禁止在构建关键路径中裸用 `__dirname`
- preload 路径处理优先使用 `fileURLToPath` 或统一路径工具完成转换
- IPC 通道必须在 preload 中显式暴露，禁止依赖 `contextIsolation: false`
- 不要假设 Web 与 Electron 运行环境完全一致，平台差异统一收敛到适配层

### 5. 依赖管理

- 优先使用 pnpm，避免 npm 与 pnpm 混用导致锁文件与依赖树漂移
- 发现 `pnpm-lock.yaml` 后，不再新增 `package-lock.json`
- 在 `package.json` 中维护 `engines` 与 `packageManager`，确保团队环境一致
- 当前项目已声明 `engines.node`，后续如继续强化约束，应补充 `engines.pnpm` 与 `packageManager`
- 当依赖安装、锁文件或构建行为异常时，优先检查包管理器版本是否与项目约束一致
- 修改依赖前，先确认是否已有 `pnpm.overrides` 或根级 `overrides` 规则，避免覆盖既有约束

### 6. 状态管理

- 页面级状态放入 Pinia Store 或页面级 composable
- 组件级局部状态使用 `ref`、`reactive` 等局部响应式能力维护
- 播放器、登录、下载等全局状态必须保持唯一 Store，禁止多源维护
- 复杂交互优先拆为 composable 与展示组件，避免单组件持续膨胀
- 样式修改优先局部收敛，避免影响全局播放器与通用组件

### 7. 网络请求与错误处理

- 请求逻辑尽量收敛到 `src/api/` 与 `src/utils/http/`
- 错误处理优先复用 `src/utils/error/` 下的能力，避免在页面与组件内散落重复分支
- 平台接口异常需要区分网络问题、鉴权问题、空数据与平台能力差异
- 请求重试、缓存、取消等通用能力优先复用现有工具，不重复造轮子

### 8. 测试策略

- 修改 `src/store/`、`src/utils/`、`src/platform/` 核心逻辑时，同步补充或更新测试
- 优先为纯函数、适配器、请求工具编写单测
- 修复缺陷时，优先补 1 个可复现问题的测试
- 涉及跨端差异时，优先覆盖平台接口与播放器核心行为
- 新增测试时，优先复用 `tests/mocks/` 与现有测试组织方式

## 常见任务检查点

### Electron 白屏或 404

检查清单：

- `vite.config.ts` 的 `build.outDir` 是否指向 `build/` 目录
- `vite.config.ts` 的 `electron` 插件配置是否正确
- preload 路径在 `WindowManager.ts` 中是否正确配置
- 构建、打包、路径异常时优先检查 `electron/utils/paths.ts`

### Electron 路径、preload、打包配置

优先检查：

- `package.json` - 查看 `electron-vite` 相关脚本
- `vite.config.ts` - Electron 插件配置和输出目录
- `electron/utils/paths.ts` - 路径工具函数
- `electron/main.ts` - 主进程入口
- `electron/preload.js` - Preload 脚本
- `electron/WindowManager.ts` - 窗口管理器（preload 路径配置）

### 构建系统说明

项目使用 `electron-vite` + `Electron Forge` 方案：

| 构建目标 | 工具 | 输出路径 |
|----------|------|----------|
| Electron 主进程 | electron-vite | `build/electron/main.cjs` |
| Preload 脚本 | electron-vite | `build/electron/preload.cjs` |
| 渲染进程 | electron-vite | `build/` |
| API 服务端 | tsup | `build/server/server.cjs` |
| 应用打包 | Electron Forge | `out/` |

### QQ 音乐或平台适配

优先检查：

- `src/api/qqmusic.ts`
- `src/platform/music/qq.ts`
- `src/platform/music/interface.ts`

### 请求层问题

优先检查：

- `src/utils/http/`
- `src/utils/error/`
- `src/api/adapter.ts`

### 播放器逻辑

优先检查：

- `src/store/playerStore.ts`
- `src/utils/player/`
- `src/components/Player.vue`

### 状态与用户数据

优先检查：

- `src/store/`
- `src/composables/`
- `src/components/user/`
- `src/views/UserCenter.vue`

## 提交前检查

至少执行：

```bash
pnpm test:run
```

如修改了构建、Electron 或路径相关逻辑，额外执行：

```bash
pnpm build:web
pnpm build:electron
```

如修改了文档站点或项目文档结构，可补充执行：

```bash
pnpm docs:build
```

## 禁止事项

- 不要在未确认构建输出名称前硬编码 preload、main、server 产物名
- 不要在前端渲染进程直接调用 Node / Electron 主进程能力，必须经过 preload 或 IPC
- 不要在未补充类型的情况下大面积扩散 `any`
- 不要混用 npm 与 pnpm 造成锁文件冲突
- 不要随意恢复已迁移删除的旧模块，除非已确认新模块无法覆盖原能力
- 不要在迁移中的模块上做与当前任务无关的大范围重构
- 不要绕过现有请求层、错误处理层与平台适配层直接在页面中堆逻辑

## 例外处理

以下情况允许偏离上述规范，但必须在 PR 中说明理由：

1. **紧急热修复**：允许临时使用 `any` 绕过类型检查，但需创建技术债记录
2. **第三方库限制**：若库仅提供 CJS 且与 ESM 冲突，允许在 `electron/` 使用 CJS 语法
3. **性能关键路径**：允许在播放器核心使用裸 JS 对象以降低 Proxy 开销，但需注释说明
4. **兼容性修复**：为兼容历史数据结构或平台返回字段，可保留临时适配层，但应限制在边界模块内

## 优化方向

- 后续如继续强化 `AGENTS.md`，优先补充可执行规则，不增加空泛表述
- 若规则继续增多，拆分为专题文档前，先判断是否真的影响单文件可扫描性
- 如要落地更强约束，优先将文档规则同步到 ESLint、TypeScript、测试与构建配置
