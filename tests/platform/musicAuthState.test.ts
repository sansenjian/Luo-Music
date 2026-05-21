import { describe, expect, it } from 'vitest'

import {
  createAnonymousPlatformAuthState,
  createErrorPlatformAuthState,
  getPlatformAuthStatusText,
  isPlatformAuthStateAuthenticated,
  normalizePlatformAuthState
} from '@/platform/music/authState'

describe('platform music auth state helpers', () => {
  it('normalizes plugin auth state into the common platform model', () => {
    const result = normalizePlatformAuthState(
      {
        platform: 'kugou',
        status: 'authenticated',
        account: {
          id: 'user-1',
          nickname: 'Plugin User',
          avatarUrl: 'https://example.com/avatar.png',
          extra: {
            plan: 'vip'
          }
        },
        expiresAt: 123456,
        message: 'ok'
      },
      'fallback'
    )

    expect(result).toEqual({
      platform: 'kugou',
      status: 'authenticated',
      account: {
        id: 'user-1',
        nickname: 'Plugin User',
        avatarUrl: 'https://example.com/avatar.png',
        homepageUrl: undefined,
        extra: {
          plan: 'vip'
        }
      },
      expiresAt: 123456,
      message: 'ok',
      updatedAt: expect.any(Number)
    })
    expect(isPlatformAuthStateAuthenticated(result)).toBe(true)
  })

  it('falls back to anonymous state for invalid plugin payloads', () => {
    expect(normalizePlatformAuthState(null, 'kugou')).toEqual(
      expect.objectContaining({
        platform: 'kugou',
        status: 'anonymous',
        message: '未登录',
        updatedAt: expect.any(Number)
      })
    )
  })

  it('creates anonymous and error auth states with normalized platform ids', () => {
    expect(createAnonymousPlatformAuthState('')).toEqual(
      expect.objectContaining({
        platform: 'unknown',
        status: 'anonymous'
      })
    )
    expect(createErrorPlatformAuthState('kugou')).toEqual(
      expect.objectContaining({
        platform: 'kugou',
        status: 'error',
        message: '登录状态异常'
      })
    )
  })

  it('maps platform auth statuses to display text', () => {
    expect(getPlatformAuthStatusText('authenticated')).toBe('已登录')
    expect(getPlatformAuthStatusText('pending')).toBe('登录中')
    expect(getPlatformAuthStatusText('expired')).toBe('已过期')
    expect(getPlatformAuthStatusText('error')).toBe('状态异常')
    expect(getPlatformAuthStatusText('anonymous')).toBe('未登录')
  })
})
