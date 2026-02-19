import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock request module
vi.mock('../../../src/utils/request', () => ({
  default: vi.fn()
}))

// Import after mocking
import request from '../../../src/utils/request'
import { search, searchSuggest, getHotSearch } from '../../../src/api/search'

describe('Search API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('search', () => {
    it('should search with default parameters', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, result: { songs: [] } }
      })

      const result = await search('test')

      // Assert result shape
      expect(result).toHaveProperty('data')

      // Assert request was called with correct URL and query params
      expect(request).toHaveBeenCalledWith({
        url: '/cloudsearch',
        method: 'get',
        params: {
          keywords: 'test',
          type: 1,
          limit: 30,
          offset: 0
        }
      })
    })

    it('should search with custom type', async () => {
      const types = [1, 10, 100, 1000, 1002, 1004, 1006, 1009, 1014]

      for (const type of types) {
        request.mockResolvedValueOnce({
          data: { code: 200, result: { songs: [] } }
        })

        await search('test', type)

        expect(request).toHaveBeenLastCalledWith({
          url: '/cloudsearch',
          method: 'get',
          params: {
            keywords: 'test',
            type,
            limit: 30,
            offset: 0
          }
        })
      }
    })

    it('should search with custom limit', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, result: { songs: [] } }
      })

      await search('test', 1, 50)

      expect(request).toHaveBeenCalledWith({
        url: '/cloudsearch',
        method: 'get',
        params: {
          keywords: 'test',
          type: 1,
          limit: 50,
          offset: 0
        }
      })
    })

    it('should search with offset for pagination', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, result: { songs: [] } }
      })

      await search('test', 1, 30, 30)

      expect(request).toHaveBeenCalledWith({
        url: '/cloudsearch',
        method: 'get',
        params: {
          keywords: 'test',
          type: 1,
          limit: 30,
          offset: 30
        }
      })
    })

    it('should handle empty keywords', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, result: { songs: [] } }
      })

      await search('')

      expect(request).toHaveBeenCalledWith({
        url: '/cloudsearch',
        method: 'get',
        params: {
          keywords: '',
          type: 1,
          limit: 30,
          offset: 0
        }
      })
    })

    it('should handle special characters in keywords', async () => {
      const specialKeywords = ['test@#$%', '测试', 'test  test', 'test+test']

      for (const keyword of specialKeywords) {
        request.mockResolvedValueOnce({
          data: { code: 200, result: { songs: [] } }
        })

        await search(keyword)

        expect(request).toHaveBeenLastCalledWith({
          url: '/cloudsearch',
          method: 'get',
          params: {
            keywords: keyword,
            type: 1,
            limit: 30,
            offset: 0
          }
        })
      }
    })

    it('should handle very long keywords', async () => {
      const longKeyword = 'a'.repeat(200)

      request.mockResolvedValueOnce({
        data: { code: 200, result: { songs: [] } }
      })

      await search(longKeyword)

      expect(request).toHaveBeenCalledWith({
        url: '/cloudsearch',
        method: 'get',
        params: {
          keywords: longKeyword,
          type: 1,
          limit: 30,
          offset: 0
        }
      })
    })

    it('should handle unicode and emoji', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, result: { songs: [] } }
      })

      await search('测试 🎵')

      expect(request).toHaveBeenCalledWith({
        url: '/cloudsearch',
        method: 'get',
        params: {
          keywords: '测试 🎵',
          type: 1,
          limit: 30,
          offset: 0
        }
      })
    })
  })

  describe('searchSuggest', () => {
    it('should get search suggestions', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, result: { songs: [], artists: [] } }
      })

      const result = await searchSuggest('test')

      expect(result).toHaveProperty('data')
      expect(request).toHaveBeenCalledWith({
        url: '/search/suggest',
        method: 'get',
        params: { keywords: 'test' }
      })
    })

    it('should handle empty keywords', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, result: { songs: [], artists: [] } }
      })

      await searchSuggest('')

      expect(request).toHaveBeenCalledWith({
        url: '/search/suggest',
        method: 'get',
        params: { keywords: '' }
      })
    })

    it('should handle partial input', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, result: { songs: [], artists: [] } }
      })

      await searchSuggest('te')

      expect(request).toHaveBeenCalledWith({
        url: '/search/suggest',
        method: 'get',
        params: { keywords: 'te' }
      })
    })

    it('should handle single character', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, result: { songs: [], artists: [] } }
      })

      await searchSuggest('a')

      expect(request).toHaveBeenCalledWith({
        url: '/search/suggest',
        method: 'get',
        params: { keywords: 'a' }
      })
    })

    it('should handle special characters', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, result: { songs: [], artists: [] } }
      })

      await searchSuggest('@#$%')

      expect(request).toHaveBeenCalledWith({
        url: '/search/suggest',
        method: 'get',
        params: { keywords: '@#$%' }
      })
    })
  })

  describe('getHotSearch', () => {
    it('should get hot search list', async () => {
      request.mockResolvedValueOnce({
        data: {
          code: 200,
          data: [
            { searchWord: '热门1', score: 100 },
            { searchWord: '热门2', score: 90 }
          ]
        }
      })

      const result = await getHotSearch()

      expect(result).toHaveProperty('data')
      expect(Array.isArray(result.data.data)).toBe(true)
      expect(request).toHaveBeenCalledWith({
        url: '/search/hot/detail',
        method: 'get'
      })
    })

    it('should return hot search with scores', async () => {
      request.mockResolvedValueOnce({
        data: {
          code: 200,
          data: [
            { searchWord: '热门1', score: 100 },
            { searchWord: '热门2', score: 90 }
          ]
        }
      })

      const result = await getHotSearch()

      expect(result).toHaveProperty('data')
      expect(result.data.data[0]).toHaveProperty('searchWord')
      expect(result.data.data[0]).toHaveProperty('score')
      expect(request).toHaveBeenCalledWith({
        url: '/search/hot/detail',
        method: 'get'
      })
    })
  })
})
