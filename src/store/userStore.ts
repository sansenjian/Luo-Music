import { defineStore } from 'pinia'

import { storageAdapter } from '@/services/storageService'
import { clearQQCookieCache } from '@/api/qqmusic'
import { clearNeteaseServiceCookieCache } from '@/api/shared/neteaseServiceRequest'
import {
  createAnonymousPlatformAuthState,
  getPlatformAuthStatusText,
  isPlatformAuthStateAuthenticated,
  normalizePlatformAuthState,
  type PlatformAuthState
} from '@/platform/music/authState'
import { AUTH_REQUEST_CACHE_NAMESPACE, clearCacheNamespaces, clearCookieCache } from '@/utils/http'

export interface UserInfo {
  nickname?: string
  avatarUrl?: string
  userId?: string | number | null
  name?: string
  [key: string]: unknown
}

interface UserState {
  userInfo: UserInfo | null
  cookie: string
  isLoggedIn: boolean
  qqCookie: string
  qqLoggedIn: boolean
  platformAuthStates: Record<string, PlatformAuthState>
}

function clearAuthRequestCacheNamespace(): void {
  clearCacheNamespaces([AUTH_REQUEST_CACHE_NAMESPACE])
}

function createInitialPlatformAuthStates(): Record<string, PlatformAuthState> {
  return {
    netease: createAnonymousPlatformAuthState('netease'),
    qq: createAnonymousPlatformAuthState('qq')
  }
}

function createAnonymousPlatformAuthStates(platforms: string[]): Record<string, PlatformAuthState> {
  const platformIds = new Set(['netease', 'qq', ...platforms])

  return Object.fromEntries(
    Array.from(platformIds).map(platform => [platform, createAnonymousPlatformAuthState(platform)])
  )
}

function createNeteaseAuthState(userInfo: UserInfo | null, isLoggedIn: boolean): PlatformAuthState {
  const account =
    isLoggedIn && userInfo
      ? {
          id: userInfo.userId ?? userInfo.nickname ?? 'netease',
          nickname: userInfo.nickname ?? userInfo.name ?? 'Netease',
          ...(userInfo.avatarUrl ? { avatarUrl: userInfo.avatarUrl } : {})
        }
      : undefined

  return {
    platform: 'netease',
    status: isLoggedIn ? 'authenticated' : 'anonymous',
    ...(account ? { account } : {}),
    message: isLoggedIn ? '已登录' : '未登录',
    updatedAt: Date.now()
  }
}

function createQQAuthState(isLoggedIn: boolean): PlatformAuthState {
  return {
    platform: 'qq',
    status: isLoggedIn ? 'authenticated' : 'anonymous',
    message: isLoggedIn ? '已登录' : '未登录',
    updatedAt: Date.now()
  }
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    userInfo: null,
    cookie: '',
    isLoggedIn: false,
    qqCookie: '',
    qqLoggedIn: false,
    platformAuthStates: createInitialPlatformAuthStates()
  }),
  getters: {
    nickname: (state): string => state.userInfo?.nickname || '',
    avatarUrl: (state): string => state.userInfo?.avatarUrl || '',
    userId: (state): string | number | null => state.userInfo?.userId || null,
    isQQMusicLoggedIn: (state): boolean => state.qqLoggedIn,
    platformAuthList: (state): PlatformAuthState[] => {
      const priority = new Map([
        ['netease', 0],
        ['qq', 1]
      ])

      return Object.values(state.platformAuthStates).sort((left, right) => {
        const leftPriority = priority.get(left.platform) ?? 10
        const rightPriority = priority.get(right.platform) ?? 10

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority
        }

        return left.platform.localeCompare(right.platform)
      })
    },
    getPlatformAuthState:
      (state): ((platformId: string) => PlatformAuthState) =>
      platformId =>
        state.platformAuthStates[platformId] ?? createAnonymousPlatformAuthState(platformId),
    isPlatformAuthenticated:
      (state): ((platformId: string) => boolean) =>
      platformId =>
        isPlatformAuthStateAuthenticated(state.platformAuthStates[platformId]),
    getPlatformAuthStatusText:
      (state): ((platformId: string) => string) =>
      platformId =>
        getPlatformAuthStatusText(state.platformAuthStates[platformId]?.status ?? 'anonymous')
  },
  actions: {
    setPlatformAuthState(authState: PlatformAuthState | unknown, fallbackPlatform = 'unknown') {
      const normalized = normalizePlatformAuthState(authState, fallbackPlatform)
      this.platformAuthStates = {
        ...this.platformAuthStates,
        [normalized.platform]: normalized
      }
    },
    clearPlatformAuthState(platformId: string) {
      this.setPlatformAuthState(createAnonymousPlatformAuthState(platformId), platformId)
    },
    clearAllPlatformAuthStates() {
      this.platformAuthStates = createAnonymousPlatformAuthStates(
        Object.keys(this.platformAuthStates)
      )
    },
    syncNeteaseSession() {
      this.isLoggedIn = Boolean(this.userInfo && this.cookie)
      this.setPlatformAuthState(createNeteaseAuthState(this.userInfo, this.isLoggedIn), 'netease')
    },
    syncQQSession() {
      this.qqLoggedIn = Boolean(this.qqCookie)
      this.setPlatformAuthState(createQQAuthState(this.qqLoggedIn), 'qq')
    },
    setUserInfo(userInfo: UserInfo | null) {
      this.userInfo = userInfo
      this.syncNeteaseSession()
    },
    setCookie(cookie: string) {
      this.cookie = cookie
      this.syncNeteaseSession()
      clearNeteaseServiceCookieCache()
      clearCookieCache()
      clearAuthRequestCacheNamespace()
    },
    setQQCookie(cookie: string) {
      this.qqCookie = cookie
      this.syncQQSession()
      clearQQCookieCache()
      clearAuthRequestCacheNamespace()
    },
    login(userInfo: UserInfo, cookie: string) {
      this.userInfo = userInfo
      this.cookie = cookie
      this.syncNeteaseSession()
      clearNeteaseServiceCookieCache()
      clearCookieCache()
      clearAuthRequestCacheNamespace()
    },
    logout() {
      this.userInfo = null
      this.cookie = ''
      this.isLoggedIn = false
      this.syncNeteaseSession()
      clearNeteaseServiceCookieCache()
      clearCookieCache()
      clearAuthRequestCacheNamespace()
    },
    logoutQQ() {
      this.qqCookie = ''
      this.qqLoggedIn = false
      this.syncQQSession()
      clearQQCookieCache()
      clearAuthRequestCacheNamespace()
    }
  },
  persist: {
    storage: storageAdapter,
    pick: ['userInfo', 'cookie', 'qqCookie'],
    afterHydrate: context => {
      const store = context.store as unknown as {
        syncNeteaseSession: () => void
        syncQQSession: () => void
      }
      store.syncNeteaseSession()
      store.syncQQSession()
    }
  }
})
