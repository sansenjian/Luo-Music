# 测试与覆盖率配置指南

本文档介绍 LUO Music 项目的测试配置和 GitHub Actions 自动化测试设置。

## 目录

- [测试框架](#测试框架)
- [运行测试](#运行测试)
- [GitHub Actions 自动化测试](#github-actions-自动化测试)
- [Codecov 覆盖率集成](#codecov-覆盖率集成)
- [测试文件组织](#测试文件组织)

## 测试框架

项目使用以下测试工具和框架：

- **Vitest** - 基于 Vite 的下一代测试框架
- **Vue Test Utils** - Vue 3 组件测试工具
- **jsdom** - 浏览器环境模拟
- **@vitest/coverage-v8** - V8 代码覆盖率收集

## 运行测试

### 基础命令

```bash
# 运行所有测试
pnpm test

# 运行测试并生成覆盖率报告
pnpm test:coverage

# 运行测试一次（不监听）
pnpm test:run

# 带 UI 界面的测试
pnpm test:ui
```

### 覆盖率阈值

项目配置了以下覆盖率阈值（在 `vitest.config.js` 中）：

- 行覆盖率：60%
- 函数覆盖率：60%
- 分支覆盖率：50%
- 语句覆盖率：60%

如果测试覆盖率低于阈值，测试命令会返回错误退出码。

## GitHub Actions 自动化测试

项目配置了 GitHub Actions 工作流，在以下情况自动运行测试：

- 推送到 `main`、`master`、`develop` 分支
- 向上述分支发起 Pull Request

### 工作流配置

工作流文件位于 `.github/workflows/test.yml`，包含以下步骤：

1. **代码检出** - 使用 `actions/checkout@v4`
2. **pnpm 设置** - 使用 `pnpm/action-setup@v4`
3. **Node.js 设置** - 使用 `actions/setup-node@v4`（Node 24.x）
4. **安装依赖** - `pnpm install`
5. **运行测试** - `pnpm test:coverage`
6. **上传覆盖率** - 使用 `codecov/codecov-action@v5`

### 配置 Codecov Token

要在 GitHub 上查看覆盖率报告，需要在 GitHub Secrets 中添加 Codecov Token：

1. 访问 [Codecov](https://codecov.io/) 并登录 GitHub 账号
2. 添加项目并获取 Token
3. 在 GitHub 仓库的 **Settings > Secrets and variables > Actions** 中添加名为 `CODECOV_TOKEN` 的 secret

## Codecov 覆盖率集成

### 配置文件

`codecov.yml` 配置文件包含：

- **覆盖率精度** - 保留 2 位小数
- **目标覆盖率** - 70%
- **阈值容差** - 5%
- **忽略目录** - node_modules、tests、dist 等

### 生成的覆盖率文件

运行 `pnpm test:coverage` 后会生成以下文件：

```
coverage/
├── lcov.info              # LCOV 格式报告（上传到 Codecov）
├── coverage-final.json    # JSON 格式报告
└── lcov-report/           # HTML 可视化报告
```

### .gitignore 配置

覆盖率目录已添加到 `.gitignore`，但保留了 Codecov 需要的文件：

```gitignore
# Coverage directory used by tools like istanbul
coverage/
!coverage/lcov.info
!coverage/coverage-final.json
coverage/*.html
coverage/*.css
```

## 测试文件组织

### 目录结构

```
tests/
├── setup.js              # 测试配置文件
├── mocks/                # Mock 数据
│   └── audio.js          # Audio API Mock
├── components/           # 组件测试
│   ├── Player.test.js
│   └── UserProfile.test.js
├── store/                # Pinia Store 测试
│   ├── playerStore.test.js
│   └── userStore.test.js
├── utils/                # 工具函数测试
│   ├── errorCenter.test.ts
│   └── requestConfig.test.js
└── platform/             # 平台适配器测试
    └── musicInterface.test.ts
```

### 测试配置

`vitest.config.js` 配置：

```javascript
{
  test: {
    environment: 'jsdom',      // 浏览器环境
    globals: true,             // 全局测试函数
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      // ... 其他配置
    }
  }
}
```

### 测试示例

```javascript
import { describe, it, expect, beforeEach } from 'vitest'

describe('模块名称', () => {
  beforeEach(() => {
    // 每个测试前的设置
  })

  it('应该完成某项功能', () => {
    expect(结果).toBe(预期值)
  })
})
```

## 持续改进

### 提高覆盖率

1. 为现有功能补充测试
2. 修复未测试的边缘情况
3. 为核心业务逻辑添加更多测试用例

### 测试最佳实践

- ✅ 保持测试独立，不依赖其他测试
- ✅ 使用 `beforeEach` 清理状态
- ✅ 为复杂逻辑编写多个测试用例
- ✅ 测试正常流程和错误处理
- ✅ 使用有意义的测试描述

## 故障排查

### 测试失败

如果测试失败，检查：

1. 测试代码逻辑是否正确
2. Mock 数据是否符合预期
3. 依赖的状态是否正确初始化

### 覆盖率报告未生成

确保：

1. `@vitest/coverage-v8` 已安装
2. `vitest.config.js` 中配置了 coverage 选项
3. 运行的是 `pnpm test:coverage` 而不是 `pnpm test`

### GitHub Actions 失败

查看 GitHub Actions 日志，确认：

1. 依赖是否正确安装
2. Node.js 版本是否正确
3. pnpm 版本是否兼容

## 相关资源

- [Vitest 文档](https://vitest.dev/)
- [Vue Test Utils 文档](https://test-utils.vuejs.org/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Codecov 文档](https://docs.codecov.com/)
