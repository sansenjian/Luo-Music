import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  buildQQMusicuSearchBody,
  extractQQSearchParams,
  isSearchPath,
  normalizeQQMusicuSearchResponse
} = require('../../scripts/dev/qq-search-fallback.cjs') as {
  buildQQMusicuSearchBody: (keyword: string, limit: number, page: number) => Record<string, unknown>
  extractQQSearchParams: (requestUrl: string) => { keyword: string; limit: number; page: number }
  isSearchPath: (pathname: string) => boolean
  normalizeQQMusicuSearchResponse: (payload: Record<string, unknown>) => Record<string, unknown>
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
})
