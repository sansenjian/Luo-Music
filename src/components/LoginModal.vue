<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import { services } from '../services'
import { checkQRStatus, getQRCode, getQRKey, getUserAccount, getUserDetail } from '../api/user'
import { useToastStore } from '../store/toastStore'
import { useUserStore } from '../store/userStore'
import {
  extractQrCookie,
  extractQrImage,
  extractQrKey,
  extractQrStatusCode,
  extractUserId,
  extractUserProfile,
  type QrCheckResponse,
  type QrImageResponse,
  type QrKeyResponse,
  type UserAccountResponse
} from './loginModal.utils'

type LoginStatus = 'loading' | 'waiting' | 'scanned' | 'expired' | 'success' | 'error'
type UserDetailResponse = {
  profile?: Record<string, unknown>
  data?: {
    profile?: Record<string, unknown>
  }
  body?: {
    data?: {
      profile?: Record<string, unknown>
    }
  }
}

const emit = defineEmits<{
  close: []
}>()

const logger = services.logger().createLogger('loginModal')
const toastStore = useToastStore()
const userStore = useUserStore()

const qrImage = ref('')
const qrKey = ref('')
const status = ref<LoginStatus>('loading')
const statusText = ref('正在加载二维码...')

let pollingTimer: ReturnType<typeof setInterval> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null
let isChecking = false
let activeAttemptId = 0

