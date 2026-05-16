# LUO Music

LUO Music 是一个基于 Vue 3、Vite、Electron 和 TypeScript 的音乐播放器项目，同时支持 Web 与桌面端。

核心能力包括网易云 / QQ 音乐搜索与播放、本地音乐库、歌词显示、插件体系、Electron 桌面集成和 Windows 媒体控制。

## 环境要求

- Windows 优先
- Node.js `>=22.x`，推荐 Node 24+
- npm 10+
- 使用 npm 和 `package-lock.json`

## 安装

```bash
npm install --prefer-online
npm run vp:version
```

项目使用本地 `vite-plus` 提供 VP CLI，日常命令通过 npm scripts 调用，不要求全局安装 `vp`。

## 开发

```bash
npm run dev:web
npm run dev:electron
```

`dev:web` 启动 Web 开发服务，`dev:electron` 启动 Electron 桌面开发环境。

## 分支流程

- 默认开发基线是 `dev`，新功能、修复和文档分支都从 `dev` 创建。
- `master` 只作为稳定主分支，必须通过 Pull Request 更新。
- `dev` 也优先通过 Pull Request 更新，减少未验证变更直接进入集成分支。
- 详细流程见 [开发分支流程](./docs/development-workflow.md)。

## 构建

```bash
npm run build:web
npm run build:electron
npm run build:electron:portable
```

构建输出主要目录：

| 目录            | 内容                               |
| --------------- | ---------------------------------- |
| `dist/`         | Web 构建产物                       |
| `build/`        | Electron bundle 和本地服务构建产物 |
| `out/make/`     | Electron 安装包                    |
| `out/portable/` | Electron 便携版                    |

## 测试与质量检查

```bash
npm run test:run
npm run typecheck
npm run lint
npm run format:check
```

涉及 `better-sqlite3` ABI 切换的测试使用专门入口：

```bash
npm run test:native
```

日常完整检查：

```bash
npm run quality
```

## 项目结构

| 路径                   | 说明                                     |
| ---------------------- | ---------------------------------------- |
| `src/`                 | Vue 渲染进程应用                         |
| `electron/`            | Electron 主进程、preload 和桌面端能力    |
| `packages/shared/`     | main / preload / renderer 共享协议与类型 |
| `packages/plugin-sdk/` | 插件 SDK 类型与接口                      |
| `plugins/`             | 插件示例和第三方插件目录                 |
| `server/`              | 本地 API 服务                            |
| `api/`                 | Vercel Serverless API 入口               |
| `docs/`                | VitePress 文档                           |
| `.config/`             | Vite、Vitest、Playwright 等工具配置      |
| `config/`              | 共享构建与打包配置                       |

## 文档

- [开发指南](./docs/guide/index.md)
- [架构设计](./docs/architecture/index.md)
- [参考资料](./docs/reference/index.md)
- [路线图与计划](./docs/plans/index.md)
- [报告归档](./docs/reports/index.md)
- [构建说明](./docs/build.md)
- [测试说明](./docs/testing.md)

## 说明

- 推荐通过 npm scripts 使用 VP，例如 `npm run vp:version`、`npm run vp:help`。
- 如果在 WSL bash 中直接运行 `./node_modules/.bin/vp` 出现 `node: not found`，这是当前 shell 缺少 Linux 侧 Node.js 或 PATH 未暴露导致的问题。可改用 Windows PowerShell 执行 npm scripts，或在 WSL 内安装 Linux 侧 Node.js。
- Electron 相关原生依赖测试和 rebuild 入口不要绕过项目脚本，避免 Node / Electron ABI 状态不一致。

## License

PolyForm-Noncommercial-1.0.0
