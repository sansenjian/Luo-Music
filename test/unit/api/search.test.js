import { describe, it, expect, vi, beforeEach } from 'vitest'
import { search, searchSuggest, getHotSearch } from '../../../src/api/search'

// Mock request module
vi.mock('../../../src/utils/request', () => ({
  default: vi.fn((config) => Promise.resolve({ 
    data: { 
      code: 200, 
      ...mockResponseData[config.url],
      ...config.params
    } 
  }))
}))

const mockResponseData = {
  '/cloudsearch': {
    result: {
      songs: [
        { id: 1, name: 'Test Song', artists: [{ name: 'Test Artist' }] }
      ],
      songCount: 100
    }
  },
  '/search/suggest': {
    result: {
      songs: [{ id: 1, name: 'Suggestion 1' }],
      artists: [{ id: 1, name: 'Artist 1' }]
    }
  },
  '/search/hot/detail': {
    data: [
      { searchWord: '热门1', score: 100 },
      { searchWord: '热门2', score: 90 }
    ]
  }
}

describe('Search API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('search', () => {
    it('should search with default parameters', async () => {
      const result = await search('test')
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('result')
    })

    it('should search with custom type', async () => {
      const types = [1, 10, 100, 1000, 1002, 1004, 1006, 1009, 1014]
      for (const type of types) {
        const result = await search('test', type)
        expect(result).toHaveProperty('data')
      }
    })

    it('should search with custom limit', async () => {
      const result = await search('test', 1, 50)
      expect(result).toHaveProperty('data')
    })

    it('should search with offset for pagination', async () => {
      const result = await search('test', 1, 30, 30)
      expect(result).toHaveProperty('data')
    })

    it('should handle empty keywords', async () => {
      const result = await search('')
      expect(result).toHaveProperty('data')
    })

    it('should handle special characters in keywords', async () => {
      const specialKeywords = ['test@#$%', '测试', 'test  test', 'test+test']
      for (const keyword of specialKeywords) {
        const result = await search(keyword)
        expect(result).toHaveProperty('data')
      }
    })

    it('should handle very long keywords', async () => {
      const longKeyword = 'a'.repeat(200)
      const result = await search(longKeyword)
      expect(result).toHaveProperty('data')
    })

    it('should handle unicode and emoji', async () => {
      const result = await search('测试 🎵')
      expect(result).toHaveProperty('data')
    })
  })

  describe('searchSuggest', () => {
    it('should get search suggestions', async () => {
      const result = await searchSuggest('test')
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('result')
    })

    it('should handle empty keywords', async () => {
      const result = await searchSuggest('')
      expect(result).toHaveProperty('data')
    })

    it('should handle partial input', async () => {
      const result = await searchSuggest('te')
      expect(result).toHaveProperty('data')
    })

    it('should handle single character', async () => {
      const result = await searchSuggest('a')
      expect(result).toHaveProperty('data')
    })

    it('should handle special characters', async () => {
      const result = await searchSuggest('@#$%')
      expect(result).toHaveProperty('data')
    })
  })

  describe('getHotSearch', () => {
    it('should get hot search list', async () => {
      const result = await getHotSearch()
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('data')
      expect(Array.isArray(result.data.data)).toBe(true)
    })

    it('should return hot search with scores', async () => {
      const result = await getHotSearch()
      expect(result).toHaveProperty('data')
      if (result.data.data && result.data.data.length > 0) {
        expect(result.data.data[0]).toHaveProperty('searchWord')
        expect(result.data.data[0]).toHaveProperty('score')
      }
    })
  })
})
