<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { logout } from '@/api/user'
import { qqMusicApi } from '@/api/qqmusic'
import {
  getLoginCapablePlatformDescriptors,
  type PlatformDescriptor
} from '@/platform/music/descriptors'
import { services } from '@/services'
import { useUserStore } from '@/store/userStore'
import LoginModal from './LoginModal.vue'
import PluginLoginModal from './PluginLoginModal.vue'
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
const platformService = services.platform()
const pluginService = services.plugins()
const userStore = useUserStore()
const isElectron = computed(() => platformService.isElectron())

const wrapperRef = ref<HTMLElement | null>(null)
const triggerButtonRef = ref<HTMLButtonElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const showLoginModal = ref(false)
const showQQLoginModal = ref(false)
const showDropdown = ref(false)
const activePluginLoginPlatform = ref<PlatformDescriptor | null>(null)
let shouldRestoreTriggerFocus = true
let unsubscribePluginPlatforms: (() => void) | null = null

const isQQMusicLoggedIn = computed(() => userStore.isQQMusicLoggedIn)
const loginPlatforms = computed(() => getLoginCapablePlatformDescriptors())
const showPluginLoginModal = computed({
  get: () => activePluginLoginPlatform.value !== null,
  set: value => {
    if (!value) {
      activePluginLoginPlatform.value = null
    }
  }
})

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
    closeDropdown({ restoreFocus: false })
  }
}

function openLogin(): void {
  if (!isElectron.value) {
    return
  }
  showLoginModal.value = true
  closeDropdown({ restoreFocus: false })
}

function openQQLogin(): void {
  if (!isElectron.value) {
    return
  }
  showQQLoginModal.value = true
  closeDropdown({ restoreFocus: false })
}

function openPluginLogin(platform: PlatformDescriptor): void {
  if (!isElectron.value) {
    return
  }

  activePluginLoginPlatform.value = platform
  closeDropdown({ restoreFocus: false })
}

function openPlatformLogin(platform: PlatformDescriptor): void {
  if (platform.id === 'netease') {
    openLogin()
    return
  }

  if (platform.id === 'qq') {
    openQQLogin()
    return
  }

  openPluginLogin(platform)
}

function isPlatformLoggedIn(platformId: string): boolean {
  if (platformId === 'netease') {
    return userStore.isLoggedIn
  }

  if (platformId === 'qq') {
    return isQQMusicLoggedIn.value
  }

  return false
}

function getPlatformLoginTitle(platform: PlatformDescriptor): string {
  return `${platform.displayName} ${isPlatformLoggedIn(platform.id) ? '已登录' : '未登录'}`
}

function getPlatformLoginHint(platformId: string): string {
  return isPlatformLoggedIn(platformId) ? '已登录' : '点击登录 >'
}

function openUserCenter(): void {
  void router.push('/user')
  closeDropdown({ restoreFocus: false })
}

function closeDropdown(options: { restoreFocus?: boolean } = {}): void {
  shouldRestoreTriggerFocus = options.restoreFocus ?? true
  showDropdown.value = false
}

function openDropdown(): void {
  shouldRestoreTriggerFocus = true
  showDropdown.value = true
}

function toggleDropdown(): void {
  if (showDropdown.value) {
    closeDropdown()
    return
  }

  openDropdown()
}

function handleTriggerClick(): void {
  toggleDropdown()
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!showDropdown.value) {
    return
  }

  const target = event.target as Node | null
  if (target && wrapperRef.value?.contains(target)) {
    return
  }

  closeDropdown({ restoreFocus: false })
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !showDropdown.value) {
    return
  }

  event.preventDefault()
  closeDropdown()
}

function handleQQLoginSuccess(): void {
  openDropdown()
}

function handlePluginLoginSuccess(): void {
  openDropdown()
}

async function refreshPluginPlatforms(): Promise<void> {
  if (!platformService.isElectron()) {
    return
  }

  try {
    await pluginService.refreshPlatformDescriptors()
  } catch (error) {
    logger.warn('Failed to refresh plugin login platforms', error)
  }
}

