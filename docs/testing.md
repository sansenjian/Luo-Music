# 测试指南

LUO Music 目前同时使用 Vitest 和 Playwright 覆盖单测、集成测试、脚本测试与 E2E 场景。

## 测试命令

```bash
npm run test
npm run test:run
npm run test:coverage
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:debug
npm run test:e2e:report
npm run typecheck
```

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

截至 `2026-04-12`，最近一次全量 `npm run test:run` 结果为：

- `122` 个测试文件通过
- `927` 个测试用例通过

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
npm run test:run
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
