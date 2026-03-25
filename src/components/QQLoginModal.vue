<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

import { qqMusicApi } from '../api/qqmusic'
import { services } from '../services'
import { useToastStore } from '../store/toastStore'
import { useUserStore } from '../store/userStore'

type LoginStatus = 'loading' | 'waiting' | 'expired' | 'success' | 'error'

type QQLoginPayload = {
  session?: {
    cookie?: string
  }
  data?: {
    session?: {
      cookie?: string
    }
  }
  body?: {
    session?: {
      cookie?: string
    }
    data?: {
      cookie?: string
    }
    img?: string
    ptqrtoken?: string
    qrsig?: string
  }
  cookie?: string
  img?: string
  ptqrtoken?: string
  qrsig?: string
  isOk?: boolean
  refresh?: boolean
  message?: string
}

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'login-success': []
}>()

const logger = services.logger().createLogger('qqLoginModal')
const toastStore = useToastStore()
const userStore = useUserStore()

const qrCodeImg = ref('')
const ptqrtoken = ref('')
const qrsig = ref('')
const status = ref<LoginStatus>('loading')
const statusText = ref('正在加载二维码...')

let checkInterval: ReturnType<typeof setInterval> | null = null
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
  stopCheck()
  clearCloseTimer()
}

watch(
  () => props.modelValue,
  newValue => {
    if (newValue) {
      void loadQRCode()
      return
    }

    invalidateActiveAttempt()
  }
)

onMounted(() => {
  if (props.modelValue) {
    void loadQRCode()
  }
})

onUnmounted(() => {
  invalidateActiveAttempt()
})

function stopCheck(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

function extractSessionCookie(payload: QQLoginPayload | null | undefined): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const value =
    payload.session?.cookie ||
    payload.data?.session?.cookie ||
    payload.body?.session?.cookie ||
    payload.body?.data?.cookie ||
    payload.cookie ||
    ''

  logger.debug('Extracted session cookie:', {
    hasValue: !!value,
    valueLength: value.length,
    extractedFrom: payload.session?.cookie
      ? 'session.cookie'
      : payload.data?.session?.cookie
        ? 'data.session.cookie'
        : payload.body?.session?.cookie
          ? 'body.session.cookie'
          : payload.body?.data?.cookie
            ? 'body.data.cookie'
            : payload.cookie
              ? 'cookie'
              : 'none'
  })

  return typeof value === 'string' ? value : ''
}

async function loadQRCode(): Promise<void> {
  const attemptId = ++activeAttemptId

  stopCheck()
  clearCloseTimer()
  isChecking = false
  status.value = 'loading'
  statusText.value = '正在加载二维码...'

  try {
    const res = (await qqMusicApi.getQQLoginQr()) as QQLoginPayload

    // 解包 IPC 响应格式 { success: true, data: {...} }
    const unwrapped =
      res && typeof res === 'object' && 'success' in res && 'data' in res
        ? (res as { success: boolean; data: QQLoginPayload }).data
        : res

    logger.debug('QQ Login QR load response:', {
      hasSuccess: 'success' in (res ?? {}),
      unwrapped,
      rawResponse: JSON.stringify(res)
    })

    if (!isAttemptCurrent(attemptId)) {
      return
    }

    const data = unwrapped.body || unwrapped

    if (!data?.img || !data.ptqrtoken || !data.qrsig) {
      throw new Error('Missing QR login payload')
    }

    qrCodeImg.value = data.img
    ptqrtoken.value = data.ptqrtoken
    qrsig.value = data.qrsig
    status.value = 'waiting'
    statusText.value = '请使用 QQ 音乐 App 扫码登录'
    startCheck(attemptId)
  } catch (error) {
    if (!isAttemptCurrent(attemptId)) {
      return
    }

    logger.error('Failed to load QQ Music login QR code', error)
    status.value = 'error'
    statusText.value = '加载二维码失败，请稍后重试'
    toastStore.error('加载 QQ 音乐二维码失败')
  }
}

function startCheck(attemptId: number): void {
  stopCheck()

  checkInterval = setInterval(async () => {
    if (!isAttemptCurrent(attemptId)) {
      stopCheck()
      return
    }

    if (isChecking) {
      return
    }

    isChecking = true
    try {
      const res = (await qqMusicApi.checkQQLoginQr(ptqrtoken.value, qrsig.value)) as QQLoginPayload

      // 解包 IPC 响应格式 { success: true, data: {...} }
      const unwrapped =
        res && typeof res === 'object' && 'success' in res && 'data' in res
          ? (res as { success: boolean; data: QQLoginPayload }).data
          : res

      if (!isAttemptCurrent(attemptId)) {
        return
      }

      // 调试日志：打印实际返回的数据格式
      logger.debug('QQ Login check response:', {
        isOk: unwrapped?.isOk,
        refresh: unwrapped?.refresh,
        message: unwrapped?.message,
        hasSession: !!unwrapped?.session,
        hasCookie: !!unwrapped?.session?.cookie,
        fullResponse: JSON.stringify(unwrapped)
      })

      if (unwrapped?.isOk) {
        const sessionCookie = extractSessionCookie(unwrapped)
        if (!sessionCookie) {
          throw new Error('Missing QQ session cookie')
        }

        userStore.setQQCookie(sessionCookie)
        status.value = 'success'
        statusText.value = '登录成功'
        toastStore.success('QQ 音乐登录成功')
        stopCheck()

        clearCloseTimer()
        closeTimer = setTimeout(() => {
          if (!isAttemptCurrent(attemptId)) {
            return
          }

          emit('login-success')
          emit('update:modelValue', false)
          closeTimer = null
        }, 500)
      } else if (unwrapped?.refresh) {
        status.value = 'expired'
        statusText.value = '二维码已过期，请刷新后重新扫码'
        toastStore.warning('二维码已过期，请刷新后重试')
        stopCheck()
      }
    } catch (error) {
      if (!isAttemptCurrent(attemptId)) {
        return
      }

      logger.warn('Failed to poll QQ Music QR login status', error)
    } finally {
      if (isAttemptCurrent(attemptId)) {
        isChecking = false
      }
    }
  }, 2000)
}

function refreshQRCode(): void {
  invalidateActiveAttempt()
  void loadQRCode()
}

function closeModal(): void {
  invalidateActiveAttempt()
  emit('update:modelValue', false)
}
</script>

<template>
  <div v-if="modelValue" class="login-modal-overlay" @click.self="closeModal">
    <div class="login-modal">
      <div class="login-header">
        <h2>QQ 音乐登录</h2>
        <button class="close-btn" @click="closeModal">
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
          <div v-if="qrCodeImg" class="qr-wrapper" :class="{ 'qr-expired': status === 'expired' }">
            <img :src="qrCodeImg" alt="QQ 登录二维码" class="qr-image" />
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
          <p>打开 QQ 音乐或 QQ App</p>
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