onMounted(() => {
  if (platformService.isElectron()) {
    void checkQQMusicLoginStatus()
    void refreshPluginPlatforms()
    unsubscribePluginPlatforms = pluginService.onPlatformsChanged(() => {})
  }

  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onUnmounted(() => {
  unsubscribePluginPlatforms?.()
  unsubscribePluginPlatforms = null
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})

watch(showDropdown, async (isOpen, wasOpen) => {
  if (isOpen) {
    await nextTick()
    dropdownRef.value
      ?.querySelector<HTMLButtonElement>('button.platform-login-card, .menu-btn')
      ?.focus()
    return
  }

  if (wasOpen && shouldRestoreTriggerFocus) {
    await nextTick()
    triggerButtonRef.value?.focus()
  }

  shouldRestoreTriggerFocus = true
})
</script>

<template>
  <div v-if="isElectron" ref="wrapperRef" class="user-avatar-wrapper">
    <button
      ref="triggerButtonRef"
      class="user-trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="showDropdown"
      :aria-label="
        userStore.isLoggedIn ? userStore.nickname || '打开账户菜单' : '打开登录/注册菜单'
      "
      @click.stop="handleTriggerClick"
    >
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
    </button>

    <Transition name="dropdown">
      <div v-if="showDropdown" ref="dropdownRef" class="dropdown">
        <div v-if="userStore.isLoggedIn" class="dropdown-header">
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
        </div>

        <div class="platform-login-list">
          <button
            v-for="platform in loginPlatforms"
            :key="platform.id"
            class="platform-login-card login-platform-btn"
            type="button"
            @click="openPlatformLogin(platform)"
          >
            <div class="dropdown-avatar-placeholder">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <div class="dropdown-info">
              <span class="dropdown-nickname platform-login-title">
                {{ getPlatformLoginTitle(platform) }}
              </span>
              <span class="dropdown-id login-link">{{ getPlatformLoginHint(platform.id) }}</span>
            </div>
          </button>

          <div v-if="loginPlatforms.length === 0" class="platform-login-card platform-login-empty">
            <div class="dropdown-avatar-placeholder">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <div class="dropdown-info">
              <span class="dropdown-nickname">未登录</span>
              <span class="dropdown-id login-link">暂无可登录平台</span>
            </div>
          </div>
        </div>

        <div v-if="userStore.isLoggedIn" class="dropdown-menu">
          <button class="menu-btn" @click="openUserCenter">
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
        </div>
      </div>
    </Transition>

    <LoginModal v-if="showLoginModal" @close="showLoginModal = false" />
    <QQLoginModal v-model="showQQLoginModal" @login-success="handleQQLoginSuccess" />
    <PluginLoginModal
      v-if="activePluginLoginPlatform"
      v-model="showPluginLoginModal"
      :platform-id="activePluginLoginPlatform.id"
      :platform-name="activePluginLoginPlatform.displayName"
      :preferred-mode="activePluginLoginPlatform.capabilities.auth?.preferredMode"
      @login-success="handlePluginLoginSuccess"
    />
  </div>
</template>

<style scoped>
.user-avatar-wrapper {
  position: relative;
  -webkit-app-region: no-drag;
}

.user-trigger {
  border: none;
  background: transparent;
  padding: 0;
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
  min-width: 330px;
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

.platform-login-list {
  display: flex;
  flex-direction: column;
}

.platform-login-card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: linear-gradient(135deg, var(--bg) 0%, var(--white) 100%);
  border: none;
  border-bottom: 2px solid var(--black);
  color: var(--black);
  cursor: pointer;
  text-align: left;
  transition:
    background 0.2s,
    color 0.2s;
}

.platform-login-card:hover {
  background: var(--black);
  color: var(--white);
}

.platform-login-card:hover .login-link {
  color: var(--white);
}

.platform-login-card:hover .dropdown-avatar-placeholder {
  background: var(--white);
  color: var(--black);
}

.platform-login-empty {
  cursor: default;
}

.platform-login-empty:hover {
  background: linear-gradient(135deg, var(--bg) 0%, var(--white) 100%);
  color: var(--black);
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
  border-bottom: 1px solid var(--bg-dark);
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