function clearCloseTimer(): void {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function isAttemptCurrent(attemptId: number): boolean {
  return attemptId === activeAttemptId
}

function invalidateActiveAttempt(): void {
  activeAttemptId += 1
  isChecking = false
  stopPolling()
  clearCloseTimer()
}

function resolveBrowserCookie(): string {
  if (typeof document === 'undefined' || typeof document.cookie !== 'string') {
    return ''
  }

  return document.cookie.trim()
}

function resolveSessionCookie(cookie: string): string {
  if (cookie.trim().length > 0) {
    return cookie.trim()
  }

  if (typeof userStore.cookie === 'string' && userStore.cookie.trim().length > 0) {
    return userStore.cookie.trim()
  }

  return resolveBrowserCookie()
}

async function fetchQRCode(): Promise<void> {
  const attemptId = ++activeAttemptId

  stopPolling()
  clearCloseTimer()
  isChecking = false
  status.value = 'loading'
  statusText.value = '正在加载二维码...'

  try {
    const keyRes = (await getQRKey()) as QrKeyResponse
    if (!isAttemptCurrent(attemptId)) {
      return
    }
    const unikey = extractQrKey(keyRes)
    if (!unikey) {
      throw new Error('Missing QR key')
    }

    qrKey.value = unikey

    const qrRes = (await getQRCode(qrKey.value)) as QrImageResponse
    if (!isAttemptCurrent(attemptId)) {
      return
    }
    const qrimg = extractQrImage(qrRes)
    if (!qrimg) {
      throw new Error('Missing QR image')
    }

    qrImage.value = qrimg
    status.value = 'waiting'
    statusText.value = '请使用网易云音乐 App 扫码登录'
    startPolling(attemptId)
  } catch (error) {
    if (!isAttemptCurrent(attemptId)) {
      return
    }

    logger.error('Failed to load Netease login QR code', error)
    status.value = 'error'
    statusText.value = '加载二维码失败，请稍后重试'
    toastStore.error('加载网易云登录二维码失败')
  }
}

function startPolling(attemptId: number): void {
  stopPolling()

  pollingTimer = setInterval(async () => {
    if (!isAttemptCurrent(attemptId)) {
      stopPolling()
      return
    }

    if (isChecking) {
      return
    }

    isChecking = true
    try {
      const res = (await checkQRStatus(qrKey.value)) as QrCheckResponse

      // 解包 IPC 响应格式 { success: true, data: {...} }
      const unwrapped =
        res && typeof res === 'object' && 'success' in res && 'data' in res
          ? (res as { success: boolean; data: QrCheckResponse }).data
          : res

      if (!isAttemptCurrent(attemptId)) {
        return
      }

      const sessionCookie = extractQrCookie(unwrapped)

      // 调试日志
      logger.debug('Netease QR login check response:', {
        rawStatusCode: extractQrStatusCode(unwrapped),
        hasCookie: !!sessionCookie,
        fullResponse: JSON.stringify(unwrapped)
      })

      const statusCode = extractQrStatusCode(unwrapped)

      switch (statusCode) {
        case 800:
          status.value = 'expired'
          statusText.value = '二维码已过期，请刷新后重新扫码'
          stopPolling()
          break
        case 801:
          status.value = 'waiting'
          statusText.value = '请使用网易云音乐 App 扫码登录'
          break
        case 802:
          status.value = 'scanned'
          statusText.value = '已扫码，请在手机上确认登录'
          break
        case 803:
          status.value = 'success'
          statusText.value = '登录成功'
          stopPolling()
          await handleLoginSuccess(sessionCookie, attemptId)
          break
        default:
          break
      }
    } catch (error) {
      if (!isAttemptCurrent(attemptId)) {
        return
      }

      logger.warn('Failed to poll Netease QR login status', error)
    } finally {
      if (isAttemptCurrent(attemptId)) {
        isChecking = false
      }
    }
  }, 3000)
}

function stopPolling(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

async function handleLoginSuccess(cookie: string, attemptId: number): Promise<void> {
  try {
    if (!isAttemptCurrent(attemptId)) {
      return
    }

    const initialCookie = resolveSessionCookie(cookie)
    if (initialCookie) {
      userStore.setCookie(initialCookie)
    }

    const userRes = (await getUserAccount(initialCookie)) as UserAccountResponse
    if (!isAttemptCurrent(attemptId)) {
      return
    }

    let profile = extractUserProfile(userRes)
    if (!profile) {
      const userId = extractUserId(userRes)
      if (userId !== null) {
        const userDetailRes = (await getUserDetail(userId, initialCookie)) as UserDetailResponse
        if (!isAttemptCurrent(attemptId)) {
          return
        }
        const detailProfile =
          userDetailRes?.profile ||
          userDetailRes?.data?.profile ||
          userDetailRes?.body?.data?.profile
        profile = detailProfile && typeof detailProfile === 'object' ? detailProfile : null
      }
    }

    if (!profile) {
      throw new Error('Missing user profile')
    }

    userStore.login(profile, resolveSessionCookie(initialCookie))
    toastStore.success('网易云登录成功')
    clearCloseTimer()
    closeTimer = setTimeout(() => {
      if (!isAttemptCurrent(attemptId)) {
        return
      }

      emit('close')
      closeTimer = null
    }, 500)
  } catch (error) {
    if (!isAttemptCurrent(attemptId)) {
      return
    }

    logger.error('Failed to load Netease user profile after login', error)
    userStore.logout()
    status.value = 'error'
    statusText.value = '登录成功，但获取账号信息失败，请重试'
    toastStore.error('获取账号信息失败，请重试')
  }
}

function refreshQRCode(): void {
  invalidateActiveAttempt()
  void fetchQRCode()
}

function close(): void {
  invalidateActiveAttempt()
  emit('close')
}

onMounted(() => {
  void fetchQRCode()
})

onUnmounted(() => {
  invalidateActiveAttempt()
})
</script>

<template>
  <div class="login-modal-overlay" @click.self="close">
    <div class="login-modal">
      <div class="login-header">
        <h2>网易云登录</h2>
        <button class="close-btn" @click="close">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="login-content">
        <div class="qr-container">
          <div v-if="qrImage" class="qr-wrapper" :class="{ 'qr-expired': status === 'expired' }">
            <img :src="qrImage" alt="网易云登录二维码" class="qr-image" />
            <div v-if="status === 'expired'" class="qr-overlay">
              <button class="refresh-btn" @click="refreshQRCode">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                刷新二维码
              </button>
            </div>
          </div>

          <div v-else class="qr-loading">
            <div class="loading-spinner"></div>
          </div>
        </div>

        <p class="status-text" :class="'status-' + status">{{ statusText }}</p>

        <div class="login-tips">
          <p>打开网易云音乐 App</p>
          <p>使用扫一扫完成登录</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
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

.refresh-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: var(--black, #000);
  color: var(--white, #fff);
  border: none;
  cursor: pointer;
  font-size: 12px;
}

.refresh-btn:hover {
  background: var(--gray, #333);
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

.status-text {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: var(--gray, #666);
}

.status-text.status-success {
  color: #52c41a;
  font-weight: 600;
}

.status-text.status-error {
  color: #ff4d4f;
}

.status-text.status-scanned {
  color: #1890ff;
}

.login-tips {
  padding-top: 12px;
  border-top: 1px dashed var(--gray-light, #ddd);
}

.login-tips p {
  margin: 4px 0;
  font-size: 12px;
  color: var(--gray, #999);
}
</style>
