# E2E Playwright 测试方案

## 概述

本文档描述 Luo-Music 项目的 E2E（端到端）测试方案，使用 Playwright 作为测试框架。

## 目录结构

```
tests/e2e/
├── fixtures/           # 测试夹具（全局 setup/teardown）
│   ├── base.ts         # 基础测试夹具（包含认证、路由 mock 等）
│   └── data.ts         # 测试数据生成器
├── specs/              # 测试规格文件
│   ├── app.spec.ts     # 主应用流程测试
│   ├── player.spec.ts  # 播放器功能测试
│   ├── search.spec.ts  # 搜索功能测试
│   └── navigation.spec.ts # 导航测试
├── pages/              # Page Object 模式
│   ├── base.page.ts    # 基础页面对象
│   ├── home.page.ts    # 首页
│   ├── player.page.ts  # 播放器页面
│   └── search.page.ts  # 搜索页面
├── utils/              # 工具函数
│   ├── api-mock.ts     # API 响应 mock
│   └── test-data.ts    # 测试数据
└── setup/              # 全局设置
    └── global-setup.ts # 全局前置设置
```

## 核心设计原则

### 1. Page Object 模式

每个主要页面/组件对应一个 Page Object 类，封装 DOM 操作和断言：

```typescript
// tests/e2e/pages/home.page.ts
import { type Page, type Locator, expect } from '@playwright/test'

export class HomePage {
  readonly page: Page
  readonly searchInput: Locator
  readonly searchButton: Locator
  readonly songList: Locator
  readonly playButton: Locator

  constructor(page: Page) {
    this.page = page
    this.searchInput = page.getByRole('textbox', { name: /搜索/i })
    this.searchButton = page.getByRole('button', { name: /搜索/i })
    this.songList = page.getByTestId('song-list')
    this.playButton = page.getByTestId('play-button')
  }

  async goto() {
    await this.page.goto('/')
  }

  async search(keyword: string) {
    await this.searchInput.fill(keyword)
    await this.searchButton.click()
  }

  async expectSongVisible(songName: string) {
    await expect(this.page.getByText(songName)).toBeVisible()
  }
}
```

### 2. 测试夹具（Fixtures）

使用 Playwright 的 fixtures 系统提供可复用的测试上下文：

```typescript
// tests/e2e/fixtures/base.ts
import { test as base } from '@playwright/test'
import { HomePage } from '../pages/home.page'
import { PlayerPage } from '../pages/player.page'

type Fixtures = {
  homePage: HomePage
  playerPage: PlayerPage
}

export const test = base.extend<Fixtures>({
  homePage: async ({ page }, use) => {
    const homePage = new HomePage(page)
    await homePage.goto()
    await use(homePage)
  },
  playerPage: async ({ page }, use) => {
    await use(new PlayerPage(page))
  }
})

export { expect } from '@playwright/test'
```

### 3. API Mock 策略

使用 `page.route()` mock 后端 API，确保测试稳定性和可重复性：

```typescript
// tests/e2e/utils/api-mock.ts
import { type Page, type Route } from '@playwright/test'

export async function mockSearchApi(page: Page, results: unknown[]) {
  await page.route('**/api/search', route => {
    route.fulfill({
      status: 200,
      json: {
        code: 200,
        data: {
          songs: results
        }
      }
    })
  })
}

export async function mockSongUrlApi(page: Page, url: string) {
  await page.route('**/api/song/url', route => {
    route.fulfill({
      status: 200,
      json: {
        code: 200,
        data: { url }
      }
    })
  })
}
```

## 测试用例设计

### 1. 主应用流程 (`app.spec.ts`)

```typescript
import { test, expect } from '../fixtures/base'
import { mockSearchApi } from '../utils/api-mock'

test.describe('Main App Flow', () => {
  test('should complete search and play flow', async ({ homePage, playerPage }) => {
    // Mock API 响应
    await mockSearchApi(homePage.page, [{ id: '1', name: 'Test Song', artist: 'Test Artist' }])

    // 执行搜索
    await homePage.search('test')
    await homePage.expectSongVisible('Test Song')

    // 点击播放
    await homePage.playButton.click()

    // 验证播放器状态
    await expect(playerPage.player).toBeVisible()
    await expect(playerPage.songTitle).toContainText('Test Song')
  })
})
```

### 2. 播放器功能 (`player.spec.ts`)

```typescript
import { test, expect } from '../fixtures/base'

test.describe('Player Controls', () => {
  test('play/pause toggle', async ({ playerPage }) => {
    await playerPage.goto()

    // 初始状态：暂停
    await expect(playerPage.playButton).toHaveAttribute('data-state', 'paused')

    // 点击播放
    await playerPage.playButton.click()
    await expect(playerPage.playButton).toHaveAttribute('data-state', 'playing')

    // 点击暂停
    await playerPage.playButton.click()
    await expect(playerPage.playButton).toHaveAttribute('data-state', 'paused')
  })

  test('volume control', async ({ playerPage }) => {
    await playerPage.goto()

    await playerPage.setVolume(50)
    await expect(playerPage.volumeSlider).toHaveValue('50')

    await playerPage.mute()
    await expect(playerPage.volumeSlider).toHaveValue('0')
  })

  test('next/previous song', async ({ playerPage }) => {
    await playerPage.goto()
    await playerPage.setPlaylist([
      { id: '1', name: 'Song 1' },
      { id: '2', name: 'Song 2' },
      { id: '3', name: 'Song 3' }
    ])

    await playerPage.expectCurrentSong('Song 1')

    await playerPage.next()
    await playerPage.expectCurrentSong('Song 2')

    await playerPage.previous()
    await playerPage.expectCurrentSong('Song 1')
  })
})
```

