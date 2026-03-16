import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    // ✅ 路由懒加载 - 只有访问首页时才加载 Home.vue
    component: () => import('../views/Home.vue')
  },
  {
    path: '/user',
    name: 'UserCenter',
    // ✅ 路由懒加载 - 只有访问用户中心时才加载 UserCenter.vue
    component: () => import('../views/UserCenter.vue')
  },
  {
    path: '/desktop-lyric',
    name: 'DesktopLyric',
    // ✅ 路由懒加载 - 桌面歌词窗口专用路由（仅 Electron 环境）
    component: () => import('../components/LyricFloat.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(), // Electron 必须使用 Hash 模式
  routes
})

export default router
