<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

interface UserProfileHeaderProps {
  userId: string | number
  avatarUrl?: string
  nickname?: string
}

type CopyState = 'idle' | 'success' | 'error'

const props = withDefaults(defineProps<UserProfileHeaderProps>(), {
  avatarUrl: '',
  nickname: ''
})

const copyState = ref<CopyState>('idle')
const previewVisible = ref(false)
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null

const displayName = computed(() => props.nickname || '未命名用户')
const profileLink = computed(
  () => `https://music.163.com/#/user/home?id=${encodeURIComponent(String(props.userId))}`
)
const previewLabel = computed(() => (props.avatarUrl ? '预览头像' : '暂无头像'))
const copyButtonLabel = computed(() => {
  if (copyState.value === 'success') {
    return 'UID 已复制'
  }

  if (copyState.value === 'error') {
    return '复制失败'
  }

  return '复制 UID'
})

function resetCopyStateLater(): void {
  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer)
  }

  copyFeedbackTimer = setTimeout(() => {
    copyState.value = 'idle'
  }, 1800)
}

async function copyText(text: string): Promise<boolean> {
  if (!text || typeof window === 'undefined') {
    return false
  }

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (error) {
    console.warn('Clipboard API copy failed, trying fallback', error)
  }

  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  return copied
}

async function handleCopyUserId(): Promise<void> {
  const copied = await copyText(String(props.userId))
  copyState.value = copied ? 'success' : 'error'
  resetCopyStateLater()
}

function handleOpenProfileLink(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.open(profileLink.value, '_blank', 'noopener,noreferrer')
}

function openAvatarPreview(): void {
  if (!props.avatarUrl) {
    return
  }

  previewVisible.value = true
}

function closeAvatarPreview(): void {
  previewVisible.value = false
}

onBeforeUnmount(() => {
  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer)
  }
})
</script>

<template>
  <section class="user-profile-header">
    <button
      type="button"
      class="user-profile-avatar"
      :class="{ clickable: Boolean(props.avatarUrl) }"
      @click="openAvatarPreview"
    >
      <img v-if="props.avatarUrl" :src="props.avatarUrl" :alt="displayName" loading="lazy" />
      <div v-else class="user-profile-avatar-fallback">
        {{ displayName.slice(0, 1).toUpperCase() }}
      </div>
    </button>

    <div class="user-profile-copy">
      <p class="user-profile-eyebrow">个人中心</p>
      <div class="user-profile-heading">
        <h1 class="user-profile-name">{{ displayName }}</h1>
        <span class="user-profile-id">UID {{ props.userId }}</span>
      </div>

      <div class="user-profile-actions">
        <button
          type="button"
          class="profile-action"
          data-testid="copy-user-id"
          @click="handleCopyUserId"
        >
          {{ copyButtonLabel }}
        </button>
        <button
          type="button"
          class="profile-action"
          data-testid="open-user-profile"
          @click="handleOpenProfileLink"
        >
          打开主页
        </button>
        <button
          type="button"
          class="profile-action"
          data-testid="preview-avatar"
          :disabled="!props.avatarUrl"
          @click="openAvatarPreview"
        >
          {{ previewLabel }}
        </button>
      </div>
    </div>

    <div
      v-if="previewVisible"
      class="avatar-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="头像预览"
      @click.self="closeAvatarPreview"
    >
      <div class="avatar-preview-card">
        <button
          type="button"
          class="avatar-preview-close"
          aria-label="关闭头像预览"
          @click="closeAvatarPreview"
        >
          ×
        </button>
        <img :src="props.avatarUrl" :alt="displayName" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.user-profile-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin: 24px auto 28px;
  padding: 24px;
  border: 2px solid var(--black);
  border-radius: 20px;
  background:
    radial-gradient(circle at top left, rgba(255, 112, 59, 0.22), transparent 34%),
    linear-gradient(135deg, rgba(0, 0, 0, 0.03), transparent 40%), var(--white);
  box-shadow: 8px 8px 0 var(--black);
}

.user-profile-avatar,
.user-profile-avatar-fallback,
.user-profile-avatar img {
  width: 96px;
  height: 96px;
  border-radius: 28px;
}

.user-profile-avatar {
  flex-shrink: 0;
  overflow: hidden;
  border: 2px solid var(--black);
  background: var(--bg);
  padding: 0;
}

.user-profile-avatar.clickable {
  cursor: zoom-in;
}

.user-profile-avatar img {
  display: block;
  object-fit: cover;
}

.user-profile-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 800;
  color: var(--black);
}

.user-profile-copy {
  min-width: 0;
  flex: 1;
}

.user-profile-eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--accent);
}

.user-profile-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.user-profile-name {
  margin: 0;
  font-size: clamp(28px, 4vw, 40px);
  line-height: 1.05;
  color: var(--black);
}

.user-profile-id {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border: 2px solid var(--black);
  border-radius: 999px;
  background: var(--white);
  font-size: 13px;
  color: var(--gray);
  font-weight: 700;
}

.user-profile-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.profile-action {
  padding: 10px 14px;
  border: 2px solid var(--black);
  border-radius: 999px;
  background: var(--white);
  color: var(--black);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.profile-action:hover:not(:disabled) {
  background: var(--black);
  color: var(--white);
}

.profile-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.avatar-preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.68);
}

.avatar-preview-card {
  position: relative;
  width: min(520px, 100%);
  border: 3px solid var(--black);
  border-radius: 20px;
  overflow: hidden;
  background: var(--white);
  box-shadow: 8px 8px 0 var(--black);
}

.avatar-preview-card img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}

.avatar-preview-close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  width: 40px;
  height: 40px;
  border: 2px solid var(--black);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: var(--black);
  font-size: 24px;
  cursor: pointer;
}

@media (max-width: 768px) {
  .user-profile-header {
    flex-direction: column;
    align-items: flex-start;
    padding: 20px;
  }

  .user-profile-actions {
    width: 100%;
  }

  .profile-action {
    flex: 1 1 160px;
  }
}
</style>
