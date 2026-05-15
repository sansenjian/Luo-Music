import { describe, expect, it } from 'vitest'

import { DEV_API_SERVER, NETEASE_API_PORT, QQ_API_PORT, QQ_API_SERVER } from '@/constants/http'

describe('http constants', () => {
  it('uses the loopback address for the packaged Netease API server', () => {
    expect(DEV_API_SERVER).toBe(`http://127.0.0.1:${NETEASE_API_PORT}`)
    expect(QQ_API_SERVER).toBe(`http://127.0.0.1:${QQ_API_PORT}`)
  })
})
