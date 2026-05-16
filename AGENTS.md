# AGENTS.md

LUO Music 是一个同时支持 Web 与 Electron 桌面端的 Vue 3 音乐播放器项目。

## 快速参考

- 包管理器：`npm`（使用 `package-lock.json`）
- 环境：Windows 优先；`package.json` 当前约束 `node >=22.x`，团队推荐 Node 24+ / npm 10+
- 常用命令：
  - `npm run dev:web`
  - `npm run dev:electron`
  - `npm run build:web`
  - `npm run build:electron`
  - `npm run test:run`
  - `npm run lint`
  - `npm run format:check`
  - `npm run format:oxfmt:check`
  - `npm run typecheck`
- 默认规则：
  - 新增逻辑优先使用 TypeScript，避免扩散 `any`
  - `src/*` 导入优先使用 `@/`
  - 渲染进程禁止直接调用 Node / Electron，统一走 preload / IPC / `src/platform`
  - 开发工具配置优先放 `.config/`，共享构建逻辑放 `config/`

## 始终遵守

- 模块边界：
  - `src/api/` 只做请求与响应适配
  - `src/platform/` 负责运行时差异收口
  - `src/store/` 负责共享状态
  - `src/components/` 以展示和交互为主
  - `electron/` 只放主进程与 preload 逻辑
  - `.config/` 只放开发工具配置和本地运行环境文件
  - `config/` 只放构建共享逻辑和 Sentry 构建环境文件
- 服务访问默认走 `services.xxx()`；构造注入和 `deps` 注入的例外规则见服务层文档
- Vite / Vitest / Playwright / Prettier / Oxfmt / lint-staged 入口如需显式配置，优先使用 `.config/` 下对应文件
- 本地开发和构建脚本如需加载环境变量，优先使用 `--env-file .config/.env`

## 详细指南

- [架构边界与任务入口](docs/agent/architecture.md)
- [TypeScript、命名与文档规则](docs/agent/typescript-style.md)
- [Electron、构建与提交流程](docs/agent/electron-workflow.md)
- [构建参考](docs/build.md)
- [测试参考](docs/testing.md)
- [服务层 / DI 规则](docs/service-layer.md)
