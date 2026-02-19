import { describe, it, expect, beforeAll } from 'vitest'
import axios from 'axios'

// API 集成测试
// 测试 API 层与后端服务的集成

const API_BASE_URL = process.env.API_URL || 'http://localhost:14532'

describe('API Integration Tests', () => {
  let request

  beforeAll(() => {
    request = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
    })
  })

  describe('Search API', () => {
    it('should search for songs', async () => {
      const response = await request.get('/cloudsearch?keywords=周杰伦')
      
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('result')
      expect(response.data.result).toHaveProperty('songs')
      expect(Array.isArray(response.data.result.songs)).toBe(true)
    })

    it('should handle empty search keyword', async () => {
      const response = await request.get('/cloudsearch?keywords=')
      
      expect(response.status).toBe(200)
      // 空关键词可能返回空结果或错误
    })

    it('should handle special characters in search', async () => {
      const response = await request.get('/cloudsearch?keywords=' + encodeURIComponent('测试 & 特殊字符'))
      
      expect(response.status).toBe(200)
    })

    it('should support pagination', async () => {
      const response1 = await request.get('/cloudsearch?keywords=test&offset=0&limit=10')
      const response2 = await request.get('/cloudsearch?keywords=test&offset=10&limit=10')
      
      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)
      
      // 不同偏移量应该返回不同结果
      if (response1.data.result?.songs && response2.data.result?.songs) {
        expect(response1.data.result.songs[0]?.id).not.toBe(response2.data.result.songs[0]?.id)
      }
    })
  })

  describe('Song URL API', () => {
    it('should get song URL with standard quality', async () => {
      // 使用一个已知的歌曲 ID
      const response = await request.get('/song/url/v1?id=33894312&level=standard')
      
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('data')
    })

    it('should get song URL with high quality', async () => {
      const response = await request.get('/song/url/v1?id=33894312&level=exhigh')
      
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('data')
    })

    it('should handle invalid song ID', async () => {
      const response = await request.get('/song/url/v1?id=999999999&level=standard')
      
      expect(response.status).toBe(200)
      // 无效 ID 可能返回空数据或错误信息
    })

    it('should handle missing parameters', async () => {
      try {
        await request.get('/song/url/v1')
      } catch (error) {
        expect(error.response?.status).toBe(400)
      }
    })
  })

  describe('Lyric API', () => {
    it('should get lyrics for a song', async () => {
      const response = await request.get('/lyric?id=33894312')
      
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('lrc')
    })

    it('should handle song without lyrics', async () => {
      const response = await request.get('/lyric?id=999999999')
      
      expect(response.status).toBe(200)
      // 无歌词的歌曲可能返回空歌词
    })

    it('should get translated lyrics if available', async () => {
      const response = await request.get('/lyric?id=33894312')
      
      expect(response.status).toBe(200)
      // 翻译歌词可能存在也可能不存在
      if (response.data.tlyric) {
        expect(response.data.tlyric).toHaveProperty('lyric')
      }
    })
  })

  describe('Playlist API', () => {
    it('should get playlist details', async () => {
      // 使用一个已知的歌单 ID
      const response = await request.get('/playlist/detail?id=3778678')
      
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('playlist')
    })

    it('should get playlist tracks', async () => {
      const response = await request.get('/playlist/track/all?id=3778678&limit=10')
      
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('songs')
    })

    it('should handle invalid playlist ID', async () => {
      const response = await request.get('/playlist/detail?id=999999999')
      
      expect(response.status).toBe(200)
      // 无效 ID 可能返回空数据
    })
  })

  describe('Song Detail API', () => {
    it('should get song details', async () => {
      const response = await request.get('/song/detail?ids=33894312')
      
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('songs')
      expect(Array.isArray(response.data.songs)).toBe(true)
    })

    it('should get multiple song details', async () => {
      const response = await request.get('/song/detail?ids=33894312,1293886117')
      
      expect(response.status).toBe(200)
      expect(response.data.songs).toHaveLength(2)
    })
  })

  describe('Artist API', () => {
    it('should get artist details', async () => {
      const response = await request.get('/artist/detail?id=6452')
      
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('data')
    })

    it('should get artist songs', async () => {
      const response = await request.get('/artist/songs?id=6452&limit=10')
      
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('songs')
    })
  })

  describe('Album API', () => {
    it('should get album details', async () => {
      const response = await request.get('/album?id=32311')
      
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('album')
    })
  })

  describe('Error Handling', () => {
    it('should handle 404 for non-existent endpoints', async () => {
      try {
        await request.get('/non-existent-endpoint')
      } catch (error) {
        expect(error.response?.status).toBe(404)
      }
    })

    it('should handle network errors gracefully', async () => {
      const badRequest = axios.create({
        baseURL: 'http://invalid-url:9999',
        timeout: 1000,
      })

      try {
        await badRequest.get('/test')
      } catch (error) {
        expect(error.code).toBe('ECONNREFUSED')
      }
    })
  })

  describe('Response Format', () => {
    it('should return JSON format', async () => {
      const response = await request.get('/cloudsearch?keywords=test')
      
      expect(response.headers['content-type']).toContain('application/json')
    })

    it('should have consistent response structure', async () => {
      const response = await request.get('/cloudsearch?keywords=test')
      
      expect(response.data).toHaveProperty('code')
      expect(typeof response.data.code).toBe('number')
    })
  })
})
