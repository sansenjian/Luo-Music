<script setup>
import { ref, onMounted } from 'vue'

const cacheSize = ref({ httpCache: 0, httpCacheFormatted: '0 B' })
const loading = ref(false)
const isElectron = ref(false)
const emit = defineEmits(['notify'])

onMounted(async () => {
  isElectron.value = !!window.electronAPI
  if (isElectron.value) {
    await loadCacheSize()
  }
})

async function loadCacheSize() {
  if (!window.electronAPI) return
  try {
    cacheSize.value = await window.electronAPI.getCacheSize()
  } catch (error) {
    console.error('Failed to get cache size:', error)
  }
}

function notify(message, type = 'info') {
  emit('notify', { message, type })
}

async function clearCache(options, message = '确定要清理缓存吗？') {
  if (!window.electronAPI) {
    notify('此功能仅在 Electron 应用中可用', 'warning')
    return
  }

  if (!confirm(message)) {
    return
  }

  loading.value = true
  try {
    const result = await window.electronAPI.clearCache(options)
    
    if (result.failed.length === 0) {
      notify('缓存清理成功', 'success')
    } else {
      const failedTypes = result.failed.map(f => f.type).join(', ')
      notify(`部分缓存清理失败: ${failedTypes}`, 'warning')
    }
    
    await loadCacheSize()
  } catch (error) {
    notify('缓存清理失败: ' + (error.message || error), 'error')
  } finally {
    loading.value = false
  }
}

async function clearCookiesOnly() {
  await clearCache({ cookies: true }, '确定要清理 Cookies 吗？这可能会清除您的登录状态。')
}

async function clearAllCache() {
  await clearCache({ all: true }, '确定要清理所有缓存吗？这将清除登录状态和本地设置。')
}
</script>

<template>
  <div class="cache-manager" v-if="isElectron">
    <div class="cache-header">
      <h3>缓存管理</h3>
      <p class="cache-desc">管理应用程序缓存数据，清理后可能需要重新登录。</p>
    </div>
    
    <div class="cache-info">
      <span class="cache-label">当前缓存大小:</span>
      <span class="cache-value">{{ cacheSize.httpCacheFormatted }}</span>
    </div>
    
    <div class="cache-actions">
      <button class="cache-btn" @click="clearCookiesOnly" :disabled="loading">
        {{ loading ? '清理中...' : '清理 Cookies' }}
      </button>
      <button class="cache-btn danger" @click="clearAllCache" :disabled="loading">
        {{ loading ? '清理中...' : '清理全部缓存' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.cache-manager {
  padding: 16px;
  background: var(--bg-secondary, #f5f5f5);
  border: 2px solid var(--black);
}

.cache-header {
  margin-bottom: 12px;
}

.cache-header h3 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.cache-desc {
  margin: 0;
  font-size: 12px;
  color: var(--gray, #666);
}

.cache-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px;
  background: var(--bg, #fff);
  border: 1px solid var(--gray-light, #ddd);
}

.cache-label {
  font-size: 13px;
  color: var(--gray, #666);
}

.cache-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent, #333);
}

.cache-actions {
  display: flex;
  gap: 8px;
}

.cache-btn {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  border: 2px solid var(--black);
  cursor: pointer;
  background: var(--white);
  color: var(--black);
  transition: all 0.1s;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.cache-btn:hover:not(:disabled) {
  background: var(--black);
  color: var(--white);
}

.cache-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cache-btn.danger {
  border-color: #ff4d4f;
  color: #ff4d4f;
}

.cache-btn.danger:hover:not(:disabled) {
  background: #ff4d4f;
  color: white;
}
</style>
