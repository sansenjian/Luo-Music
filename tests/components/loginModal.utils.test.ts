import { describe, expect, it } from 'vitest'

import {
  extractQrCookie,
  extractQrImage,
  extractQrKey,
  extractQrStatusCode,
  extractUserId,
  extractUserProfile
} from '@/components/loginModal.utils'

describe('loginModal.utils', () => {
  it('extracts wrapped Netease QR payloads', () => {
    expect(extractQrKey({ body: { data: { unikey: 'qr-key' } } })).toBe('qr-key')
    expect(extractQrImage({ body: { data: { qrimg: 'data:image/png;base64,qr' } } })).toBe(
      'data:image/png;base64,qr'
    )
    expect(extractQrStatusCode({ body: { code: 803, cookie: 'wrapped-cookie' } })).toBe(803)
    expect(extractQrCookie({ body: { code: 803, cookie: 'wrapped-cookie' } })).toBe(
      'wrapped-cookie'
    )
  })

  it('extracts wrapped Netease account profiles', () => {
    expect(
      extractUserProfile({
        body: {
          data: {
            profile: { nickname: 'tester' }
          }
        }
      })
    ).toEqual({ nickname: 'tester' })
    expect(
      extractUserId({
        body: {
          data: {
            account: { id: 42 }
          }
        }
      })
    ).toBe(42)
  })

  it('extracts deeply wrapped payloads and normalizes status values', () => {
    expect(extractQrKey({ data: { data: { unikey: 'deep-key' } } })).toBe('deep-key')
    expect(extractQrImage({ data: { data: { qrimg: 'data:image/png;base64,deep-qr' } } })).toBe(
      'data:image/png;base64,deep-qr'
    )
    expect(extractQrStatusCode({ data: { data: { code: '803' } } })).toBe(803)
    expect(extractQrCookie({ data: { data: { cookie: ['MUSIC_U=abc', '__csrf=def'] } } })).toBe(
      'MUSIC_U=abc; __csrf=def'
    )
    expect(
      extractUserProfile({
        data: {
          data: {
            profile: { nickname: 'deep-tester' }
          }
        }
      })
    ).toEqual({ nickname: 'deep-tester' })
    expect(
      extractUserId({
        data: {
          data: {
            profile: { userId: '24' }
          }
        }
      })
    ).toBe(24)
  })
})
