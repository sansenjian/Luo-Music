import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  getUserAccount: vi.fn(),
  getUserDetail: vi.fn()
}))

vi.mock('@/api/user', () => ({
  getUserAccount: apiMocks.getUserAccount,
  getUserDetail: apiMocks.getUserDetail
}))

import { useNeteaseLoginProfile } from '@/composables/useNeteaseLoginProfile'
import { useUserStore } from '@/store/userStore'

describe('useNeteaseLoginProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.cookie = 'MUSIC_U=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
  })

  it('falls back to the browser cookie when the hydrated store cookie is malformed', async () => {
    document.cookie = 'MUSIC_U=browser-cookie; path=/'

    const userStore = useUserStore()
    ;(userStore as unknown as { cookie: unknown }).cookie = null

    apiMocks.getUserAccount.mockResolvedValue({
      profile: { nickname: 'tester' }
    })

    const { loginAndFetchProfile } = useNeteaseLoginProfile()
    const result = await loginAndFetchProfile('')

    expect(apiMocks.getUserAccount).toHaveBeenCalledWith(
      expect.stringContaining('MUSIC_U=browser-cookie')
    )
    expect(apiMocks.getUserDetail).not.toHaveBeenCalled()
    expect(result).toEqual({
      cookie: expect.stringContaining('MUSIC_U=browser-cookie'),
      profile: { nickname: 'tester' }
    })
  })
})
