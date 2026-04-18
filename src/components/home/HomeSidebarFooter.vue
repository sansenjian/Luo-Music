<script setup lang="ts">
import { computed } from 'vue'

import { useUserStore } from '@/store/userStore'

const props = withDefaults(
  defineProps<{
    collapsed?: boolean
  }>(),
  {
    collapsed: false
  }
)

const userStore = useUserStore()

const sidebarLoginTitle = computed(() => userStore.nickname.trim() || '登录信息')
const sidebarLoginAvatarLabel = computed(() => sidebarLoginTitle.value.trim().charAt(0) || '登')
const sidebarLoginAvatarUrl = computed(() => userStore.avatarUrl.trim())
const neteaseLoginState = computed(() => (userStore.isLoggedIn ? '已登录' : '未登录'))
const qqMusicLoginState = computed(() => (userStore.isQQMusicLoggedIn ? '已登录' : '未登录'))
</script>

<template>
  <div
    class="sidebar-login-panel"
    :class="{ 'is-collapsed': props.collapsed }"
    aria-label="登录信息"
  >
    <div class="sidebar-login">
      <img
        v-if="sidebarLoginAvatarUrl"
        :src="sidebarLoginAvatarUrl"
        :alt="sidebarLoginTitle"
        class="sidebar-user-avatar sidebar-user-avatar-image"
      />
      <span v-else class="sidebar-user-avatar" aria-hidden="true">
        {{ sidebarLoginAvatarLabel }}
      </span>
      <div v-if="!props.collapsed" class="sidebar-user-copy">
        <strong>{{ sidebarLoginTitle }}</strong>
        <div class="sidebar-login-services">
          <span class="service-badge service-badge-netease">
            <span class="service-name">网易云</span>
            <span class="service-state">{{ neteaseLoginState }}</span>
          </span>
          <span class="service-badge service-badge-qq">
            <span class="service-name">QQ音乐</span>
            <span class="service-state">{{ qqMusicLoginState }}</span>
          </span>
        </div>
      </div>
    </div>

    <button type="button" class="settings-button" aria-label="打开设置" title="即将推出" disabled>
      <span class="settings-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            d="m12 4.8 1 .6 1.5-.3.8 1.3 1.4.5v1.6l1 1-.7 1.4.4 1.4-1.3.8-.5 1.4h-1.6l-1 1-1.4-.7-1.4.4-.8-1.3-1.4-.5v-1.6l-1-1 .7-1.4-.4-1.4 1.3-.8.5-1.4h1.6l1-1Z"
          />
          <circle cx="12" cy="12" r="2.4" />
        </svg>
      </span>
    </button>
  </div>
</template>

<style scoped>
.sidebar-login-panel {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 100%;
  width: 100%;
  padding: 12px 14px calc(12px + var(--safe-bottom));
  background: color-mix(in srgb, var(--sidebar-shell-bg) 88%, var(--white));
}

.sidebar-login {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.sidebar-user-avatar {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #1f2937 0%, #475569 100%);
  color: var(--white);
  font-size: 16px;
  font-weight: 800;
}

.sidebar-user-avatar-image {
  display: block;
  object-fit: cover;
  background: var(--white);
}

.sidebar-user-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-user-copy strong {
  font-size: 15px;
  font-weight: 800;
  color: var(--black);
}

.sidebar-login-services {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.service-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-left: 14px;
  font-size: 12px;
  font-weight: 700;
  color: var(--gray);
}

.service-name {
  color: var(--black);
}

.service-state {
  color: var(--gray);
}

.service-badge::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  transform: translateY(-50%);
}

.service-badge-netease::before {
  background: #ef4444;
}

.service-badge-qq::before {
  background: #22c55e;
}

.settings-button {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: 0;
  border-radius: 12px;
  background: var(--surface-muted);
  color: var(--gray);
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.settings-button:hover {
  background: var(--sidebar-link-hover-bg);
  color: var(--black);
  transform: translateY(-1px);
}

.settings-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.settings-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sidebar-login-panel.is-collapsed .sidebar-user-copy {
  display: none;
}

.sidebar-login-panel.is-collapsed {
  flex-direction: column;
  justify-content: center;
  padding-inline: 10px;
}

.sidebar-login-panel.is-collapsed .sidebar-login {
  justify-content: center;
}

.sidebar-login-panel.is-collapsed .settings-button {
  width: 42px;
  height: 42px;
}

@media (max-width: 960px) {
  .sidebar-login-panel {
    padding-inline: 10px;
  }
}
</style>
