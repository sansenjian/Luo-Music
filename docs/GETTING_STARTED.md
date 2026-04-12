# LUO Music 快速开始

本指南面向首次接手 LUO Music 的开发者，目标是在最短路径内把 Web 和 Electron 两条开发链路跑起来。

## 环境要求

- Windows 优先
- Node.js `24+`
- npm `10+`

检查版本：

```bash
node --version
npm --version
```

## 安装依赖

```bash
npm install
```

项目使用 `package-lock.json` 锁定依赖版本，默认按 npm 工作流维护。

## 启动方式

### Web 开发

推荐命令：

```bash
npm run dev
```

这会同时启动：

- 本地 API 服务
- Vite Web 开发服务器

如果只想启动渲染端：

```bash
npm run dev:web
```

如果只想单独启动服务端：

```bash
npm run server
```

### Electron 开发

```bash
npm run dev:electron
```

这会启动：

- Electron 主进程
- preload / renderer 热更新
- 本地 API 服务与桌面窗口

## 常用验证

### 运行测试

```bash
npm run test:run
```

### 类型检查

```bash
npm run typecheck
```

### 文档站构建

```bash
npm run docs:build
```

## 常见工作流

### 只改前端页面

1. `npm run dev`
2. 修改 `src/components/`、`src/views/`、`src/composables/`
3. 提交前至少运行 `npm run test:run`

### 改 Electron / 路径 / 打包

1. `npm run dev:electron`
2. 修改 `electron/`、`forge.config.ts`、`electron.vite.config.ts`、`scripts/build/`
3. 提交前运行：

```bash
npm run test:run
npm run build:web
npm run build:electron
```

## 常见问题

### 依赖安装或 postinstall 异常

先确认 Node 版本满足项目约束，再尝试：

```bash
npm run clean:all
npm install
```

### Electron 白屏或 404

优先检查：

- `electron/main.ts`
- `electron/WindowManager.ts`
- `electron/utils/paths.ts`
- `electron.vite.config.ts`

### 请求失败或登录态异常

优先检查：

- `src/utils/http/`
- `src/utils/error/`
- `src/api/`
- `src/store/userStore.ts`

## 下一步

- [项目概览](/architecture/project-overview)
- [构建与发布](/guide/build-and-release)
- [测试指南](/guide/testing)
- [快速参考](/reference/quick-reference)
