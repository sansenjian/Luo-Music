import { defineStore } from 'pinia'
import { clearCookieCache } from '../api/request'

export const useUserStore = defineStore('user', {
  state: () => ({
    userInfo: null,
    cookie: '',
    isLoggedIn: false,
  }),

  getters: {
    nickname: (state) => state.userInfo?.nickname || '',
    avatarUrl: (state) => state.userInfo?.avatarUrl || '',
    userId: (state) => state.userInfo?.userId || null,
  },

  actions: {
    setUserInfo(userInfo) {
      this.userInfo = userInfo
      this.isLoggedIn = !!userInfo
    },

    setCookie(cookie) {
      this.cookie = cookie
    },

    login(userInfo, cookie) {
      this.userInfo = userInfo
      this.cookie = cookie
      this.isLoggedIn = true
    },

    logout() {
      this.userInfo = null
      this.cookie = ''
      this.isLoggedIn = false
      // Clear the request cache to prevent stale cookie usage
      clearCookieCache()
    },
  },

  persist: {
    storage: localStorage,
    paths: ['userInfo', 'isLoggedIn'],
    // Note: 'cookie' is intentionally excluded from persistence
    // for security reasons. Cookie should be handled via httpOnly
    // server-set cookies or refreshed on reload.
  },
})
