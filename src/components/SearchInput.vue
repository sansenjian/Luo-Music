<script setup>
import { ref, computed } from 'vue'
import { useSearchStore } from '../store/searchStore'

const searchStore = useSearchStore()

const keyword = ref('')
const showApiInput = ref(false)

const servers = [
  { value: 'netease', label: '网易云' },
  { value: 'tencent', label: 'QQ音乐' },
  { value: 'kugou', label: '酷狗' },
  { value: 'kuwo', label: '酷我' },
  { value: 'baidu', label: '百度' },
  { value: 'xiami', label: '虾米' }
]

const apiPresets = [
  { label: '默认', url: 'https://music-api.sansenjian.asia/api' },
  { label: '备用1', url: 'https://api.injahow.cn/meting' },
  { label: '备用2', url: 'https://api.i-meto.com/meting/api' }
]

const selectedServer = computed({
  get: () => searchStore.server,
  set: (val) => searchStore.setServer(val)
})

const apiBase = computed({
  get: () => searchStore.apiBase,
  set: (val) => searchStore.setApiBase(val)
})

const isLoading = computed(() => searchStore.isLoading)

function handleSearch() {
  if (!keyword.value.trim()) return
  searchStore.search(keyword.value)
}

function handleKeydown(event) {
  if (event.key === 'Enter') {
    handleSearch()
  }
}

function setApiPreset(url) {
  apiBase.value = url
  showApiInput.value = false
}
</script>

<template>
  <div class="search-panel">
    <div class="search-header">
      <h3 class="search-title">搜索音乐</h3>
    </div>
    
    <div class="search-body">
      <div class="search-row">
        <div class="input-wrapper">
          <input
            v-model="keyword"
            type="text"
            class="search-input"
            placeholder="输入歌曲名称或艺术家..."
            @keydown="handleKeydown"
          />
        </div>
        <button class="search-btn" @click="handleSearch" :disabled="isLoading">
          <span v-if="isLoading" class="loading-icon">⟳</span>
          <span v-else>搜索</span>
        </button>
      </div>

      <div class="search-options">
        <div class="option-group">
          <label class="option-label">平台</label>
          <select v-model="selectedServer" class="server-select">
            <option v-for="server in servers" :key="server.value" :value="server.value">
              {{ server.label }}
            </option>
          </select>
        </div>

        <div class="option-group api-option">
          <button class="api-toggle" @click="showApiInput = !showApiInput">
            API 设置
            <span class="toggle-icon">{{ showApiInput ? '▲' : '▼' }}</span>
          </button>
        </div>
      </div>

      <div v-if="showApiInput" class="api-config">
        <div class="api-input-wrapper">
          <label class="api-label">API 地址</label>
          <input
            v-model="apiBase"
            type="text"
            class="api-input"
            placeholder="输入 API 地址..."
          />
        </div>
        <div class="api-presets">
          <button
            v-for="preset in apiPresets"
            :key="preset.url"
            class="preset-btn"
            @click="setApiPreset(preset.url)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-panel {
  background: var(--white);
  border: 3px solid var(--black);
  box-shadow: 6px 6px 0 var(--black);
}

.search-header {
  padding: 16px 20px;
  border-bottom: 3px solid var(--black);
  background: var(--bg);
}

.search-title {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--black);
}

.search-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-row {
  display: flex;
  gap: 12px;
}

.input-wrapper {
  flex: 1;
}

.search-input {
  width: 100%;
  height: 48px;
  padding: 0 16px;
  border: 3px solid var(--black);
  background: var(--white);
  font-size: 14px;
  font-family: inherit;
  color: var(--black);
  outline: none;
  transition: all 0.15s ease;
}

.search-input::placeholder {
  color: var(--gray-light);
}

.search-input:focus {
  border-color: var(--accent);
  box-shadow: 4px 4px 0 var(--black);
}

.search-btn {
  height: 48px;
  padding: 0 24px;
  border: 3px solid var(--black);
  background: var(--accent);
  color: var(--white);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.search-btn:hover:not(:disabled) {
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--black);
}

.search-btn:active:not(:disabled) {
  transform: translate(0, 0);
  box-shadow: none;
}

.search-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

.loading-icon {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.search-options {
  display: flex;
  gap: 16px;
  align-items: center;
}

.option-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--gray);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.server-select {
  height: 36px;
  padding: 0 12px;
  border: 2px solid var(--black);
  background: var(--white);
  font-size: 13px;
  font-family: inherit;
  color: var(--black);
  cursor: pointer;
  outline: none;
}

.server-select:focus {
  border-color: var(--accent);
}

.api-option {
  margin-left: auto;
}

.api-toggle {
  height: 36px;
  padding: 0 12px;
  border: 2px solid var(--black);
  background: var(--bg);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  color: var(--black);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.api-toggle:hover {
  background: var(--accent);
  color: var(--white);
}

.toggle-icon {
  font-size: 10px;
}

.api-config {
  padding: 16px;
  background: var(--bg);
  border: 2px solid var(--black);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.api-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.api-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--gray);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.api-input {
  height: 36px;
  padding: 0 12px;
  border: 2px solid var(--black);
  background: var(--white);
  font-size: 13px;
  font-family: inherit;
  color: var(--black);
  outline: none;
}

.api-input:focus {
  border-color: var(--accent);
}

.api-presets {
  display: flex;
  gap: 8px;
}

.preset-btn {
  height: 32px;
  padding: 0 12px;
  border: 2px solid var(--black);
  background: var(--white);
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--black);
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-btn:hover {
  background: var(--accent);
  color: var(--white);
  transform: translate(-1px, -1px);
  box-shadow: 2px 2px 0 var(--black);
}

.preset-btn:active {
  transform: translate(0, 0);
  box-shadow: none;
}
</style>
