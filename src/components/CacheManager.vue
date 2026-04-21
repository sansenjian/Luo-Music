<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { services } from '../services'
import { useUserStore } from '../store/userStore'

const platformService = services.platform()
const userStore = useUserStore()
const cacheSize = ref({ httpCache: 0, httpCacheFormatted: '0 B' })
const loading = ref(false)
const emit = defineEmits(['notify'])

type CacheOptionKey = 'cookies' | 'localStorage' | 'sessionStorage' | 'indexDB' | 'cache'

const cacheOptionKeys: CacheOptionKey[] = [
  'cookies',
  'localStorage',
  'sessionStorage',
  'indexDB',
  'cache'
]

const cacheOptions = reactive<Record<CacheOptionKey, boolean>>({
  cookies: false,
  localStorage: false,
  sessionStorage: false,
  indexDB: false,
  cache: true
})

const allSelected = computed(() => cacheOptionKeys.every(k => cacheOptions[k]))
const noneSelected = computed(() => cacheOptionKeys.every(k => !cacheOptions[k]))

const cacheTypeLabels: Record<CacheOptionKey, string> = {
  cookies: 'Cookies（含登录状态）',
  localStorage: '本地存储',
  sessionStorage: '会话存储',
  indexDB: 'IndexedDB',
  cache: 'HTTP 缓存'
}

onMounted(loadCacheSize)

async function loadCacheSize() {
  try {
    cacheSize.value = await platformService.getCacheSize()
  } catch (error) {
    console.error('Failed to get cache size:', error)
  }
}

function notify(message: string, type = 'info') {
  emit('notify', { message, type })
}

function toggleAll() {
  const target = !allSelected.value
  cacheOptionKeys.forEach(k => {
    cacheOptions[k] = target
  })
}

async function clearSelectedCache() {
  const selected = cacheOptionKeys.filter(k => cacheOptions[k])
  if (selected.length === 0) {
    notify('请至少选择一项缓存类型', 'warning')
    return
  }

  if (!confirm('确定要清理所选缓存吗？清理 Cookies 后可能需要重新登录。')) return

  loading.value = true
  try {
    const options: Record<string, boolean> = {}
    selected.forEach(k => {
      options[k] = true
    })
    const result = await platformService.clearCache(options)

    handleClearResult(result)

    if (cacheOptions.cookies) {
      clearAccountCache()
    }

    await loadCacheSize()
  } catch (error) {
    notify('缓存清理失败: ' + (error instanceof Error ? error.message : String(error)), 'error')
  } finally {
    loading.value = false
  }
}

async function clearAllCache() {
  if (!confirm('确定要清理所有缓存吗？这将清除登录状态和本地设置。')) return

  loading.value = true
  try {
    const result = await platformService.clearCache({ all: true })

    handleClearResult(result)
    clearAccountCache()
    await loadCacheSize()
  } catch (error) {
    notify('缓存清理失败: ' + (error instanceof Error ? error.message : String(error)), 'error')
  } finally {
    loading.value = false
  }
}

function clearAccountCache() {
  userStore.logout()
  userStore.logoutQQ()
  notify('账号缓存已清理', 'success')
}

function handleClearResult(result: {
  success: string[]
  failed: { type: string; error: string }[]
}) {
  if (result.failed.length === 0) {
    notify('缓存清理成功', 'success')
  } else {
    const failedTypes = result.failed.map(f => f.type).join(', ')
    notify(`部分缓存清理失败: ${failedTypes}`, 'warning')
  }
}
</script>

<template>
  <div class="cache-manager">
    <div class="cache-header">
      <h3>缓存管理</h3>
      <p class="cache-desc">管理应用程序缓存数据，清理后可能需要重新登录。</p>
    </div>

    <div class="cache-info">
      <span class="cache-label">当前缓存大小:</span>
      <span class="cache-value">{{ cacheSize.httpCacheFormatted }}</span>
    </div>

    <div class="cache-account">
      <div class="account-header">
        <h4>账号缓存</h4>
        <button class="cache-btn small" @click="clearAccountCache" :disabled="loading">
          清理账号缓存
        </button>
      </div>
      <div class="account-status">
        <div class="account-item">
          <span class="account-label">网易云账号</span>
          <span :class="['account-badge', userStore.isLoggedIn ? 'logged-in' : 'logged-out']">
            {{ userStore.isLoggedIn ? '已登录' : '未登录' }}
          </span>
        </div>
        <div class="account-item">
          <span class="account-label">QQ 音乐账号</span>
          <span :class="['account-badge', userStore.qqLoggedIn ? 'logged-in' : 'logged-out']">
            {{ userStore.qqLoggedIn ? '已登录' : '未登录' }}
          </span>
        </div>
      </div>
    </div>

    <div class="cache-options">
      <div class="options-header">
        <h4>选择清理类型</h4>
        <button class="toggle-all-btn" @click="toggleAll">
          {{ allSelected ? '取消全选' : '全选' }}
        </button>
      </div>
      <div class="option-list">
        <label v-for="key in cacheOptionKeys" :key="key" class="option-item">
          <input type="checkbox" v-model="cacheOptions[key]" />
          <span>{{ cacheTypeLabels[key] }}</span>
        </label>
      </div>
    </div>

    <div class="cache-actions">
      <button class="cache-btn" @click="clearSelectedCache" :disabled="loading || noneSelected">
        {{ loading ? '清理中...' : '清理所选缓存' }}
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

.cache-account {
  margin-bottom: 12px;
  padding: 10px;
  background: var(--bg, #fff);
  border: 1px solid var(--gray-light, #ddd);
}

.account-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.cache-account h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--gray, #666);
}

.account-status {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.account-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.account-label {
  font-size: 13px;
}

.account-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.account-badge.logged-in {
  background: #e6f7e6;
  color: #2a8a2a;
}

.account-badge.logged-out {
  background: #f0f0f0;
  color: #999;
}

.cache-options {
  margin-bottom: 12px;
  padding: 10px;
  background: var(--bg, #fff);
  border: 1px solid var(--gray-light, #ddd);
}

.options-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.cache-options h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--gray, #666);
}

.toggle-all-btn {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--gray-light, #ddd);
  background: var(--white);
  color: var(--gray, #666);
  cursor: pointer;
  transition: all 0.1s;
}

.toggle-all-btn:hover {
  border-color: var(--black);
  color: var(--black);
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.option-item input[type='checkbox'] {
  cursor: pointer;
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

.cache-btn.small {
  padding: 4px 8px;
  font-size: 11px;
  border-width: 1px;
}
</style>
