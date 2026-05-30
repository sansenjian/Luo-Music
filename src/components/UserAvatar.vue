<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue'
import { useRouter } from 'vue-router'

import { logout } from '@/api/user'
import { createLegacyImportedSession, logoutLegacyPlatform } from '@/app/legacyPlatformAuth'
import type { PlatformDescriptor } from '@shared/types/platform'
import {
  getPrimaryProfilePlatformId,
  isPlatformRepresentedByPrimaryProfile,
  resolvePlatformLoginRoute,
  type LegacyLoginBridge
} from '@/platform/music/loginRouting'
import { services } from '@/services'
import { useUserStore } from '@/store/userStore'
import LoginModal from '@/components/LoginModal.vue'
import PluginLoginModal from '@/components/PluginLoginModal.vue'
import QQLoginModal from '@/components/QQLoginModal.vue'
import PlatformLoginCard from './user-avatar/PlatformLoginCard.vue'
import UserAvatarTrigger from './user-avatar/UserAvatarTrigger.vue'
import UserProfileCard from './user-avatar/UserProfileCard.vue'

const router = useRouter()
const logger = services.logger().createLogger('userAvatar')
const musicService = services.music()
const platformService = services.platform()
const pluginService = services.plugins()
const userStore = useUserStore()
const isElectron = computed(() => platformService.isElectron())

const wrapperRef = ref<HTMLElement | null>(null)
const triggerRef = ref<InstanceType<typeof UserAvatarTrigger> | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const showLoginModal = ref(false)
const showQQLoginModal = ref(false)
const showDropdown = ref(false)
const dropdownStyle = ref<CSSProperties>({})
const activePluginLoginPlatform = ref<PlatformDescriptor | null>(null)
let shouldRestoreTriggerFocus = true
let unsubscribePluginPlatforms: (() => void) | null = null
const legacySessionImportAttempts = new Set<string>()

const loginPlatforms = computed(() => musicService.getLoginCapablePlatformDescriptors())
const visibleLoginPlatforms = computed(() =>
  loginPlatforms.value.filter(platform => !isPlatformRepresentedByHeader(platform.id))
)
const showLoginPlatformList = computed(
  () =>
    visibleLoginPlatforms.value.length > 0 ||
    (!userStore.isLoggedIn && loginPlatforms.value.length === 0)
)
const showPluginLoginModal = computed({
  get: () => activePluginLoginPlatform.value !== null,
  set: value => {
    if (!value) {
      activePluginLoginPlatform.value = null
    }
  }
})

