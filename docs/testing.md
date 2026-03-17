# 测试指南

**最后更新**: 2026-03-15

## 🧪 测试框架

项目使用以下测试工具：

| 工具 | 用途 |
|------|------|
| [Vitest](https://vitest.dev/) | 单元测试框架 |
| [@vue/test-utils](https://test-utils.vuejs.org/) | Vue 组件测试 |
| [Playwright](https://playwright.dev/) | E2E 测试 |
| [jsdom](https://github.com/jsdom/jsdom) | 浏览器环境模拟 |

## 📋 测试命令

```bash
# 运行所有测试（一次性）
npm run test:run

# 运行所有测试（监听模式）
npm run test

# 交互式测试 UI
npm run test:ui

# 生成覆盖率报告
npm run test:coverage
```

## 📁 测试文件组织

```
tests/
├── base/                 # 基础架构测试
├── components/           # 组件测试
├── electron/             # Electron 测试
├── platform/             # 平台适配器测试
├── services/             # 服务层测试
├── store/                # Store 测试
├── utils/                # 工具函数测试
└── setup.ts              # 测试配置
```

## 📝 测试覆盖率

### 覆盖率阈值

项目配置的覆盖率阈值：

| 指标 | 阈值 |
|------|------|
| Lines | 60% |
| Functions | 60% |
| Branches | 50% |
| Statements | 60% |

### 查看覆盖率报告

```bash
# 运行测试并生成覆盖率报告
npm run test:coverage

# 查看 HTML 报告
open coverage/index.html
```

## 🔧 测试配置

### Vitest 配置

在 `vitest.config.js` 中配置：

```javascript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      threshold: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60
      }
    }
  }
})
```

## 📊 测试记录

### 2026-03-15

- 测试文件：25+
- 测试用例：300+
- 覆盖率：60%+

### 2026-03-13

- 命令：`npm run test:run`
- 结果：全部通过
- 统计：25 个测试文件通过，306 个用例通过

## 🏷️ 测试最佳实践

### 组件测试

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MyComponent from '@/components/MyComponent.vue'

describe('MyComponent', () => {
  it('renders correctly', () => {
    const wrapper = mount(MyComponent, {
      props: { title: 'Test' }
    })
    expect(wrapper.text()).toContain('Test')
  })
})
```

### Store 测试

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStore } from '@/store/playerStore'

describe('usePlayerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with default state', () => {
    const store = usePlayerStore()
    expect(store.isPlaying).toBe(false)
  })
})
```

### 工具函数测试

```typescript
import { describe, it, expect } from 'vitest'
import { formatTime } from '@/utils/player/helpers/timeFormatter'

describe('formatTime', () => {
  it('formats seconds to MM:SS', () => {
    expect(formatTime(125)).toBe('02:05')
  })
})
```

## 🔗 相关文档

- [Vitest 文档](https://vitest.dev/)
- [Vue Test Utils 文档](https://test-utils.vuejs.org/)
- [Playwright 文档](https://playwright.dev/)
