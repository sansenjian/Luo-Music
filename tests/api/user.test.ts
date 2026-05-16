import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  checkQRStatus,
  configureUserApiDeps,
  getQRCode,
  getQRKey,
  getUserAccount,
  getUserDetail,
  getUserEvent,
  getUserLevel,
  getUserSubcount,
  logout,
  resetUserApiDeps
} from '@/api/user'

const apiRequestMock = vi.fn()

describe('user api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configureUserApiDeps({
      getApiService: () => ({
        request: apiRequestMock
      }),
      getTimestamp: () => 1234567890
    })
  })

  afterEach(() => {
    resetUserApiDeps()
  })

  it('routes QR login requests through ApiService', async () => {
    apiRequestMock.mockResolvedValue({})

    await getQRKey()
    await getQRCode('qr-key')
    await checkQRStatus('qr-key')

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, 'netease', '/login/qr/key', {
      timestamp: 1234567890
    })
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, 'netease', '/login/qr/create', {
      key: 'qr-key',
      qrimg: true,
      timestamp: 1234567890
    })
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, 'netease', '/login/qr/check', {
      key: 'qr-key',
      timestamp: 1234567890
    })
  })

  it('routes user account requests through ApiService', async () => {
    apiRequestMock.mockResolvedValue({})

    await getUserAccount('MUSIC_U=abc')
    await logout()
    await getUserSubcount()
    await getUserLevel()

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, 'netease', '/user/account', {
      cookie: 'MUSIC_U=abc',
      timestamp: 1234567890
    })
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, 'netease', '/logout', {
      timestamp: 1234567890
    })
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, 'netease', '/user/subcount', {
      timestamp: 1234567890
    })
    expect(apiRequestMock).toHaveBeenNthCalledWith(4, 'netease', '/user/level', {
      timestamp: 1234567890
    })
  })

  it('omits the cookie field when the user account request has no cookie', async () => {
    apiRequestMock.mockResolvedValue({})

    await getUserAccount()
    await getUserAccount('')
    await logout()
    await getUserSubcount()
    await getUserLevel()

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, 'netease', '/user/account', {
      timestamp: 1234567890
    })
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, 'netease', '/user/account', {
      timestamp: 1234567890
    })
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, 'netease', '/logout', {
      timestamp: 1234567890
    })
    expect(apiRequestMock).toHaveBeenNthCalledWith(4, 'netease', '/user/subcount', {
      timestamp: 1234567890
    })
    expect(apiRequestMock).toHaveBeenNthCalledWith(5, 'netease', '/user/level', {
      timestamp: 1234567890
    })
  })

  it('routes user detail and event requests through ApiService with params', async () => {
    apiRequestMock.mockResolvedValue({})

    await getUserDetail(42, 'MUSIC_U=abc')
    await getUserEvent(42, 20, 777)

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, 'netease', '/user/detail', {
      cookie: 'MUSIC_U=abc',
      uid: 42,
      timestamp: 1234567890
    })
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, 'netease', '/user/event', {
      uid: 42,
      limit: 20,
      lasttime: 777,
      timestamp: 1234567890
    })
  })
})
