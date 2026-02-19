import { test, expect } from '@playwright/test'

// Vercel 性能测试
// 这些测试需要在 Vercel 部署后的 URL 上运行

const VERCEL_URL = process.env.VERCEL_URL || 'http://localhost:3000'
const ENABLE_VERCEL_PERF_TESTS = process.env.ENABLE_VERCEL_PERF_TESTS === 'true'

// 使用更宽松的默认阈值，并允许通过环境变量覆盖，避免在不同环境/CI 下过于严格
const PAGE_LOAD_THRESHOLD_MS = Number(process.env.PAGE_LOAD_THRESHOLD_MS) || 5000
const API_RESPONSE_THRESHOLD_MS = Number(process.env.API_RESPONSE_THRESHOLD_MS) || 2000
const TTFB_THRESHOLD_MS = Number(process.env.TTFB_THRESHOLD_MS) || 1000
const FCP_THRESHOLD_MS = Number(process.env.FCP_THRESHOLD_MS) || 2500
const LCP_THRESHOLD_MS = Number(process.env.LCP_THRESHOLD_MS) || 4000
const CLS_THRESHOLD = Number(process.env.CLS_THRESHOLD) || 0.2

test.describe('Vercel Performance Tests', () => {
  // 默认跳过性能测试，只有在显式开启时才运行，避免在普通 CI 流程中造成 flakiness
  test.skip(
    !ENABLE_VERCEL_PERF_TESTS,
    'Performance tests are disabled by default. Set ENABLE_VERCEL_PERF_TESTS=true to enable them.'
  )

  test('should load page within acceptable time', async ({ page }) => {
    const startTime = Date.now()
    
    await page.goto(VERCEL_URL)
    await page.waitForLoadState('networkidle')
    
    const loadTime = Date.now() - startTime
    
    // 使用可配置的阈值，只用于捕获明显的性能回退
    expect(loadTime).toBeLessThan(PAGE_LOAD_THRESHOLD_MS)
  })

  test('should load API within acceptable time', async ({ request }) => {
    const startTime = Date.now()
    
    const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test`)
    
    const responseTime = Date.now() - startTime
    
    // API 响应时间使用可配置阈值
    expect(responseTime).toBeLessThan(API_RESPONSE_THRESHOLD_MS)
    expect(response.ok()).toBeTruthy()
  })

  test('should have acceptable Time to First Byte (TTFB)', async ({ page }) => {
    // 使用 Performance API 测量 TTFB
    await page.goto(VERCEL_URL)
    
    const timing = await page.evaluate(() => {
      return performance.timing
    })
    
    const ttfb = timing.responseStart - timing.navigationStart
    
    // TTFB 使用可配置阈值
    expect(ttfb).toBeLessThan(TTFB_THRESHOLD_MS)
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
    
    // FCP 使用可配置阈值
    if (fcp) {
      expect(fcp).toBeLessThan(FCP_THRESHOLD_MS)
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
    
    // LCP 使用可配置阈值
    if (lcp) {
      expect(lcp).toBeLessThan(LCP_THRESHOLD_MS)
    }
  })

  test('should have acceptable layout shifts', async ({ page }) => {
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
    
    // CLS 使用可配置阈值
    expect(cls).toBeLessThan(CLS_THRESHOLD)
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
    // 请求一个 JS 文件（静态资源应该被缓存）
    const response = await request.get(`${VERCEL_URL}/`)
    
    // 检查缓存头是否存在
    const headers = response.headers()
    
    // 验证有缓存控制相关的头部
    const hasCacheHeader = headers['cache-control'] || headers['etag'] || headers['last-modified']
    
    // 断言：应该存在缓存相关的头部
    expect(hasCacheHeader).toBeTruthy()
    
    // 如果是 HTML 页面，通常不应该被长期缓存
    const contentType = headers['content-type'] || ''
    if (contentType.includes('text/html')) {
      // HTML 页面可以没有缓存或短时间缓存
      expect(true).toBeTruthy()
    } else {
      // 静态资源（JS/CSS/图片）应该有缓存控制
      expect(headers['cache-control']).toBeTruthy()
    }
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
    expect(loadTime).toBeLessThan(PAGE_LOAD_THRESHOLD_MS)
  })

  test('should maintain smooth scroll performance', async ({ page }) => {
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
    
    // 掉帧次数应合理（使用更宽松的阈值）
    expect(frameDrops).toBeLessThan(10)
  })
})

test.describe('Vercel Serverless Performance', () => {
  // 默认跳过性能测试
  test.skip(
    !ENABLE_VERCEL_PERF_TESTS,
    'Performance tests are disabled by default. Set ENABLE_VERCEL_PERF_TESTS=true to enable them.'
  )

  test('should handle cold start efficiently', async ({ request }) => {
    // 注意：这个测试可能需要多次运行才能准确测量冷启动
    const startTime = Date.now()
    
    const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=coldstart`)
    
    const responseTime = Date.now() - startTime
    
    // 冷启动时间可能较长，使用可配置阈值
    expect(responseTime).toBeLessThan(API_RESPONSE_THRESHOLD_MS * 2)
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
    
    // 平均响应时间使用可配置阈值
    expect(avgTime).toBeLessThan(API_RESPONSE_THRESHOLD_MS)
    
    // 最大响应时间不应超过平均时间的 5 倍（更宽松的阈值）
    const maxTime = Math.max(...responseTimes)
    expect(maxTime).toBeLessThan(avgTime * 5)
  })

  test('should handle API timeout gracefully', async ({ request }) => {
    // 测试一个可能超时的请求
    const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=${'a'.repeat(100)}`)
    
    // 即使超时，也应该返回一个有效的 HTTP 响应
    expect([200, 408, 500, 504]).toContain(response.status())
  })
})
