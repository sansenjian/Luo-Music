import { describe, expect, it } from 'vitest'

import { NETEASE_API_PORT, QQ_API_PORT } from '@/constants/http'

describe('http constants', () => {
  it('keeps service port defaults available for ConfigService', () => {
    expect(NETEASE_API_PORT).toBe(14532)
    expect(QQ_API_PORT).toBe(3200)
  })
})
