<template>
  <TransitionGroup name="error" tag="div" class="error-container">
    <div
      v-for="error in visibleErrors"
      :key="error.id"
      :class="['error-toast', error.type]"
      @click="dismiss(error.id)"
    >
      <span class="icon">{{ error.recoverable ? '⚠️' : '💥' }}</span>
      <div class="content">
        <p class="message">{{ error.message }}</p>
        <p v-if="!error.recoverable" class="detail">请重启应用或联系开发者</p>
      </div>
      <button class="close">×</button>
    </div>
  </TransitionGroup>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { errorCenter, AppError } from '../utils/error'

interface ToastError {
  id: number
  message: string
  recoverable: boolean
  type: 'warning' | 'error'
}

const visibleErrors = ref<ToastError[]>([])
let idCounter = 0

onMounted(() => {
  // 监听所有错误
  errorCenter.onAny((err: AppError) => {
    const toast: ToastError = {
      id: ++idCounter,
      message: err.getUserMessage(),
      recoverable: err.recoverable,
      type: err.recoverable ? 'warning' : 'error'
    }
    
    visibleErrors.value.push(toast)
    
    // 可恢复错误3秒自动消失，致命错误需手动关闭
    if (err.recoverable) {
      setTimeout(() => dismiss(toast.id), 3000)
    }
  })
})

const dismiss = (id: number) => {
  const idx = visibleErrors.value.findIndex(e => e.id === id)
  if (idx > -1) visibleErrors.value.splice(idx, 1)
}
</script>

<style scoped>
.error-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none; /* Allow clicks to pass through container */
}

.error-toast {
  pointer-events: auto; /* Enable clicks on toasts */
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-dark, #222); /* Fallback color */
  color: var(--text-main, #fff);
  border-left: 4px solid;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  cursor: pointer;
  min-width: 300px;
  max-width: 400px;
}

.error-toast.warning { border-color: #f59e0b; }
.error-toast.error { border-color: #ef4444; }

.content {
  flex: 1;
}

.message {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}

.detail {
  margin: 4px 0 0;
  font-size: 12px;
  opacity: 0.8;
}

.close {
  background: none;
  border: none;
  color: inherit;
  font-size: 20px;
  cursor: pointer;
  opacity: 0.6;
  padding: 0;
  line-height: 1;
}

.close:hover {
  opacity: 1;
}

.error-enter-active,
.error-leave-active {
  transition: all 0.3s ease;
}
.error-enter-from,
.error-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
