import { getUserAccount, getUserDetail } from '@/api/user'
import { useUserStore } from '@/store/userStore'
import {
  extractUserId,
  extractUserProfile,
  type UserAccountResponse
} from '@/components/loginModal.utils'

type LoginProfileResult = {
  cookie: string
  profile: Record<string, unknown>
}

function resolveBrowserCookie(): string {
  if (typeof document === 'undefined' || typeof document.cookie !== 'string') {
    return ''
  }

  return document.cookie.trim()
}

function resolveSessionCookie(cookie: string, storedCookie: string): string {
  const trimmedCookie = cookie.trim()
  if (trimmedCookie.length > 0) {
    return trimmedCookie
  }

  const trimmedStoredCookie = storedCookie.trim()
  if (trimmedStoredCookie.length > 0) {
    return trimmedStoredCookie
  }

  return resolveBrowserCookie()
}

export function useNeteaseLoginProfile() {
  const userStore = useUserStore()

  async function loginAndFetchProfile(cookie: string): Promise<LoginProfileResult> {
    const sessionCookie = resolveSessionCookie(cookie, userStore.cookie)
    const userRes = (await getUserAccount(sessionCookie)) as UserAccountResponse

    let profile = extractUserProfile(userRes)
    if (!profile) {
      const userId = extractUserId(userRes)
      if (userId !== null) {
        const userDetailRes = (await getUserDetail(userId, sessionCookie)) as UserAccountResponse
        profile = extractUserProfile(userDetailRes)
      }
    }

    if (!profile) {
      throw new Error('Missing user profile')
    }

    return {
      cookie: sessionCookie,
      profile
    }
  }

  return {
    loginAndFetchProfile
  }
}
