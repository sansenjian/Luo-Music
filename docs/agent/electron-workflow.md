# Electron、构建与提交流程

## Electron 约束

- 主进程产物为 CJS，源码保持 ESM 兼容。
- 路径处理统一收敛到 `electron/utils/paths.ts`。
- 构建关键路径中不要裸用 `__dirname`。
- preload 路径优先使用统一路径工具或 `fileURLToPath` 处理。
- IPC 通道必须在 preload 中显式暴露，禁止依赖 `contextIsolation: false`。
- 不要假设 Web 与 Electron 完全一致，差异统一收口到适配层。

## 依赖与环境

- 使用 `npm` 管理依赖，提交时保持 `package-lock.json` 一致。
- 修改依赖前先检查根级 `overrides`，避免覆盖既有约束。
- 安装或构建异常时，先核对 `package.json` 里的 `engines`。

## 构建入口

- `npm run build:web`
- `npm run build:electron`
- `npm run build:electron:portable`
- `npm run build:server`

详细构建矩阵见 [docs/build.md](../build.md)。

## 常见排查

### Electron 白屏或 404

- `electron/vite.config.ts`
- `electron/forge.config.ts`
- `electron/utils/paths.ts`
- `electron/WindowManager.ts`

### preload / 路径 / 打包异常

- `package.json`
- `electron/vite.config.ts`
- `electron/utils/paths.ts`
- `electron/main/index.ts`
- `electron/WindowManager.ts`

## 提交前检查

### 常规改动

```bash
npm run test:run
```

### 构建 / Electron / 路径改动

```bash
npm run test:run
npm run build:web
npm run build:electron
```

### 文档改动

```bash
npm run docs:build
```

## 不要做

- 不要硬编码 preload、main、server 产物名。
- 不要在前端渲染进程直接调用 Node / Electron 主进程能力。
- 不要绕过现有请求层、错误处理层与平台适配层直接在页面堆逻辑。
- 不要在迁移中的模块上做与当前任务无关的大范围重构。