async function handleLogout(): Promise<void> {
  try {
    await logout()
  } catch (error) {
    logger.warn('Primary platform logout request failed, clearing local session', error)
  } finally {
    await logoutLegacyPlatform(getPrimaryProfilePlatformId())
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

function openLegacyLoginBridge(bridge: LegacyLoginBridge): void {
  switch (bridge) {
    case 'netease-login-modal':
      openLogin()
      break
    case 'qq-login-modal':
      openQQLogin()
      break
  }
}

function openPlatformLogin(platform: PlatformDescriptor): void {
  if (isPlatformLoggedIn(platform.id)) {
    openPlatformCenter(platform.id)
    return
  }

  const route = resolvePlatformLoginRoute(platform)

  if (route.kind === 'plugin') {
    openPluginLogin(route.platform)
    return
  }

  openLegacyLoginBridge(route.bridge)
}

function openPlatformCenter(platformId: string): void {
  void router.push({
    path: '/user',
    query: { platform: platformId }
  })
  closeDropdown({ restoreFocus: false })
}

function isPlatformLoggedIn(platformId: string): boolean {
  return userStore.isPlatformAuthenticated(platformId)
}

function isPlatformRepresentedByHeader(platformId: string): boolean {
  return (
    isPlatformRepresentedByPrimaryProfile(platformId) &&
    userStore.isPlatformAuthenticated(platformId)
  )
}

function getPlatformLoginTitle(platform: PlatformDescriptor): string {
  return `${platform.displayName} ${isPlatformLoggedIn(platform.id) ? '已登录' : '未登录'}`
}

function getPlatformLoginHint(platformId: string): string {
  return isPlatformLoggedIn(platformId) ? '打开个人中心 >' : '点击登录 >'
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

function updateDropdownPlacement(): void {
  const trigger = triggerRef.value?.getElement()
  const dropdown = dropdownRef.value

  if (!trigger || !dropdown) {
    dropdownStyle.value = {}
    return
  }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const margin = 12
  const gap = 6
  const triggerRect = trigger.getBoundingClientRect()
  const maxDropdownWidth = Math.max(220, viewportWidth - margin * 2)
  const dropdownWidth = Math.min(dropdown.offsetWidth || 300, maxDropdownWidth)
  const preferredLeft = triggerRect.right - dropdownWidth
  const left = Math.min(
    Math.max(preferredLeft, margin),
    Math.max(margin, viewportWidth - margin - dropdownWidth)
  )
  const top = Math.min(triggerRect.bottom + gap, Math.max(margin, viewportHeight - margin - 120))
  const maxHeight = Math.max(160, viewportHeight - top - margin)

  dropdownStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    maxHeight: `${Math.round(maxHeight)}px`
  }
}

function handleWindowResize(): void {
  if (!showDropdown.value) {
    return
  }

  void nextTick(updateDropdownPlacement)
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
  userStore.syncQQSession()
  legacySessionImportAttempts.delete('qq')
  void importLegacyPlatformSession('qq')
  openDropdown()
}

function handleNeteaseLoginModalClose(): void {
  showLoginModal.value = false

  if (!userStore.cookie) {
    return
  }

  legacySessionImportAttempts.delete('netease')
  void importLegacyPlatformSession('netease')
}

function handlePluginLoginSuccess(state: unknown): void {
  userStore.setPlatformAuthState(state, activePluginLoginPlatform.value?.id ?? 'unknown')
  openDropdown()
}

function shouldRefreshPluginAuthState(platform: PlatformDescriptor): boolean {
  return platform.capabilities.auth?.login === true
}

async function importLegacyPlatformSession(platformId: string): Promise<boolean> {
  const session = createLegacyImportedSession(platformId)
  if (!session || legacySessionImportAttempts.has(platformId)) {
    return false
  }

  legacySessionImportAttempts.add(platformId)

  try {
    const state = await pluginService.auth.importSession(platformId, session)
    userStore.setPlatformAuthState(state, platformId)
    const isAuthenticated = state.status === 'authenticated'
    if (!isAuthenticated) {
      legacySessionImportAttempts.delete(platformId)
    }
    return isAuthenticated
  } catch (error) {
    legacySessionImportAttempts.delete(platformId)
    logger.warn(`Failed to import legacy ${platformId} login session`, error)
    return false
  }
}

async function refreshLoginPlatformAuthState(platform: PlatformDescriptor): Promise<void> {
  if (!shouldRefreshPluginAuthState(platform)) {
    return
  }

  const state = await pluginService.auth.getState(platform.id)

  if (
    state.status === 'anonymous' &&
    platform.capabilities.auth?.importSession === true &&
    (await importLegacyPlatformSession(platform.id))
  ) {
    return
  }

  userStore.setPlatformAuthState(state, platform.id)
}

async function refreshLoginPlatformAuthStateSafely(platform: PlatformDescriptor): Promise<void> {
  try {
    await refreshLoginPlatformAuthState(platform)
  } catch (error) {
    logger.warn(`Failed to refresh ${platform.id} login state`, error)
  }
}

async function refreshLoginPlatformAuthStates(platforms = loginPlatforms.value): Promise<void> {
  if (!platformService.isElectron()) {
    return
  }

  await Promise.all(
    platforms.filter(shouldRefreshPluginAuthState).map(refreshLoginPlatformAuthStateSafely)
  )
}

async function refreshPluginPlatforms(): Promise<void> {
  if (!platformService.isElectron()) {
    return
  }

  try {
    const platforms = await pluginService.refreshPlatformDescriptors()
    await refreshLoginPlatformAuthStates(platforms)
  } catch (error) {
    logger.warn('Failed to refresh plugin login platforms', error)
  }
}

async function bootstrapLoginPlatformStates(): Promise<void> {
  await refreshPluginPlatforms()
}

onMounted(() => {
  if (platformService.isElectron()) {
    void bootstrapLoginPlatformStates()
    unsubscribePluginPlatforms = pluginService.onPlatformsChanged(platforms => {
      void refreshLoginPlatformAuthStates(platforms)
    })
  }

  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  unsubscribePluginPlatforms?.()
  unsubscribePluginPlatforms = null
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
  window.removeEventListener('resize', handleWindowResize)
})

watch(showDropdown, async (isOpen, wasOpen) => {
  if (isOpen) {
    await nextTick()
    updateDropdownPlacement()
    dropdownRef.value
      ?.querySelector<HTMLElement>('.platform-profile-card, button.platform-login-card')
      ?.focus()
    return
  }

  if (wasOpen && shouldRestoreTriggerFocus) {
    await nextTick()
    triggerRef.value?.focus()
  }

  shouldRestoreTriggerFocus = true
  dropdownStyle.value = {}
})
</script>

<template>
  <div v-if="isElectron" ref="wrapperRef" class="user-avatar-wrapper" data-ui="user-avatar">
    <UserAvatarTrigger
      ref="triggerRef"
      :logged-in="userStore.isLoggedIn"
      :avatar-url="userStore.avatarUrl"
      :nickname="userStore.nickname"
      :expanded="showDropdown"
      @click="handleTriggerClick"
    />

    <Transition name="dropdown">
      <div v-if="showDropdown" ref="dropdownRef" class="dropdown" :style="dropdownStyle">
        <UserProfileCard
          v-if="userStore.isLoggedIn"
          :nickname="userStore.nickname"
          :avatar-url="userStore.avatarUrl"
          :user-id="userStore.userId"
          @open="openPlatformCenter(getPrimaryProfilePlatformId())"
          @logout="handleLogout"
        />

        <div v-if="showLoginPlatformList" class="platform-login-list">
          <PlatformLoginCard
            v-for="platform in visibleLoginPlatforms"
            :key="platform.id"
            :title="getPlatformLoginTitle(platform)"
            :hint="getPlatformLoginHint(platform.id)"
            @open="openPlatformLogin(platform)"
          />

          <PlatformLoginCard
            v-if="loginPlatforms.length === 0"
            title="未登录"
            hint="暂无可登录平台"
            empty
          />
        </div>
      </div>
    </Transition>

    <LoginModal v-if="showLoginModal" @close="handleNeteaseLoginModalClose" />
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
  width: max-content;
  -webkit-app-region: no-drag;
}

.dropdown {
  position: fixed;
  display: flex;
  flex-direction: column;
  background: var(--white);
  border: 2px solid var(--black);
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.15);
  width: max-content;
  min-width: min(260px, calc(100vw - 24px));
  max-width: min(420px, calc(100vw - 24px));
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

.platform-login-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
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
