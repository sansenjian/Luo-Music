<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store/userStore'
import { logout } from '../api/user'
import LoginModal from './LoginModal.vue'

const router = useRouter()
const userStore = useUserStore()
const showLoginModal = ref(false)
const showDropdown = ref(false)

let hideTimeout = null

const isElectron = window.navigator.userAgent.indexOf('Electron') > -1

async function handleLogout() {
  try {
    await logout()
  } catch (error) {
    console.error('退出登录失败:', error)
  } finally {
    userStore.logout()
    showDropdown.value = false
  }
}

function openLogin() {
  showLoginModal.value = true
  showDropdown.value = false
}

function openUserCenter() {
  router.push('/user')
  showDropdown.value = false
}

function showMenu() {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  showDropdown.value = true
}

function hideMenu() {
  hideTimeout = setTimeout(() => {
    showDropdown.value = false
  }, 150)
}

function handleAvatarClick() {
  if (userStore.isLoggedIn) {
    openUserCenter()
  } else {
    openLogin()
  }
}
</script>

<template>
  <div v-if="isElectron" class="user-avatar-wrapper" @mouseleave="hideMenu">
    <div 
      class="user-trigger" 
      @mouseenter="showMenu"
      @click="handleAvatarClick"
    >
      <img 
        v-if="userStore.isLoggedIn && userStore.avatarUrl" 
        :src="userStore.avatarUrl" 
        :alt="userStore.nickname" 
        class="avatar"
      />
      <div v-else class="avatar-placeholder">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </div>
    </div>
    
    <Transition name="dropdown">
      <div v-if="showDropdown && userStore.isLoggedIn" class="dropdown" @mouseenter="showMenu" @mouseleave="hideMenu">
        <div class="dropdown-header">
          <img :src="userStore.avatarUrl" :alt="userStore.nickname" class="dropdown-avatar" />
          <div class="dropdown-info">
            <span class="dropdown-nickname">{{ userStore.nickname }}</span>
            <span class="dropdown-id">ID: {{ userStore.userId }}</span>
          </div>
        </div>
        <div class="dropdown-menu">
          <button class="menu-btn" @click="openUserCenter">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            用户中心
          </button>
          <button class="logout-btn" @click="handleLogout">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            退出登录
          </button>
        </div>
      </div>
    </Transition>
    
    <LoginModal v-if="showLoginModal" @close="showLoginModal = false" />
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
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.1);
  min-width: 200px;
  z-index: 100;
}

.dropdown-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-bottom: 2px solid var(--black);
}

.dropdown-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--black);
  object-fit: cover;
}

.dropdown-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dropdown-nickname {
  font-size: 14px;
  font-weight: 600;
  color: var(--black);
}

.dropdown-id {
  font-size: 11px;
  color: var(--gray);
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
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: var(--white);
  border: none;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--black);
  transition: all 0.1s;
}

.menu-btn {
  border-bottom: 1px solid var(--black);
}

.menu-btn:hover,
.logout-btn:hover {
  background: var(--black);
  color: var(--white);
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
