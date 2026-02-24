import { defineStore } from 'pinia'

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
    },
  },

  persist: {
    storage: localStorage,
    paths: ['userInfo', 'cookie', 'isLoggedIn'],
  },
})
