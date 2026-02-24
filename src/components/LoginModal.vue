<script setup>
import { ref, onUnmounted } from 'vue'
import { useUserStore } from '../store/userStore'
import { getQRKey, getQRCode, checkQRStatus, getUserAccount } from '../api/user'

const emit = defineEmits(['close'])

const userStore = useUserStore()

const qrImage = ref('')
const qrKey = ref('')
const status = ref('loading')
const statusText = ref('正在获取二维码...')
let pollingTimer = null

async function fetchQRCode() {
  status.value = 'loading'
  statusText.value = '正在获取二维码...'
  
  try {
    const keyRes = await getQRKey()
    if (!keyRes.data?.unikey) {
      throw new Error('获取 key 失败')
    }
    
    qrKey.value = keyRes.data.unikey
    
    const qrRes = await getQRCode(qrKey.value)
    if (!qrRes.data?.qrimg) {
      throw new Error('获取二维码失败')
    }
    
    qrImage.value = qrRes.data.qrimg
    status.value = 'waiting'
    statusText.value = '请使用网易云音乐 App 扫码登录'
    
    startPolling()
  } catch (error) {
    console.error('获取二维码失败:', error)
    status.value = 'error'
    statusText.value = '获取二维码失败，请重试'
  }
}

function startPolling() {
  stopPolling()
  
  pollingTimer = setInterval(async () => {
    try {
      const res = await checkQRStatus(qrKey.value)
      
      switch (res.code) {
        case 800:
          status.value = 'expired'
          statusText.value = '二维码已过期，请点击刷新'
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
          statusText.value = '登录成功！'
          stopPolling()
          await handleLoginSuccess(res.cookie)
          break
      }
    } catch (error) {
      console.error('检查扫码状态失败:', error)
    }
  }, 3000)
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

async function handleLoginSuccess(cookie) {
  try {
    userStore.setCookie(cookie)
    
    const userRes = await getUserAccount()
    if (userRes.profile) {
      userStore.setUserInfo(userRes.profile)
    }
    
    setTimeout(() => {
      emit('close')
    }, 500)
  } catch (error) {
    console.error('获取用户信息失败:', error)
    status.value = 'error'
    statusText.value = '登录成功但获取用户信息失败'
  }
}

function refreshQRCode() {
  stopPolling()
  fetchQRCode()
}

function close() {
  stopPolling()
  emit('close')
}

fetchQRCode()

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="login-modal-overlay" @click.self="close">
    <div class="login-modal">
      <div class="login-header">
        <h2>网易云登录</h2>
        <button class="close-btn" @click="close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <div class="login-content">
        <div class="qr-container">
          <div v-if="qrImage" class="qr-wrapper" :class="{ 'qr-expired': status === 'expired' }">
            <img :src="qrImage" alt="登录二维码" class="qr-image" />
            <div v-if="status === 'expired'" class="qr-overlay">
              <button class="refresh-btn" @click="refreshQRCode">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
          <p>扫一扫 → 登录</p>
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
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
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
