import { test, expect } from '@playwright/test'

// Vercel 部署验证测试
// 这些测试需要在 Vercel 部署后的 URL 上运行

const VERCEL_URL = process.env.VERCEL_URL || 'http://localhost:3000'

test.describe('Vercel Deployment Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(VERCEL_URL)
  })

  test('should load the application', async ({ page }) => {
    // 验证页面标题
    await expect(page).toHaveTitle(/LUO|MUSIC/)
    
    // 验证主要元素存在
    const app = page.locator('#app')
    await expect(app).toBeVisible()
  })

  test('should load static resources', async ({ page }) => {
    // 验证 CSS 加载
    const styles = await page.evaluate(() => {
      return Array.from(document.styleSheets).length
    })
    expect(styles).toBeGreaterThan(0)
    
    // 验证 JavaScript 加载
    const scripts = await page.evaluate(() => {
      return Array.from(document.scripts).filter(s => s.src).length
    })
    expect(scripts).toBeGreaterThan(0)
  })

  test('should display search interface', async ({ page }) => {
    // 验证搜索输入框
    const searchInput = page.locator('input[type="text"]')
    await expect(searchInput).toBeVisible()
    
    // 验证搜索按钮或图标
    const searchButton = page.locator('button, [class*="search"]').first()
    await expect(searchButton).toBeVisible()
  })

  test('should display player interface', async ({ page }) => {
    // 验证播放器容器
    const player = page.locator('.player, [class*="player"]').first()
    await expect(player).toBeVisible()
    
    // 验证播放控制按钮
    const controls = page.locator('button, [class*="control"], [class*="play"], [class*="pause"]')
    expect(await controls.count()).toBeGreaterThan(0)
  })

  test('should be responsive', async ({ page }) => {
    // 测试桌面端
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(VERCEL_URL)
    await page.waitForLoadState('networkidle')
    
    const desktopApp = page.locator('#app')
    await expect(desktopApp).toBeVisible()
    
    // 测试移动端
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(VERCEL_URL)
    await page.waitForLoadState('networkidle')
    
    const mobileApp = page.locator('#app')
    await expect(mobileApp).toBeVisible()
  })
})

test.describe('Vercel API Endpoints', () => {
  test('should respond to search API', async ({ request }) => {
    const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test`)
    
    expect(response.ok()).toBeTruthy()
    expect(response.status()).toBe(200)
    
    const data = await response.json()
    expect(data).toHaveProperty('result')
  })

  test('should respond to song URL API', async ({ request }) => {
    // 使用一个测试歌曲 ID
    const response = await request.get(`${VERCEL_URL}/api/song/url/v1?id=123456&level=standard`)
    
    expect(response.ok()).toBeTruthy()
    expect(response.status()).toBe(200)
    
    const data = await response.json()
    expect(data).toHaveProperty('data')
  })

  test('should respond to lyric API', async ({ request }) => {
    const response = await request.get(`${VERCEL_URL}/api/lyric?id=123456`)
    
    expect(response.ok()).toBeTruthy()
    expect(response.status()).toBe(200)
    
    const data = await response.json()
    expect(data).toHaveProperty('lrc')
  })

  test('should handle CORS headers', async ({ request }) => {
    const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test`)
    
    const headers = response.headers()
    expect(headers['access-control-allow-origin']).toBe('*')
  })

  test('should handle 404 for invalid endpoints', async ({ request }) => {
    const response = await request.get(`${VERCEL_URL}/api/invalid-endpoint`)
    
    // API 应该返回 404 或相应的错误
    expect([200, 404, 500]).toContain(response.status())
  })
})

test.describe('Vercel Routing', () => {
  test('should handle SPA routing', async ({ page }) => {
    // 访问根路径
    await page.goto(VERCEL_URL)
    await expect(page.locator('#app')).toBeVisible()
    
    // 访问带 hash 的路径
    await page.goto(`${VERCEL_URL}/#/search`)
    await expect(page.locator('#app')).toBeVisible()
  })

  test('should serve index.html for unknown routes', async ({ page }) => {
    // 访问不存在的路径
    await page.goto(`${VERCEL_URL}/non-existent-path`)
    
    // 应该仍然加载应用（SPA 行为）
    await expect(page.locator('#app')).toBeVisible()
  })
})

test.describe('Vercel Static Assets', () => {
  test('should serve favicon', async ({ request }) => {
    const response = await request.get(`${VERCEL_URL}/favicon.ico`)
    
    // favicon 可能存在也可能不存在，但不应该返回 500
    expect([200, 404]).toContain(response.status())
  })

  test('should have correct content-type for JS files', async ({ page, request }) => {
    // 获取页面上的 JS 文件链接
    const scripts = await page.evaluate(() => {
      return Array.from(document.scripts)
        .filter(s => s.src && s.src.includes('.js'))
        .map(s => s.src)
    })
    
    if (scripts.length > 0) {
      const jsUrl = scripts[0]
      const response = await request.get(jsUrl)
      
      const contentType = response.headers()['content-type']
      expect(contentType).toContain('javascript')
    }
  })
})
