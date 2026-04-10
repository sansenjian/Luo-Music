import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

import Home from '../views/Home.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/user',
    name: 'UserCenter',
    meta: {
      requiresVueQuery: true
    },
    component: () => import('../views/UserCenter.vue')
  },
  {
    path: '/desktop-lyric',
    name: 'DesktopLyric',
    component: () => import('../components/LyricFloat.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
