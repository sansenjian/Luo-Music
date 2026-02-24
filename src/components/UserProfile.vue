<script setup>
import { useUserStore } from '../store/userStore'
import { logout } from '../api/user'

const userStore = useUserStore()

async function handleLogout() {
  try {
    await logout()
  } catch (error) {
    console.error('退出登录失败:', error)
  } finally {
    userStore.logout()
  }
}
</script>

<template>
  <div class="user-profile">
    <div class="user-info">
      <img 
        v-if="userStore.avatarUrl" 
        :src="userStore.avatarUrl" 
        :alt="userStore.nickname" 
        class="user-avatar"
      />
      <div v-else class="user-avatar-placeholder">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </div>
      <div class="user-details">
        <span class="user-nickname">{{ userStore.nickname || '未知用户' }}</span>
        <span class="user-id">ID: {{ userStore.userId || '-' }}</span>
      </div>
    </div>
    <button class="logout-btn" @click="handleLogout">
      退出登录
    </button>
  </div>
</template>

<style scoped>
.user-profile {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--bg-secondary, #f5f5f5);
  border: 2px solid var(--black, #000);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--black, #000);
  object-fit: cover;
}

.user-avatar-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--black, #000);
  background: var(--gray-light, #ddd);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gray, #666);
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-nickname {
  font-size: 14px;
  font-weight: 600;
  color: var(--black, #000);
}

.user-id {
  font-size: 11px;
  color: var(--gray, #999);
}

.logout-btn {
  padding: 6px 12px;
  font-size: 12px;
  background: var(--white, #fff);
  border: 2px solid var(--black, #000);
  cursor: pointer;
  transition: all 0.1s;
}

.logout-btn:hover {
  background: var(--black, #000);
  color: var(--white, #fff);
}
</style>
