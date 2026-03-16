<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { logout } from '../api/user'
import { qqMusicApi } from '../api/qqmusic'
import { isElectron } from '../platform'
import { services } from '../services'
import { useUserStore } from '../store/userStore'
import LoginModal from './LoginModal.vue'
import QQLoginModal from './QQLoginModal.vue'

type QQLoginStatusResponse = {
  data?: {
    cookie?: string
  }
  body?: {
    data?: {
      cookie?: string
    }
  }
}

const router = useRouter()
const logger = services.logger().createLogger('userAvatar')
const userStore = useUserStore()

const showLoginModal = ref(false)
const showQQLoginModal = ref(false)
const showDropdown = ref(false)

let hideTimeout: ReturnType<typeof setTimeout> | null = null

const isQQMusicLoggedIn = computed(() => userStore.isQQMusicLoggedIn)

async function checkQQMusicLoginStatus(): Promise<void> {
  if (!userStore.qqCookie) {
    userStore.logoutQQ()
    return
  }

  try {
    const res = (await qqMusicApi.checkQQMusicLogin()) as QQLoginStatusResponse
    const cookie = res?.data?.cookie || res?.body?.data?.cookie || ''

    if (cookie) {
      userStore.syncQQSession()
      return
    }

    userStore.logoutQQ()
  } catch (error) {
    logger.warn('Failed to refresh QQ Music login state', error)
    userStore.logoutQQ()
  }
}

async function handleLogout(): Promise<void> {
  try {
    await logout()
  } catch (error) {
    logger.warn('Netease logout request failed, clearing local session', error)
  } finally {
    userStore.logout()
    showDropdown.value = false
  }
}

function openLogin(): void {
  showLoginModal.value = true
  showDropdown.value = false
}

function openQQLogin(): void {
  showQQLoginModal.value = true
  showDropdown.value = false
}

function openUserCenter(): void {
  void router.push('/user')
  showDropdown.value = false
}

function showMenu(): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  showDropdown.value = true
}

function hideMenu(): void {
  hideTimeout = setTimeout(() => {
    showDropdown.value = false
  }, 150)
}

function handleAvatarClick(): void {
  if (userStore.isLoggedIn) {
    openUserCenter()
    return
  }

  openLogin()
}

function handleQQLoginSuccess(): void {
  showDropdown.value = true
}

onMounted(() => {
  if (isElectron) {
    void checkQQMusicLoginStatus()
  }
})

onUnmounted(() => {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
})
</script>

<template>
  <div class="user-avatar-wrapper" @mouseleave="hideMenu">
    <div class="user-trigger" @mouseenter="showMenu" @click="handleAvatarClick">
      <img
        v-if="userStore.isLoggedIn && userStore.avatarUrl"
        :src="userStore.avatarUrl"
        :alt="userStore.nickname"
        class="avatar"
      />
      <div v-else class="avatar-placeholder">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </div>
    </div>

    <Transition name="dropdown">
      <div v-if="showDropdown" class="dropdown" @mouseenter="showMenu" @mouseleave="hideMenu">
        <div class="dropdown-header">
          <template v-if="userStore.isLoggedIn">
            <img
              v-if="userStore.avatarUrl"
              :src="userStore.avatarUrl"
              :alt="userStore.nickname"
              class="dropdown-avatar"
            />
            <div v-else class="dropdown-avatar-placeholder"></div>
            <div class="dropdown-info">
              <span class="dropdown-nickname">{{ userStore.nickname }}</span>
              <span class="dropdown-id">ID: {{ userStore.userId }}</span>
            </div>
            <button class="logout-btn-small" @click="handleLogout" title="退出登录">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
          </template>
          <template v-else>
            <div class="dropdown-avatar-placeholder">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <div class="dropdown-info" @click="openLogin" style="cursor: pointer">
              <span class="dropdown-nickname">未登录</span>
              <span class="dropdown-id login-link">点击登录 &gt;</span>
            </div>
          </template>
        </div>

        <div class="dropdown-menu">
          <button v-if="userStore.isLoggedIn" class="menu-btn" @click="openUserCenter">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            个人中心
          </button>

          <button class="menu-btn" @click="openQQLogin">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <path d="M9 9h6"></path>
              <path d="M9 13h6"></path>
              <path d="M9 17h6"></path>
            </svg>
            QQ 音乐登录
            <span v-if="isQQMusicLoggedIn" class="login-status-badge">已登录</span>
          </button>
        </div>
      </div>
    </Transition>

    <LoginModal v-if="showLoginModal" @close="showLoginModal = false" />
    <QQLoginModal v-model="showQQLoginModal" @login-success="handleQQLoginSuccess" />
  </div>
</template>

<style scoped>
.user-avatar-wrapper {
  position: relative;
  -webkit-app-region: no-drag;
}

.user-trigger {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--black);
  object-fit: cover;
  transition: transform 0.2s;
}

.avatar:hover {
  transform: scale(1.05);
}

.avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--black);
  background: var(--white);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gray);
  transition: all 0.2s;
}

.avatar-placeholder:hover {
  background: var(--black);
  color: var(--white);
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--white);
  border: 2px solid var(--black);
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.15);
  min-width: 220px;
  z-index: 100;
  overflow: hidden;
  animation: slideIn 0.2s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: linear-gradient(135deg, var(--bg) 0%, var(--white) 100%);
  border-bottom: 2px solid var(--black);
  position: relative;
}

.logout-btn-small {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  color: var(--gray);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logout-btn-small:hover {
  color: #dc3545;
  background: rgba(220, 53, 69, 0.1);
  border-radius: 50%;
}

.dropdown-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid var(--black);
  object-fit: cover;
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.1);
}

.dropdown-avatar-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid var(--black);
  background: var(--white);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gray);
}

.dropdown-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  overflow: hidden;
}

.dropdown-nickname {
  font-size: 15px;
  font-weight: 700;
  color: var(--black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-id {
  font-size: 11px;
  color: var(--gray);
  font-family: monospace;
}

.dropdown-menu {
  display: flex;
  flex-direction: column;
}

.menu-btn,
.logout-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--white);
  border: none;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--black);
  transition: all 0.2s;
  position: relative;
}

.menu-btn:last-child,
.logout-btn:last-child {
  border-bottom: none;
}

.menu-btn:hover,
.logout-btn:hover {
  background: var(--black);
  color: var(--white);
  padding-left: 20px;
}

.login-status-badge {
  margin-left: auto;
  padding: 2px 8px;
  background: #28a745;
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
  flex-shrink: 0;
}

.menu-btn svg,
.logout-btn svg {
  flex-shrink: 0;
  transition: transform 0.2s;
}

.menu-btn:hover svg,
.logout-btn:hover svg {
  transform: translateX(4px);
}

.login-link {
  color: #4ade80;
  font-weight: 600;
  transition: all 0.2s;
}

.login-link:hover {
  text-decoration: underline;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
