<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  loggedIn: boolean
  avatarUrl?: string
  nickname?: string
  expanded: boolean
}>()

const emit = defineEmits<{
  click: []
}>()

const buttonRef = ref<HTMLButtonElement | null>(null)

function focus(): void {
  buttonRef.value?.focus()
}

function getElement(): HTMLButtonElement | null {
  return buttonRef.value
}

defineExpose({
  focus,
  getElement
})
</script>

<template>
  <button
    ref="buttonRef"
    class="user-trigger"
    data-ui="user-avatar-trigger"
    type="button"
    aria-haspopup="menu"
    :aria-expanded="props.expanded"
    :aria-label="props.loggedIn ? props.nickname || '打开账户菜单' : '打开登录/注册菜单'"
    @click.stop="emit('click')"
  >
    <img
      v-if="props.loggedIn && props.avatarUrl"
      :src="props.avatarUrl"
      :alt="props.nickname"
      class="avatar"
      data-ui="user-avatar-image"
    />
    <div v-else class="avatar-placeholder" data-ui="user-avatar-placeholder">
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
</template>

<style scoped>
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
</style>
