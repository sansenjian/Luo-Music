import { defineStore } from 'pinia'

import { clearQQCookieCache } from '@/api/qqmusic'
import {
  AUTH_REQUEST_CACHE_NAMESPACE,
  clearCacheNamespaces,
  clearCookieCache
} from '@/utils/http'

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
}

function clearAuthRequestCacheNamespace(): void {
  clearCacheNamespaces([AUTH_REQUEST_CACHE_NAMESPACE])
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    userInfo: null,
    cookie: '',
    isLoggedIn: false,
    qqCookie: '',
    qqLoggedIn: false
  }),
  getters: {
    nickname: (state): string => state.userInfo?.nickname || '',
    avatarUrl: (state): string => state.userInfo?.avatarUrl || '',
    userId: (state): string | number | null => state.userInfo?.userId || null,
    isQQMusicLoggedIn: (state): boolean => state.qqLoggedIn
  },
  actions: {
    syncNeteaseSession() {
      this.isLoggedIn = Boolean(this.userInfo && this.cookie)
    },
    syncQQSession() {
      this.qqLoggedIn = Boolean(this.qqCookie)
    },
    setUserInfo(userInfo: UserInfo | null) {
      this.userInfo = userInfo
      this.syncNeteaseSession()
    },
    setCookie(cookie: string) {
      this.cookie = cookie
      this.syncNeteaseSession()
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
      clearCookieCache()
      clearAuthRequestCacheNamespace()
    },
    logout() {
      this.userInfo = null
      this.cookie = ''
      this.isLoggedIn = false
      clearCookieCache()
      clearAuthRequestCacheNamespace()
    },
    logoutQQ() {
      this.qqCookie = ''
      this.qqLoggedIn = false
      clearQQCookieCache()
      clearAuthRequestCacheNamespace()
    }
  },
  persist: {
    storage: localStorage,
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
