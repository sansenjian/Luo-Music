import { test, expect } from '@playwright/test'

// Electron 环境测试
// 验证 Electron 环境中不加载 Vercel Web Analytics

test.describe('Electron Environment - No Analytics', () => {
  test('should not initialize Vercel Web Analytics in Electron', async ({ page }) => {
    // 这个测试需要在 Electron 环境中运行
    // 可以通过 electron-playwright 或其他方式启动 Electron 应用

    // 假设 Electron 应用运行在某个端口
    const ELECTRON_URL = process.env.ELECTRON_URL || 'http://localhost:5173'

    await page.goto(ELECTRON_URL)

    // 验证页面加载成功
    await expect(page.locator('#app')).toBeVisible()

    // 确认 Vercel Web Analytics 脚本不存在
    const analyticsScript = page.locator('script[src*="/_vercel/insights"]')
    await expect(analyticsScript).toHaveCount(0)

    // 也可以通过检查 window 对象来验证
    const hasAnalytics = await page.evaluate(() => {
      return typeof window.va !== 'undefined' ||
             document.querySelector('script[src*="/_vercel/insights"]') !== null
    })

    expect(hasAnalytics).toBe(false)
  })

  test('should not have Vercel Analytics-related global variables', async ({ page }) => {
    const ELECTRON_URL = process.env.ELECTRON_URL || 'http://localhost:5173'
    await page.goto(ELECTRON_URL)

    // 检查常见的 Vercel Analytics 全局变量
    const analyticsGlobals = await page.evaluate(() => {
      return {
        va: typeof window.va !== 'undefined',
        vercelAnalytics: typeof window.vercelAnalytics !== 'undefined',
        __vercel_analytics: typeof window.__vercel_analytics !== 'undefined'
      }
    })

    // 所有 Analytics 相关的全局变量都应该不存在
    expect(analyticsGlobals.va).toBe(false)
    expect(analyticsGlobals.vercelAnalytics).toBe(false)
    expect(analyticsGlobals.__vercel_analytics).toBe(false)
  })
})
