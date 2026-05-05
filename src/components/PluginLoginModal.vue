<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import type { StandardAuthState, StandardLoginChallenge, StandardLoginMode } from '@plugin-sdk'
import { services } from '@/services'
import { useToastStore } from '@/store/toastStore'

type LoginStatus = 'idle' | 'loading' | 'waiting' | 'expired' | 'success' | 'error'

const props = defineProps<{
  modelValue: boolean
  platformId: string
  platformName: string
  preferredMode?: StandardLoginMode
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'login-success': [state: StandardAuthState]
}>()

const logger = services.logger().createLogger('pluginLoginModal')
const pluginService = services.plugins()
const toastStore = useToastStore()

const challenge = ref<StandardLoginChallenge | null>(null)
const status = ref<LoginStatus>('idle')
const statusText = ref('')

let pollingTimer: ReturnType<typeof setInterval> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null
let isPolling = false
let activeAttemptId = 0

const title = computed(() => challenge.value?.title || `${props.platformName} 登录`)
const qrImageUrl = computed(() => challenge.value?.qrImageUrl || '')
const authorizeUrl = computed(() => challenge.value?.authorizeUrl || '')
const canRefresh = computed(() => challenge.value?.canRefresh !== false)
const isUnsupportedChallenge = computed(
  () => Boolean(challenge.value) && !['qr', 'browser', 'none'].includes(challenge.value!.type)
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizeLoginMode(value: unknown): StandardLoginChallenge['type'] {
  return value === 'qr' || value === 'browser' || value === 'form' || value === 'none'
    ? value
    : 'none'
}

function normalizeChallenge(value: unknown): StandardLoginChallenge {
  if (!isRecord(value)) {
    throw new Error('Invalid login challenge')
  }

  const challengeId = normalizeString(value.challengeId)
  if (!challengeId) {
    throw new Error('Login challenge missing challengeId')
  }

  return {
    challengeId,
    type: normalizeLoginMode(value.type),
    title: normalizeString(value.title) || undefined,
    statusText: normalizeString(value.statusText) || undefined,
    qrImageUrl: normalizeString(value.qrImageUrl) || undefined,
    authorizeUrl: normalizeString(value.authorizeUrl) || undefined,
    expiresAt: normalizeNumber(value.expiresAt),
    pollIntervalMs: normalizeNumber(value.pollIntervalMs),
    canRefresh: normalizeBoolean(value.canRefresh),
    cancelable: normalizeBoolean(value.cancelable),
    helpUrl: normalizeString(value.helpUrl) || undefined
  }
}

function normalizeAuthState(value: unknown): StandardAuthState {
  if (!isRecord(value)) {
    return {
      platform: props.platformId,
      status: 'pending'
    }
  }

  const rawStatus = value.status
  const statusValue =
    rawStatus === 'anonymous' ||
    rawStatus === 'pending' ||
    rawStatus === 'authenticated' ||
    rawStatus === 'expired' ||
    rawStatus === 'error'
      ? rawStatus
      : 'pending'

  return {
    platform: normalizeString(value.platform) || props.platformId,
    status: statusValue,
    account: isRecord(value.account)
      ? {
          id: normalizeString(value.account.id) || String(value.account.id ?? ''),
          nickname: normalizeString(value.account.nickname) || props.platformName,
          avatarUrl: normalizeString(value.account.avatarUrl) || undefined,
          homepageUrl: normalizeString(value.account.homepageUrl) || undefined
        }
      : undefined,
    expiresAt: normalizeNumber(value.expiresAt),
    message: normalizeString(value.message) || undefined
  }
}

function clearCloseTimer(): void {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function stopPolling(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

function isAttemptCurrent(attemptId: number): boolean {
  return attemptId === activeAttemptId
}

function cancelChallenge(currentChallenge: StandardLoginChallenge): void {
  if (!currentChallenge.cancelable) {
    return
  }

  void pluginService
    .call(props.platformId, 'auth.cancelLogin', { challengeId: currentChallenge.challengeId })
    .catch(error => {
      logger.warn('Failed to cancel plugin login challenge', error)
    })
}

function invalidateActiveAttempt(options: { cancel?: boolean } = {}): void {
  activeAttemptId += 1
  isPolling = false
  stopPolling()
  clearCloseTimer()

  const currentChallenge = challenge.value
  challenge.value = null

  if (options.cancel && currentChallenge) {
    cancelChallenge(currentChallenge)
  }
}

async function pollLogin(attemptId: number): Promise<void> {
  if (!isAttemptCurrent(attemptId) || isPolling || !challenge.value) {
    return
  }

  isPolling = true

  try {
    const state = normalizeAuthState(
      await pluginService.call(props.platformId, 'auth.pollLogin', {
        challengeId: challenge.value.challengeId
      })
    )

    if (!isAttemptCurrent(attemptId)) {
      return
    }

    if (state.status === 'authenticated') {
      status.value = 'success'
      statusText.value = state.message || '登录成功'
      stopPolling()
      toastStore.success(`${props.platformName} 登录成功`)
      emit('login-success', state)

      clearCloseTimer()
      closeTimer = setTimeout(() => {
        if (isAttemptCurrent(attemptId)) {
          emit('update:modelValue', false)
        }
      }, 500)
      return
    }

    if (state.status === 'expired') {
      status.value = 'expired'
      statusText.value = state.message || '二维码已过期，请刷新后重试'
      stopPolling()
      return
    }

    if (state.status === 'error') {
      status.value = 'error'
      statusText.value = state.message || '登录失败，请重试'
      stopPolling()
      return
    }

    status.value = 'waiting'
    statusText.value = state.message || challenge.value.statusText || '等待完成登录'
  } catch (error) {
    if (!isAttemptCurrent(attemptId)) {
      return
    }

    logger.warn('Failed to poll plugin login status', error)
  } finally {
    if (isAttemptCurrent(attemptId)) {
      isPolling = false
    }
  }
}

function startPolling(attemptId: number): void {
  stopPolling()

  const interval = Math.max(1000, Math.round(challenge.value?.pollIntervalMs ?? 3000))
  pollingTimer = setInterval(() => {
    void pollLogin(attemptId)
  }, interval)
}

async function startLogin(): Promise<void> {
  const attemptId = ++activeAttemptId

  stopPolling()
  clearCloseTimer()
  isPolling = false
  challenge.value = null
  status.value = 'loading'
  statusText.value = '正在加载登录信息...'

  try {
    const nextChallenge = normalizeChallenge(
      await pluginService.call(props.platformId, 'auth.startLogin', {
        mode: props.preferredMode
      })
    )

    if (!isAttemptCurrent(attemptId)) {
      return
    }

    challenge.value = nextChallenge

    if (nextChallenge.type === 'qr') {
      status.value = 'waiting'
      statusText.value = nextChallenge.statusText || '请扫码完成登录'
      startPolling(attemptId)
      return
    }

    if (nextChallenge.type === 'browser') {
      status.value = 'waiting'
      statusText.value = nextChallenge.statusText || '请在浏览器完成授权'
      startPolling(attemptId)
      return
    }

    if (nextChallenge.type === 'none') {
      status.value = 'success'
      statusText.value = nextChallenge.statusText || '已完成登录'
      return
    }

    status.value = 'error'
    statusText.value = '当前版本暂不支持该登录方式'
  } catch (error) {
    if (!isAttemptCurrent(attemptId)) {
      return
    }

    logger.error('Failed to start plugin login', error)
    status.value = 'error'
    statusText.value = '加载登录信息失败，请稍后重试'
    toastStore.error(`加载 ${props.platformName} 登录失败`)
  }
}

function refreshLogin(): void {
  invalidateActiveAttempt({ cancel: true })
  void startLogin()
}

function openAuthorizeUrl(): void {
  if (!authorizeUrl.value) {
    return
  }

  window.open(authorizeUrl.value, '_blank', 'noopener,noreferrer')
}

function closeModal(): void {
  invalidateActiveAttempt({ cancel: status.value !== 'success' })
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  isOpen => {
    if (isOpen) {
      void startLogin()
      return
    }

    invalidateActiveAttempt({ cancel: status.value !== 'success' })
  }
)

onMounted(() => {
  if (props.modelValue) {
    void startLogin()
  }
})

onUnmounted(() => {
  invalidateActiveAttempt({ cancel: status.value !== 'success' })
})
</script>

<template>
  <div v-if="modelValue" class="login-modal-overlay" @click.self="closeModal">
    <div class="login-modal">
      <div class="login-header">
        <h2>{{ title }}</h2>
        <button class="close-btn" type="button" @click="closeModal">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="login-content">
        <div class="qr-container">
          <div
            v-if="qrImageUrl"
            class="qr-wrapper"
            :class="{ 'qr-expired': status === 'expired' || status === 'error' }"
          >
            <img :src="qrImageUrl" :alt="`${platformName} 登录二维码`" class="qr-image" />
            <div v-if="status === 'expired' || status === 'error'" class="qr-overlay">
              <button v-if="canRefresh" class="refresh-btn" type="button" @click="refreshLogin">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                刷新二维码
              </button>
            </div>
          </div>

          <div v-else class="qr-loading">
            <div v-if="status === 'loading'" class="loading-spinner"></div>
            <button
              v-else-if="authorizeUrl"
              class="browser-login-btn"
              type="button"
              @click="openAuthorizeUrl"
            >
              打开授权页面
            </button>
            <button
              v-else-if="status === 'error' || isUnsupportedChallenge"
              class="browser-login-btn"
              type="button"
              @click="refreshLogin"
            >
              重试
            </button>
          </div>
        </div>

        <p class="status-text" :class="'status-' + status">{{ statusText }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.login-modal {
  background: var(--bg, #fff);
  border: 3px solid var(--black, #000);
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.2);
  width: 320px;
}

.login-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 3px solid var(--black, #000);
  background: var(--black, #000);
  color: var(--white, #fff);
}

.login-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--white, #fff);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  opacity: 0.8;
}

.login-content {
  padding: 20px;
  text-align: center;
}

.qr-container {
  margin-bottom: 16px;
}

.qr-wrapper {
  position: relative;
  display: inline-block;
  border: 2px solid var(--black, #000);
}

.qr-image {
  display: block;
  width: 200px;
  height: 200px;
}

.qr-expired .qr-image {
  filter: blur(2px);
  opacity: 0.5;
}

.qr-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
}

.qr-loading {
  width: 200px;
  height: 200px;
  border: 2px solid var(--black, #000);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--gray-light, #ddd);
  border-top-color: var(--black, #000);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.refresh-btn,
.browser-login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--black, #000);
  color: var(--white, #fff);
  border: none;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.refresh-btn {
  flex-direction: column;
}

.refresh-btn:hover,
.browser-login-btn:hover {
  background: var(--gray, #333);
}

.status-text {
  margin: 0;
  font-size: 13px;
  color: var(--gray, #666);
}

.status-success {
  color: #28a745;
  font-weight: 700;
}

.status-error,
.status-expired {
  color: #dc3545;
  font-weight: 700;
}
</style>
