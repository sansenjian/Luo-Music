<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { qqMusicApi } from '../api/qqmusic'
import { useToastStore } from '../store/toastStore'

const props = defineProps({
  modelValue: Boolean
})

const emit = defineEmits(['update:modelValue', 'loginSuccess'])

const toastStore = useToastStore()

const showModal = ref(false)
const qrCodeImg = ref('')
const ptqrtoken = ref('')
const qrsig = ref('')
const loading = ref(false)
const checkInterval = ref(null)

// 监听 props 变化
watch(() => props.modelValue, (newVal) => {
  showModal.value = newVal
  if (newVal) {
    loadQRCode()
  }
})

onMounted(() => {
  if (props.modelValue) {
    showModal.value = true
    loadQRCode()
  }
})

onUnmounted(() => {
  stopCheck()
})

function stopCheck() {
  if (checkInterval.value) {
    clearInterval(checkInterval.value)
    checkInterval.value = null
  }
}

async function loadQRCode() {
  loading.value = true
  try {
    const res = await qqMusicApi.getQQLoginQr()
    // API 返回格式可能是 {img, ptqrtoken, qrsig} 或 {body: {img, ptqrtoken, qrsig}}
    const data = res.body || res
    if (data && data.img) {
      qrCodeImg.value = data.img
      ptqrtoken.value = data.ptqrtoken
      qrsig.value = data.qrsig
      startCheck()
    } else {
      toastStore.error('获取二维码失败')
    }
  } catch (error) {
    console.error('Failed to load QR code:', error)
    toastStore.error('获取二维码失败：' + error.message)
  } finally {
    loading.value = false
  }
}

function startCheck() {
  stopCheck()
  checkInterval.value = setInterval(async () => {
    try {
      const res = await qqMusicApi.checkQQLoginQr(ptqrtoken.value, qrsig.value)
      if (res && res.isOk) {
        toastStore.success('登录成功！')
        stopCheck()
        emit('loginSuccess')
        emit('update:modelValue', false)
      } else if (res && res.refresh) {
        // 二维码已失效，重新加载
        toastStore.warning('二维码已失效，正在刷新...')
        loadQRCode()
      }
    } catch (error) {
      console.error('Failed to check login status:', error)
    }
  }, 2000)
}

function closeModal() {
  stopCheck()
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showModal" class="modal-mask">
        <div class="modal-container">
          <div class="modal-header">
            <h3>QQ 音乐扫码登录</h3>
            <button class="close-btn" @click="closeModal">×</button>
          </div>
          
          <div class="modal-body">
            <div v-if="loading" class="qr-loading">
              <div class="loading-spinner"></div>
              <p>加载中...</p>
            </div>
            <div v-else class="qr-container">
              <img v-if="qrCodeImg" :src="qrCodeImg" alt="QR Code" class="qr-image" />
              <p class="qr-tip">请使用手机 QQ 扫码登录</p>
            </div>
          </div>
          
          <div class="modal-footer">
            <button class="refresh-btn" @click="loadQRCode" :disabled="loading">
              {{ loading ? '加载中...' : '刷新二维码' }}
            </button>
            <button class="cancel-btn" @click="closeModal">
              取消
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.modal-container {
  background: var(--white);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.33);
  width: 320px;
  max-width: 90vw;
  overflow: hidden;
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: 24px 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 280px;
}

.qr-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.qr-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.qr-image {
  width: 200px;
  height: 200px;
  object-fit: contain;
}

.qr-tip {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: center;
  gap: 12px;
}

.refresh-btn,
.cancel-btn {
  padding: 8px 24px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn {
  background: var(--accent);
  color: white;
  border: none;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-btn {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.cancel-btn:hover {
  background: var(--bg);
}

/* Modal transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.3s ease;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.9);
}
</style>
