import { describe, expect, it } from 'vitest'

import {
  HTTP_COOKIE_CACHE_TTL,
  HTTP_DEFAULT_RETRY_COUNT,
  HTTP_DEFAULT_RETRY_DELAY,
  HTTP_DEFAULT_TIMEOUT,
  HTTP_HEADERS
} from '@/constants/http'

describe('http constants', () => {
  it('keeps request defaults separate from service port defaults', () => {
    expect(HTTP_COOKIE_CACHE_TTL).toBe(5000)
    expect(HTTP_DEFAULT_TIMEOUT).toBe(30000)
    expect(HTTP_DEFAULT_RETRY_COUNT).toBe(1)
    expect(HTTP_DEFAULT_RETRY_DELAY).toBe(1000)
    expect(HTTP_HEADERS).toEqual({
      'Content-Type': 'application/json'
    })
  })
})
