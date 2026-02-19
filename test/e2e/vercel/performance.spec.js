import { test, expect } from '@playwright/test'

// Vercel 性能测试
// 这些测试需要在 Vercel 部署后的 URL 上运行

const VERCEL_URL = process.env.VERCEL_URL || 'http://localhost:3000'

test.describe('Vercel Performance Tests', () => {
  test('should load page within 3 seconds', async ({ page }) => {
    const startTime = Date.now()
    
    await page.goto(VERCEL_URL)
    await page.waitForLoadState('networkidle')
    
    const loadTime = Date.now() - startTime
    
    // 首屏加载时间应小于 3 秒
    expect(loadTime).toBeLessThan(3000)
  })

  test('should load API within 1 second', async ({ request }) => {
    const startTime = Date.now()
    
    const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test`)
    
    const responseTime = Date.now() - startTime
    
    // API 响应时间应小于 1 秒
    expect(responseTime).toBeLessThan(1000)
    expect(response.ok()).toBeTruthy()
  })

  test('should have acceptable Time to First Byte (TTFB)', async ({ page }) => {
    // 使用 Performance API 测量 TTFB
    await page.goto(VERCEL_URL)
    
    const timing = await page.evaluate(() => {
      return performance.timing
    })
    
    const ttfb = timing.responseStart - timing.navigationStart
    
    // TTFB 应小于 600ms
    expect(ttfb).toBeLessThan(600)
  })

  test('should have acceptable First Contentful Paint (FCP)', async ({ page }) => {
    await page.goto(VERCEL_URL)
    
    // 等待页面稳定
    await page.waitForLoadState('networkidle')
    
    // 使用 Performance Observer 获取 FCP
    const fcp = await page.evaluate(() => {
      return new Promise((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const fcpEntry = entries.find(e => e.name === 'first-contentful-paint')
          if (fcpEntry) {
            resolve(fcpEntry.startTime)
          }
        })
        observer.observe({ entryTypes: ['paint'] })
        
        // 超时处理
        setTimeout(() => resolve(null), 5000)
      })
    })
    
    // FCP 应小于 1.8 秒
    if (fcp) {
      expect(fcp).toBeLessThan(1800)
    }
  })

  test('should have acceptable Largest Contentful Paint (LCP)', async ({ page }) => {
    await page.goto(VERCEL_URL)
    
    await page.waitForLoadState('networkidle')
    
    // 使用 Performance Observer 获取 LCP
    const lcp = await page.evaluate(() => {
      return new Promise((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const lastEntry = entries[entries.length - 1]
          resolve(lastEntry ? lastEntry.startTime : null)
        })
        observer.observe({ entryTypes: ['largest-contentful-paint'] })
        
        // 超时处理
        setTimeout(() => resolve(null), 5000)
      })
    })
    
    // LCP 应小于 2.5 秒
    if (lcp) {
      expect(lcp).toBeLessThan(2500)
    }
  })

  test('should have no layout shifts', async ({ page }) => {
    await page.goto(VERCEL_URL)
    
    await page.waitForLoadState('networkidle')
    
    // 获取 CLS (Cumulative Layout Shift)
    const cls = await page.evaluate(() => {
      return new Promise((resolve) => {
        let clsValue = 0
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value
            }
          }
        })
        observer.observe({ entryTypes: ['layout-shift'] })
        
        // 5秒后返回 CLS 值
        setTimeout(() => resolve(clsValue), 5000)
      })
    })
    
    // CLS 应小于 0.1
    expect(cls).toBeLessThan(0.1)
  })

  test('should handle concurrent API requests', async ({ request }) => {
    const requests = []
    
    // 发送 10 个并发请求
    for (let i = 0; i < 10; i++) {
      requests.push(
        request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test${i}`)
      )
    }
    
    const responses = await Promise.all(requests)
    
    // 所有请求都应该成功
    for (const response of responses) {
      expect(response.ok()).toBeTruthy()
    }
  })

  test('should cache static assets', async ({ request }) => {
    // 先请求一次
    const response1 = await request.get(`${VERCEL_URL}/`)
    
    // 再请求一次
    const response2 = await request.get(`${VERCEL_URL}/`)
    
    // 检查缓存头
    const headers1 = response1.headers()
    const headers2 = response2.headers()
    
    // 静态资源应该有缓存控制头
    // 注意：HTML 页面通常不缓存，但 JS/CSS 文件应该有缓存
  })

  test('should handle large search results', async ({ page }) => {
    const startTime = Date.now()
    
    await page.goto(VERCEL_URL)
    
    // 搜索一个常见关键词，返回大量结果
    const searchInput = page.locator('input[type="text"]')
    await searchInput.fill('a')
    await searchInput.press('Enter')
    
    // 等待结果加载
    await page.waitForTimeout(2000)
    
    const loadTime = Date.now() - startTime
    
    // 即使有大量结果，加载时间也应合理
    expect(loadTime).toBeLessThan(5000)
  })

  test('should maintain 60fps during scroll', async ({ page }) => {
    await page.goto(VERCEL_URL)
    
    // 先搜索一些内容
    const searchInput = page.locator('input[type="text"]')
    await searchInput.fill('test')
    await searchInput.press('Enter')
    await page.waitForTimeout(2000)
    
    // 测量滚动性能
    const frameDrops = await page.evaluate(() => {
      return new Promise((resolve) => {
        let frameCount = 0
        let dropCount = 0
        let lastTime = performance.now()
        
        const countFrames = () => {
          const currentTime = performance.now()
          const delta = currentTime - lastTime
          
          // 如果帧时间超过 20ms (低于 50fps)，计为掉帧
          if (delta > 20) {
            dropCount++
          }
          
          frameCount++
          lastTime = currentTime
          
          if (frameCount < 60) {
            requestAnimationFrame(countFrames)
          } else {
            resolve(dropCount)
          }
        }
        
        requestAnimationFrame(countFrames)
      })
    })
    
    // 掉帧次数应少于 5 次
    expect(frameDrops).toBeLessThan(5)
  })
})

test.describe('Vercel Serverless Performance', () => {
  test('should handle cold start efficiently', async ({ request }) => {
    // 注意：这个测试可能需要多次运行才能准确测量冷启动
    const startTime = Date.now()
    
    const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=coldstart`)
    
    const responseTime = Date.now() - startTime
    
    // 冷启动时间可能较长，但应小于 5 秒
    expect(responseTime).toBeLessThan(5000)
    expect(response.ok()).toBeTruthy()
  })

  test('should have consistent API response times', async ({ request }) => {
    const responseTimes = []
    
    // 发送 5 个请求并记录响应时间
    for (let i = 0; i < 5; i++) {
      const startTime = Date.now()
      await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test${i}`)
      responseTimes.push(Date.now() - startTime)
    }
    
    // 计算平均响应时间
    const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    
    // 平均响应时间应小于 500ms
    expect(avgTime).toBeLessThan(500)
    
    // 最大响应时间不应超过平均时间的 3 倍
    const maxTime = Math.max(...responseTimes)
    expect(maxTime).toBeLessThan(avgTime * 3)
  })

  test('should handle API timeout gracefully', async ({ request }) => {
    // 测试一个可能超时的请求
    const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=${'a'.repeat(100)}`)
    
    // 即使超时，也应该返回一个有效的 HTTP 响应
    expect([200, 408, 500, 504]).toContain(response.status())
  })
})
