import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const {
  buildQQMusicuSearchBody,
  extractQQSearchParams,
  isSearchPath,
  normalizeQQMusicuSearchResponse,
  requestQQMusicuSearch,
  handleQQSearchRequest
} = require('../../scripts/dev/qq-search-fallback.cjs') as {
  buildQQMusicuSearchBody: (keyword: string, limit: number, page: number) => Record<string, unknown>
  extractQQSearchParams: (requestUrl: string) => { keyword: string; limit: number; page: number }
  isSearchPath: (pathname: string) => boolean
  normalizeQQMusicuSearchResponse: (payload: Record<string, unknown>) => Record<string, unknown>
  requestQQMusicuSearch: (
    keyword: string,
    limit: number,
    page: number,
    timeoutMs?: number
  ) => Promise<Record<string, unknown>>
  handleQQSearchRequest: (
    req: Record<string, unknown>,
    res: Record<string, unknown>
  ) => Promise<boolean>
}

describe('qq search fallback', () => {
  it('extracts query-based QQ search params', () => {
    expect(extractQQSearchParams('/getSearchByKey?key=jay&limit=20&page=2')).toEqual({
      keyword: 'jay',
      limit: 20,
      page: 2
    })
  })

  it('extracts path-based QQ search params', () => {
    expect(extractQQSearchParams('/getSearchByKey/%E5%91%A8%E6%9D%B0%E4%BC%A6?limit=15')).toEqual({
      keyword: '周杰伦',
      limit: 15,
      page: 1
    })
  })

  it('falls back to the query keyword when the path segment cannot be decoded', () => {
    expect(extractQQSearchParams('/getSearchByKey/%E0%A4%A?key=jay&limit=12&page=3')).toEqual({
      keyword: 'jay',
      limit: 12,
      page: 3
    })
  })

  it('recognizes only QQ search paths', () => {
    expect(isSearchPath('/getSearchByKey')).toBe(true)
    expect(isSearchPath('/getSearchByKey/jay')).toBe(true)
    expect(isSearchPath('/getLyric')).toBe(false)
  })

  it('builds the musicu search payload with desktop search metadata', () => {
    expect(buildQQMusicuSearchBody('jay', 10, 3)).toEqual({
      comm: {
        ct: '19',
        cv: '1859',
        uin: '0'
      },
      req: {
        method: 'DoSearchForQQMusicDesktop',
        module: 'music.search.SearchCgiService',
        param: {
          grp: 1,
          num_per_page: 10,
          page_num: 3,
          query: 'jay',
          search_type: 0
        }
      }
    })
  })

  it('normalizes the musicu search response into the existing QQ wrapper shape', () => {
    expect(
      normalizeQQMusicuSearchResponse({
        code: 0,
        req: {
          code: 0,
          data: {
            code: 0,
            meta: {
              sum: 42
            },
            body: {
              song: {
                list: [{ mid: 'abc', name: 'test' }]
              }
            }
          }
        }
      })
    ).toEqual({
      response: {
        code: 0,
        song: {
          list: [{ mid: 'abc', name: 'test' }],
          totalnum: 42
        }
      }
    })
  })

  describe('requestQQMusicuSearch', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
      global.fetch = vi.fn() as unknown as typeof global.fetch
    })

    afterEach(() => {
      global.fetch = originalFetch
    })

    it('builds correct request and returns normalized payload on success', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          req: {
            code: 0,
            data: {
              code: 0,
              meta: { sum: 5 },
              body: { song: { list: [{ id: '1' }] } }
            }
          }
        })
      })

      const result = await requestQQMusicuSearch('jay', 20, 2)

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://u.y.qq.com/cgi-bin/musicu.fcg',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json;charset=utf-8'
          }),
          body: JSON.stringify(buildQQMusicuSearchBody('jay', 20, 2))
        })
      )
      expect(result).toEqual({
        response: {
          code: 0,
          song: { list: [{ id: '1' }], totalnum: 5 }
        }
      })
    })

    it('throws on non-2xx response with status in message', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('server error')
      })

      await expect(requestQQMusicuSearch('jay', 20, 2)).rejects.toThrow(/500/)
    })
  })

  describe('handleQQSearchRequest', () => {
    let originalFetch: typeof global.fetch
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      originalFetch = global.fetch
      global.fetch = vi.fn() as unknown as typeof global.fetch
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      global.fetch = originalFetch
      consoleErrorSpy.mockRestore()
    })

    const createMockReqRes = (overrides: Partial<{ method: string; url: string }> = {}) => {
      const bodyChunks: string[] = []

      const req = {
        method: 'GET',
        url: '/getSearchByKey?key=jay&limit=20&page=1',
        ...overrides
      }

      const res = {
        statusCode: 200,
        setHeader: vi.fn(() => {}),
        end: vi.fn((body?: string) => {
          if (body) bodyChunks.push(body)
        }),
        getBody: () => bodyChunks.join('')
      }

      return { req, res }
    }

    it('returns false for non-GET methods', async () => {
      const { req, res } = createMockReqRes({ method: 'POST' })

      const handled = await handleQQSearchRequest(req, res)

      expect(handled).toBe(false)
      expect(res.end).not.toHaveBeenCalled()
    })

    it('returns false for non-search paths', async () => {
      const { req, res } = createMockReqRes({ url: '/other-endpoint' })

      const handled = await handleQQSearchRequest(req, res)

      expect(handled).toBe(false)
      expect(res.end).not.toHaveBeenCalled()
    })

    it('writes 400 when key is missing', async () => {
      const { req, res } = createMockReqRes({ url: '/getSearchByKey?limit=10' })

      const handled = await handleQQSearchRequest(req, res)

      expect(handled).toBe(true)
      expect(res.statusCode).toBe(400)
      const body = res.getBody()
      expect(body).toBeTruthy()
      expect(JSON.parse(body)).toEqual({ response: 'search key is null' })
    })

    it('writes 200 on successful search', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          req: {
            code: 0,
            data: {
              code: 0,
              meta: { sum: 1 },
              body: { song: { list: [] } }
            }
          }
        })
      })

      const { req, res } = createMockReqRes({ url: '/getSearchByKey?key=jay' })

      const handled = await handleQQSearchRequest(req, res)

      expect(handled).toBe(true)
      expect(res.statusCode).toBe(200)
      const body = res.getBody()
      expect(body).toBeTruthy()
      expect(JSON.parse(body)).toEqual({
        response: {
          code: 0,
          song: { list: [], totalnum: 1 }
        }
      })
    })

    it('writes 500 on upstream failure', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 502,
        text: vi.fn().mockResolvedValue('bad gateway')
      })

      const { req, res } = createMockReqRes({ url: '/getSearchByKey?key=jay' })

      const handled = await handleQQSearchRequest(req, res)

      expect(handled).toBe(true)
      expect(res.statusCode).toBe(500)
      const body = res.getBody()
      expect(body).toBeTruthy()
      const parsed = JSON.parse(body)
      expect(parsed.error).toBeTruthy()
      expect(parsed.error.message).toBe('Internal server error while searching')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })
})
