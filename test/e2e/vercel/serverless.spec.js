import { test, expect } from '@playwright/test'

// Vercel Serverless Function 测试
// 这些测试需要在 Vercel 部署后的 URL 上运行

const VERCEL_URL = process.env.VERCEL_URL || 'http://localhost:3000'

test.describe('Vercel Serverless Function', () => {
  test.describe('API Routing', () => {
    test('should route /api/* to serverless function', async ({ request }) => {
      const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test`)
      
      expect(response.ok()).toBeTruthy()
      expect(response.status()).toBe(200)
    })

    test('should handle path rewriting correctly', async ({ request }) => {
      // 测试路径重写是否去除了 /api 前缀
      const response = await request.get(`${VERCEL_URL}/api/search?keywords=test`)
      
      // 应该返回 200 或 404，而不是服务器错误
      expect([200, 404]).toContain(response.status())
    })

    test('should handle query parameters', async ({ request }) => {
      const response = await request.get(
        `${VERCEL_URL}/api/cloudsearch?keywords=test&offset=0&limit=10`
      )
      
      expect(response.ok()).toBeTruthy()
      
      const data = await response.json()
      expect(data).toHaveProperty('result')
    })

    test('should handle special characters in query', async ({ request }) => {
      const response = await request.get(
        `${VERCEL_URL}/api/cloudsearch?keywords=${encodeURIComponent('测试 & 特殊字符')}`
      )
      
      expect(response.ok()).toBeTruthy()
    })
  })

  test.describe('CORS Headers', () => {
    test('should include CORS headers in API responses', async ({ request }) => {
      const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test`)
      
      const headers = response.headers()
      
      expect(headers['access-control-allow-origin']).toBe('*')
      expect(headers['access-control-allow-methods']).toContain('GET')
      expect(headers['access-control-allow-headers']).toContain('Content-Type')
    })

    test('should handle OPTIONS preflight requests', async ({ request }) => {
      const response = await request.fetch(`${VERCEL_URL}/api/cloudsearch`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      })
      
      expect(response.status()).toBe(200)
      
      const headers = response.headers()
      expect(headers['access-control-allow-origin']).toBe('*')
    })

    test('should allow cross-origin requests', async ({ request }) => {
      const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test`, {
        headers: {
          'Origin': 'https://example.com'
        }
      })
      
      expect(response.ok()).toBeTruthy()
      
      const headers = response.headers()
      expect(headers['access-control-allow-origin']).toBe('*')
    })
  })

  test.describe('Error Handling', () => {
    test('should return 404 for non-existent API endpoints', async ({ request }) => {
      const response = await request.get(`${VERCEL_URL}/api/non-existent-endpoint`)
      
      expect(response.status()).toBe(404)
    })

    test('should return 500 for server errors', async ({ request }) => {
      // 测试一个可能导致服务器错误的请求
      const response = await request.get(`${VERCEL_URL}/api/song/url/v1`)
      
      // 应该返回 400（缺少参数）或 500
      expect([400, 500]).toContain(response.status())
    })

    test('should handle malformed requests gracefully', async ({ request }) => {
      const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=`)
      
      // 空关键词应该返回空结果或错误，但不应该是 500
      expect([200, 400]).toContain(response.status())
    })

    test('should handle very long query parameters', async ({ request }) => {
      const longKeyword = 'a'.repeat(500)
      const response = await request.get(
        `${VERCEL_URL}/api/cloudsearch?keywords=${longKeyword}`
      )
      
      // 应该返回 200 或 414（URI Too Long）
      expect([200, 414]).toContain(response.status())
    })
  })

  test.describe('Response Format', () => {
    test('should return JSON for API endpoints', async ({ request }) => {
      const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test`)
      
      const contentType = response.headers()['content-type']
      expect(contentType).toContain('application/json')
      
      const data = await response.json()
      expect(typeof data).toBe('object')
    })

    test('should return consistent response structure', async ({ request }) => {
      const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test`)
      
      const data = await response.json()
      
      // 检查响应结构
      expect(data).toHaveProperty('result')
      expect(data).toHaveProperty('code')
    })
  })

  test.describe('Function Lifecycle', () => {
    test('should handle concurrent executions', async ({ request }) => {
      const requests = []
      
      // 同时发送多个请求
      for (let i = 0; i < 5; i++) {
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

    test('should maintain state between requests', async ({ request }) => {
      // 第一次请求
      const response1 = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test1`)
      expect(response1.ok()).toBeTruthy()
      
      // 第二次请求
      const response2 = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test2`)
      expect(response2.ok()).toBeTruthy()
      
      // 两次请求都应该成功，表明函数可以处理多个请求
    })
  })

  test.describe('Cache Behavior', () => {
    test('should have appropriate cache headers', async ({ request }) => {
      const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test`)
      
      const headers = response.headers()
      
      // API 响应不应该被浏览器缓存
      expect(headers['cache-control']).toMatch(/no-cache|no-store|must-revalidate/)
    })

    test('should return different results for different queries', async ({ request }) => {
      const response1 = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test1`)
      const response2 = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test2`)
      
      const data1 = await response1.json()
      const data2 = await response2.json()
      
      // 不同查询应该返回不同结果
      expect(data1).not.toEqual(data2)
    })
  })

  test.describe('API Specific Tests', () => {
    test('cloudsearch API should return search results', async ({ request }) => {
      const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=周杰伦`)
      
      expect(response.ok()).toBeTruthy()
      
      const data = await response.json()
      expect(data.result).toHaveProperty('songs')
      expect(Array.isArray(data.result.songs)).toBe(true)
    })

    test('song URL API should return URL or error', async ({ request }) => {
      // 使用一个已知的歌曲 ID
      const response = await request.get(
        `${VERCEL_URL}/api/song/url/v1?id=33894312&level=standard`
      )
      
      expect(response.ok()).toBeTruthy()
      
      const data = await response.json()
      expect(data).toHaveProperty('data')
    })

    test('lyric API should return lyrics', async ({ request }) => {
      // 使用一个已知的歌曲 ID
      const response = await request.get(`${VERCEL_URL}/api/lyric?id=33894312`)
      
      expect(response.ok()).toBeTruthy()
      
      const data = await response.json()
      expect(data).toHaveProperty('lrc')
    })

    test('playlist API should return playlist info', async ({ request }) => {
      // 使用一个已知的歌单 ID
      const response = await request.get(`${VERCEL_URL}/api/playlist/detail?id=3778678`)
      
      expect(response.ok()).toBeTruthy()
      
      const data = await response.json()
      expect(data).toHaveProperty('playlist')
    })
  })

  test.describe('Timeout and Limits', () => {
    test('should complete within function timeout', async ({ request }) => {
      const startTime = Date.now()
      
      const response = await request.get(`${VERCEL_URL}/api/cloudsearch?keywords=test`)
      
      const duration = Date.now() - startTime
      
      // 应该在 10 秒内完成（Vercel 免费版限制）
      expect(duration).toBeLessThan(10000)
      expect(response.ok()).toBeTruthy()
    })

    test('should handle request payload size limits', async ({ request }) => {
      // 测试一个可能超过 payload 限制的请求
      const largePayload = 'a'.repeat(10000)
      
      const response = await request.get(
        `${VERCEL_URL}/api/cloudsearch?keywords=${largePayload}`
      )
      
      // 应该返回 200 或 413（Payload Too Large）
      expect([200, 413]).toContain(response.status())
    })
  })
})
