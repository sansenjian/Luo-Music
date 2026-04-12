# 快速参考

## 高频命令

### 开发

```bash
npm install
npm run dev
npm run dev:web
npm run dev:electron
npm run server
```

### 构建

```bash
npm run build:web
npm run build:electron
npm run build:electron:portable
npm run build:server
npm run docs:build
```

### 质量与测试

```bash
npm run test:run
npm run test:coverage
npm run test:e2e
npm run lint
npm run lint:fix
npm run format
npm run typecheck
```

## 关键目录

| 路径               | 用途                      |
| ------------------ | ------------------------- |
| `src/api/`         | 平台 API 封装             |
| `src/platform/`    | 平台适配                  |
| `src/store/`       | Pinia 状态                |
| `src/composables/` | 组合式逻辑                |
| `src/utils/http/`  | 请求层                    |
| `src/utils/error/` | 错误处理                  |
| `electron/`        | Electron 主进程 / preload |
| `scripts/build/`   | 构建与清理脚本            |
| `tests/`           | 测试入口                  |
| `docs/`            | 文档站源码                |

## 产物位置

| 目标                      | 路径              |
| ------------------------- | ----------------- |
| Web 构建                  | `build/`          |
| Electron 主进程 / preload | `build/electron/` |
| Server 构建               | `build/service/`  |
| Electron 安装包           | `out/make/`       |
| Electron 便携版           | `out/portable/`   |

## 常见排查入口

| 问题                | 优先检查                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| Electron 白屏 / 404 | `electron/utils/paths.ts`、`electron/WindowManager.ts`、`electron.vite.config.ts` |
| 请求失败            | `src/utils/http/`、`src/api/`、`src/utils/error/`                                 |
| 播放器行为异常      | `src/store/playerStore.ts`、`src/utils/player/`、`src/components/Player.vue`      |
| 登录态异常          | `src/store/userStore.ts`、`src/composables/useNeteaseLoginProfile.ts`             |
| 文档构建异常        | `docs/.vitepress/config.mts`、`package.json`                                      |

## 环境要求

- Node.js `24+`
- npm `10+`
- Windows 优先

## 推荐验证顺序

1. `npm run test:run`
2. `npm run build:web`
3. `npm run build:electron`
4. 如改动文档站，再跑 `npm run docs:build`
