import { describe, expect, it } from 'vitest'

import { normalizeQQRequestUrl } from '../../api/qq/[...qq]'

describe('qq Vercel function url normalization', () => {
  it('strips the internal qq function prefix and preserves query params', () => {
    expect(normalizeQQRequestUrl('/api/qq/getSearchByKey?key=test&page=1')).toBe(
      '/getSearchByKey?key=test&page=1'
    )
  })

  it('strips the public qq api prefix used by the frontend', () => {
    expect(normalizeQQRequestUrl('/qq-api/getSongInfo/123')).toBe('/getSongInfo/123')
  })

  it('normalizes the qq api root path', () => {
    expect(normalizeQQRequestUrl('/api/qq')).toBe('/')
    expect(normalizeQQRequestUrl('/qq-api')).toBe('/')
  })

  it('keeps already normalized paths unchanged', () => {
    expect(normalizeQQRequestUrl('/getHotkey')).toBe('/getHotkey')
  })
})
