# 测试指南

LUO Music 目前同时使用 Vitest 和 Playwright 覆盖单测、集成测试、脚本测试与 E2E 场景。

## 测试命令

```bash
npm run test
npm run test:run
npm run test:native
npm run test:ci
npm run test:coverage
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:debug
npm run test:e2e:report
npm run typecheck
```

## Vitest and Vite+

项目已经通过本地 `vite-plus@0.1.20` 依赖接入 VP / Vite+ CLI，可用以下命令验证项目本地 CLI：

```bash
npm run vp:version
npm run vp:help
```

Vite+ 迁移期还提供质量检查入口：`npm run vp:lint`、`npm run vp:fmt:check` 与 `npm run vp:check`。这些命令读取根目录 `vite.config.ts` 中的 `lint` / `fmt` / `staged` 配置；应用开发和构建流程继续显式使用 `.config/vite.config.ts`。

单测配置集中在 `.config/vitest.config.ts`，并保留 node / jsdom 两个项目分组。`npm run test`、`npm run test:run`、`npm run test:coverage` 直接调用项目本地 Vitest，用于日常快速反馈和覆盖率统计。

只有真实打开 SQLite 的本地音乐库集成测试默认从快速测试中排除：`tests/electron/localLibrary.repository.test.ts` 和 `tests/electron/localLibrary.service.test.ts`。需要验证 repository / service 与 `better-sqlite3` 的真实集成时，运行 `npm run test:native`；完整 CI 本地复现使用 `npm run test:ci`。

`test:native` 会通过 `scripts/run-vitest-with-native-restore.cjs` 在测试前把 `better-sqlite3` 切到 Node 测试运行时，并在测试后恢复 Electron 运行时，避免 Node / Electron ABI 不匹配。不要用普通 `test:run` 去覆盖 native SQLite 用例。

本地音乐库数据库层已接入 Kysely 生成 typed SQL，但执行仍走 `better-sqlite3` native binding。Kysely compile、mapper、helper、handler、watch coordinator 和 scan engine 的纯逻辑测试应放在普通 `npm run test:run` 中；只有实例化 `LocalLibraryRepository`、打开真实 SQLite 文件或验证 schema 迁移时，才放入 `npm run test:native`。

## 当前测试目录

```text
tests/
  api/
  base/
  components/
  composables/
  constants/
  e2e/
  electron/
  mocks/
  platform/
  scripts/
  services/
  store/
  utils/
  views/
```

## 当前验证基线

截至 `2026-05-12`，最近一次验证结果为：

- `npm run test:run`：`180` 个测试文件通过，`1391` 个测试用例通过
- `npm run test:native`：只覆盖真实 SQLite repository / service 集成测试
- `npm run test:ci`：普通测试 + native 测试合并验证
- 语句覆盖率 `67.18%`，分支覆盖率 `58.87%`，函数覆盖率 `64.10%`，行覆盖率 `67.67%`

## 什么时候必须补测试

- 修改 `src/store/`、`src/utils/`、`src/platform/` 核心逻辑时
- 修复缺陷且可以稳定复现时
- 变更构建脚本、Electron 路径、postinstall patch 时
- 调整请求层、错误处理、登录态和播放器核心行为时

## 推荐验证流程

### 功能或逻辑改动

```bash
npm run test:run
```

### 构建 / Electron 改动

```bash
npm run test:ci
npm run build:web
npm run build:electron
```

### 文档或 VitePress 改动

```bash
npm run docs:build
```

## E2E 说明

Playwright 相关命令：

```bash
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:debug
npm run test:e2e:report
```

如果本机还没有浏览器依赖，可先执行：

```bash
npx playwright install
```

## 调试建议

- `tests/setup.ts` 负责全局 Pinia 与浏览器环境初始化。
- 组件测试优先复用现有 mocks 和测试组织方式。
- 改动请求层时，优先写纯单测，不把网络依赖带进用例。
- E2E 失败时先看 `playwright-report/`，再回看浏览器控制台与网络请求。
