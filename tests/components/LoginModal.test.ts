import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUserStore } from '@/store/userStore'

import { createDeferred } from '../helpers/deferred'

const apiMocks = vi.hoisted(() => ({
  getQRKey: vi.fn(),
  getQRCode: vi.fn(),
  checkQRStatus: vi.fn(),
  getUserAccount: vi.fn(),
  getUserDetail: vi.fn()
}))

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
}))

vi.mock('@/api/user', () => ({
  getQRKey: apiMocks.getQRKey,
  getQRCode: apiMocks.getQRCode,
  checkQRStatus: apiMocks.checkQRStatus,
  getUserAccount: apiMocks.getUserAccount,
  getUserDetail: apiMocks.getUserDetail
}))

vi.mock('@/services', () => ({
  services: {
    logger: () => ({
      createLogger: () => loggerMocks
    })
  }
}))

describe('LoginModal.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    apiMocks.getQRKey.mockReset()
    apiMocks.getQRCode.mockReset()
    apiMocks.checkQRStatus.mockReset()
    apiMocks.getUserAccount.mockReset()
    apiMocks.getUserDetail.mockReset()
    loggerMocks.debug.mockReset()
    loggerMocks.error.mockReset()
    loggerMocks.warn.mockReset()
    document.cookie = 'MUSIC_U=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ignores stale QR fetch results after unmount', async () => {
    const qrKeyRequest = createDeferred<{ data: { unikey: string } }>()
    apiMocks.getQRKey.mockReturnValue(qrKeyRequest.promise)

    const { default: LoginModal } = await import('@/components/LoginModal.vue')
    const wrapper = mount(LoginModal)

    wrapper.unmount()
    qrKeyRequest.resolve({ data: { unikey: 'qr-key' } })
    await flushPromises()

    expect(apiMocks.getQRCode).not.toHaveBeenCalled()
    expect(apiMocks.checkQRStatus).not.toHaveBeenCalled()
  })

  it('clears delayed close callbacks on unmount after login success', async () => {
    apiMocks.getQRKey.mockResolvedValue({ data: { unikey: 'qr-key' } })
    apiMocks.getQRCode.mockResolvedValue({ data: { qrimg: 'data:image/png;base64,qr' } })
    apiMocks.checkQRStatus.mockResolvedValue({ code: 803, cookie: 'cookie' })
    apiMocks.getUserAccount.mockResolvedValue({ profile: { nickname: 'tester' } })

    const { default: LoginModal } = await import('@/components/LoginModal.vue')
    const wrapper = mount(LoginModal)

    await flushPromises()
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()

    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(500)

    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('marks login successful when QR status is deeply wrapped and cookie falls back to the browser session', async () => {
    document.cookie = 'MUSIC_U=browser-cookie; path=/'

    apiMocks.getQRKey.mockResolvedValue({ data: { data: { unikey: 'qr-key' } } })
    apiMocks.getQRCode.mockResolvedValue({ body: { data: { qrimg: 'data:image/png;base64,qr' } } })
    apiMocks.checkQRStatus.mockResolvedValue({ data: { data: { code: '803' } } })
    apiMocks.getUserAccount.mockResolvedValue({
      data: {
        data: {
          profile: { nickname: 'tester' }
        }
      }
    })

    const { default: LoginModal } = await import('@/components/LoginModal.vue')
    mount(LoginModal)

    await flushPromises()
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()

    const userStore = useUserStore()
    expect(userStore.isLoggedIn).toBe(true)
    expect(userStore.cookie).toContain('MUSIC_U=browser-cookie')
    expect(userStore.nickname).toBe('tester')
  })

  it('falls back to user detail when user account is missing the profile payload', async () => {
    apiMocks.getQRKey.mockResolvedValue({ data: { unikey: 'qr-key' } })
    apiMocks.getQRCode.mockResolvedValue({ data: { qrimg: 'data:image/png;base64,qr' } })
    apiMocks.checkQRStatus.mockResolvedValue({ code: 803, cookie: 'MUSIC_U=login-cookie' })
    apiMocks.getUserAccount.mockResolvedValue({
      body: {
        data: {
          account: { id: 42 }
        }
      }
    })
    apiMocks.getUserDetail.mockResolvedValue({
      body: {
        data: {
          profile: { nickname: 'detail-user', userId: 42 }
        }
      }
    })

    const { default: LoginModal } = await import('@/components/LoginModal.vue')
    mount(LoginModal)

    await flushPromises()
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()

    const userStore = useUserStore()
    expect(apiMocks.getUserAccount).toHaveBeenCalledWith('MUSIC_U=login-cookie')
    expect(apiMocks.getUserDetail).toHaveBeenCalledWith(42, 'MUSIC_U=login-cookie')
    expect(userStore.isLoggedIn).toBe(true)
    expect(userStore.nickname).toBe('detail-user')
  })
})
