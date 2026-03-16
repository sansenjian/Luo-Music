<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSearchStore } from '../store/searchStore'

const searchStore = useSearchStore()

const keyword = ref('')

const servers = [
  { value: 'netease', label: '网易云' },
  { value: 'qq', label: 'QQ音乐' }
]

const isLoading = computed(() => searchStore.isLoading)

// 使用计算属性绑定平台选择，通过 action 更新
const selectedServer = computed({
  get: () => searchStore.server,
  set: (val: string) => searchStore.setServer(val)
})

function handleSearch() {
  if (!keyword.value.trim()) return
  searchStore.search(keyword.value)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    handleSearch()
  }
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
            <option v-for="srv in servers" :key="srv.value" :value="srv.value">
              {{ srv.label }}
            </option>
          </select>
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
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
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
</style>
