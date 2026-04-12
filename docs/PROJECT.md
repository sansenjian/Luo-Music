# 项目概览

LUO Music 是一个面向 Web 与 Electron 双端的音乐播放器项目，当前主线技术栈为 Vue 3、Vite 7、Pinia 3、TypeScript 5、Electron 40 和 Vitest 4。

## 运行形态

| 形态            | 用途                 | 关键命令                                          |
| --------------- | -------------------- | ------------------------------------------------- |
| Web 渲染端      | 浏览器开发与静态部署 | `npm run dev` / `npm run build:web`               |
| Electron 桌面端 | 桌面应用开发与打包   | `npm run dev:electron` / `npm run build:electron` |
| 本地服务端      | 本地 API 聚合与代理  | `npm run server` / `npm run build:server`         |
| 文档站          | 开发文档与归档材料   | `npm run docs:dev` / `npm run docs:build`         |

## 当前技术栈

| 技术           | 版本              |
| -------------- | ----------------- |
| Vue            | 3.5.29            |
| Vite           | 7.3.2             |
| Pinia          | 3.0.4             |
| Electron       | 40.8.5            |
| TypeScript     | 5.9.3             |
| Vitest         | 4.1.2             |
| Electron Vite  | 5.0.0             |
| Electron Forge | 7.11.1            |
| VitePress      | 见 `package.json` |

## 目录职责

### 核心源码

| 目录               | 职责                                   |
| ------------------ | -------------------------------------- |
| `src/api/`         | 平台接口封装、请求参数与响应适配       |
| `src/platform/`    | 网易云 / QQ 音乐平台适配层             |
| `src/store/`       | Pinia 全局状态                         |
| `src/composables/` | 组合式逻辑与副作用编排                 |
| `src/components/`  | 展示与交互组件                         |
| `src/views/`       | 页面层组装                             |
| `src/utils/`       | 请求、错误处理、播放器、缓存等基础能力 |
| `src/services/`    | 服务注册表与运行时能力组织             |

### Electron 侧

| 目录                | 职责                     |
| ------------------- | ------------------------ |
| `electron/main/`    | 主进程入口与窗口生命周期 |
| `electron/ipc/`     | IPC 注册与桥接           |
| `electron/sandbox/` | preload / sandbox 暴露层 |
| `electron/service/` | 本地服务端调度能力       |
| `electron/utils/`   | 路径与 Electron 工具函数 |

### 工程化与文档

| 目录       | 职责                            |
| ---------- | ------------------------------- |
| `scripts/` | 构建、清理、运行辅助脚本        |
| `tests/`   | 单测、E2E、脚本与 Electron 测试 |
| `docs/`    | 项目文档站与计划 / 报告归档     |
| `build/`   | 构建产物输出                    |
| `out/`     | Electron 打包产物               |

## 模块边界

- `src/api/` 只处理请求、响应和类型，不承载视图逻辑。
- `src/platform/` 负责平台差异收敛，不直接耦合 UI。
- `src/store/` 维护全局共享状态，避免多源状态重复维护。
- `src/components/` 保持展示与交互职责，平台逻辑优先下沉到 composable / store / service。
- `electron/` 仅运行在主进程或 preload 环境，渲染进程必须经由 preload / IPC 访问桌面能力。

## 构建产物

| 目标                      | 输出              |
| ------------------------- | ----------------- |
| Web                       | `build/`          |
| Electron 主进程 / preload | `build/electron/` |
| 本地服务端                | `build/service/`  |
| Electron 安装包           | `out/make/`       |
| Electron portable         | `out/portable/`   |

## 推荐阅读

- [快速开始](/guide/getting-started)
- [构建与发布](/guide/build-and-release)
- [请求层说明](/architecture/request-layer)
- [服务层设计](/architecture/service-layer)
