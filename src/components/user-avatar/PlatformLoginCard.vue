<script setup lang="ts">
const props = defineProps<{
  title: string
  hint: string
  empty?: boolean
}>()

const emit = defineEmits<{
  open: []
}>()
</script>

<template>
  <component
    :is="props.empty ? 'div' : 'button'"
    class="platform-login-card"
    :class="{ 'login-platform-btn': !props.empty, 'platform-login-empty': props.empty }"
    v-bind="props.empty ? {} : { type: 'button' }"
    @click="props.empty ? undefined : emit('open')"
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
      <span class="dropdown-nickname platform-login-title">{{ props.title }}</span>
      <span class="dropdown-id login-link">{{ props.hint }}</span>
    </div>
  </component>
</template>

<style scoped>
.platform-login-card {
  width: 100%;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 9px 12px;
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

.dropdown-avatar-placeholder {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid var(--black);
  background: var(--white);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gray);
  flex-shrink: 0;
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
}

.dropdown-id {
  font-size: 11px;
  color: var(--gray);
  font-family: monospace;
}

.platform-login-title {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  line-height: 1.25;
  word-break: break-word;
}

.platform-login-card:hover,
.platform-login-card:focus-visible {
  background: var(--black);
  color: var(--white);
  outline: none;
}

.platform-login-card:hover .dropdown-nickname,
.platform-login-card:hover .dropdown-id,
.platform-login-card:hover .login-link,
.platform-login-card:focus-visible .dropdown-nickname,
.platform-login-card:focus-visible .dropdown-id,
.platform-login-card:focus-visible .login-link {
  color: var(--white);
}

.platform-login-card:hover .dropdown-avatar-placeholder,
.platform-login-card:focus-visible .dropdown-avatar-placeholder {
  background: var(--white);
  color: var(--black);
  border-color: var(--white);
}

.platform-login-empty {
  cursor: default;
}

.platform-login-empty:hover,
.platform-login-empty:focus-visible {
  background: linear-gradient(135deg, var(--bg) 0%, var(--white) 100%);
  color: var(--black);
}

.platform-login-empty:hover .dropdown-nickname,
.platform-login-empty:hover .dropdown-id,
.platform-login-empty:hover .login-link,
.platform-login-empty:focus-visible .dropdown-nickname,
.platform-login-empty:focus-visible .dropdown-id,
.platform-login-empty:focus-visible .login-link {
  color: inherit;
}

.platform-login-empty:hover .dropdown-avatar-placeholder,
.platform-login-empty:focus-visible .dropdown-avatar-placeholder {
  background: var(--white);
  color: var(--gray);
  border-color: var(--black);
}

.login-link {
  color: #4ade80;
  font-weight: 600;
  transition: all 0.2s;
}

.login-link:hover {
  text-decoration: underline;
}
</style>