### 3. 搜索功能 (`search.spec.ts`)

```typescript
import { test, expect } from '../fixtures/base'

test.describe('Search Functionality', () => {
  test('should show search results', async ({ homePage }) => {
    await homePage.search('周杰伦')
    await expect(homePage.songList).toBeVisible()
  })

  test('should handle empty search', async ({ homePage }) => {
    await homePage.search('')
    await expect(homePage.emptyState).toBeVisible()
  })

  test('should show loading state', async ({ homePage }) => {
    await homePage.page.route('**/api/search', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000))
      await route.continue()
    })

    await homePage.search('test')
    await expect(homePage.loadingSpinner).toBeVisible()
    await expect(homePage.loadingSpinner).not.toBeVisible()
  })
})
```

### 4. 导航测试 (`navigation.spec.ts`)

```typescript
import { test, expect } from '../fixtures/base'

test.describe('Navigation', () => {
  test('should navigate between pages', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/')

    await page.getByRole('link', { name: /播放列表/i }).click()
    await expect(page).toHaveURL('/playlist')

    await page.getByRole('link', { name: /首页/i }).click()
    await expect(page).toHaveURL('/')
  })

  test('should handle browser back/forward', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /播放列表/i }).click()
    await expect(page).toHaveURL('/playlist')

    await page.goBack()
    await expect(page).toHaveURL('/')

    await page.goForward()
    await expect(page).toHaveURL('/playlist')
  })
})
```

## 配置文件

### playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'tests/e2e/report' }],
    ['json', { outputFile: 'tests/e2e/report/results.json' }],
    ['junit', { outputFile: 'tests/e2e/report/junit.xml' }]
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    },
    // 移动端测试
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] }
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] }
    }
  ],
  webServer: {
    command: 'npm run dev:web',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
})
```

## 全局设置

### global-setup.ts

```typescript
import { FullConfig } from '@playwright/test'

export default async function globalSetup(config: FullConfig) {
  // 设置测试数据库
  // 准备测试数据
  // 启动 mock 服务器（如需要）

  // 存储认证状态（如果有登录功能）
  const { baseURL, storageState } = config.projects[0].use
  // ... 设置 storageState
}
```

## 运行命令

```bash
# 安装 Playwright 浏览器
npx playwright install

# 运行所有测试
npx playwright test

# 运行特定测试文件
npx playwright test player.spec.ts

# 运行特定测试用例
npx playwright test -g "play/pause toggle"

# 以有头模式运行（显示浏览器）
npx playwright test --headed

# 以调试模式运行
npx playwright test --debug

# 生成 HTML 报告
npx playwright show-report tests/e2e/report

# 在 CI 环境中运行
CI=true npx playwright test
```

## 最佳实践

### 1. 选择器优先级

```typescript
// 推荐：使用语义化选择器
page.getByRole('button', { name: 'Submit' })
page.getByLabel('Email')
page.getByTestId('submit-button')

// 避免：CSS/XPath（脆弱）
page.$('#submit-btn')
page.$x('//button[@class="btn"]')
```

### 2. 等待策略

```typescript
// 推荐：使用 Playwright 的自动等待
await page.getByRole('button').click()

// 显式等待特定状态
await expect(page.getByText('Success')).toBeVisible()

// 避免：固定延迟
// await page.waitForTimeout(1000) ❌
```

### 3. 测试隔离

```typescript
// 每个测试独立，不依赖其他测试的状态
test('test A', async ({ page }) => {
  await page.goto('/')
  // 测试 A 的逻辑
})

test('test B', async ({ page }) => {
  await page.goto('/')
  // 测试 B 的逻辑，不依赖 A 的状态
})
```

### 4. 数据驱动测试

```typescript
const testCases = [
  { keyword: '周杰伦', expectedCount: 10 },
  { keyword: '陈奕迅', expectedCount: 5 },
  { keyword: '', expectedCount: 0 }
]

for (const { keyword, expectedCount } of testCases) {
  test(`search "${keyword}" should return ${expectedCount} results`, async ({ homePage }) => {
    await homePage.search(keyword)
    // 断言逻辑
  })
}
```

## CI/CD 集成

### GitHub Actions

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npx playwright test

      - name: Upload test report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: tests/e2e/report/
          retention-days: 30
```

## 依赖安装

```bash
# 安装 Playwright
npm install -D @playwright/test

# 安装 TypeScript 支持（如需要）
npm install -D @types/node

# 安装浏览器
npx playwright install
```

## package.json 脚本

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:report": "playwright show-report tests/e2e/report",
    "test:e2e:ui": "playwright test --ui"
  }
}
```
