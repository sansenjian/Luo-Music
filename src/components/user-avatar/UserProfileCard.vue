<script setup lang="ts">
const props = defineProps<{
  nickname?: string | null
  avatarUrl?: string | null
  userId?: string | number | null
}>()

const emit = defineEmits<{
  open: []
  logout: []
}>()
</script>

<template>
  <div
    class="dropdown-header platform-profile-card"
    role="button"
    tabindex="0"
    @click="emit('open')"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <img
      v-if="props.avatarUrl"
      :src="props.avatarUrl"
      :alt="props.nickname ?? ''"
      class="dropdown-avatar"
    />
    <div v-else class="dropdown-avatar-placeholder"></div>
    <div class="dropdown-info">
      <span class="dropdown-nickname">{{ props.nickname }}</span>
      <span class="dropdown-id">ID: {{ props.userId }}</span>
    </div>
    <button class="logout-btn-small" title="退出登录" @click.stop="emit('logout')">
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
</template>

<style scoped>
.dropdown-header {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, var(--bg) 0%, var(--white) 100%);
  border-bottom: 2px solid var(--black);
  position: relative;
  color: var(--black);
  cursor: pointer;
  text-align: left;
  transition:
    background 0.2s,
    color 0.2s;
}

.dropdown-header:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -4px;
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
  min-width: 0;
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
</style>
