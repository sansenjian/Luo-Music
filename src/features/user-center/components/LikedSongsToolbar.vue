<script setup lang="ts">
import type { LikedSongsFilterScope, LikedSongsFilterScopeOption } from './likedSongsView.types'

const searchQuery = defineModel<string>('searchQuery', { required: true })
const filterScope = defineModel<LikedSongsFilterScope>('filterScope', { required: true })

defineProps<{
  scopeOptions: LikedSongsFilterScopeOption[]
  hasSearchQuery: boolean
  filteredCount: number
  loadedCount: number
}>()

const emit = defineEmits<{
  'play-all': []
}>()

function clearSearch(): void {
  searchQuery.value = ''
}

function setFilterScope(scope: LikedSongsFilterScope): void {
  filterScope.value = scope
}
</script>

<template>
  <div class="liked-toolbar">
    <button class="play-all-btn" type="button" @click="emit('play-all')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"></path>
      </svg>
      播放全部
    </button>

    <div class="search-panel">
      <label class="search-input">
        <span class="sr-only">搜索喜欢的音乐</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="7"></circle>
          <path d="m20 20-3.5-3.5"></path>
        </svg>
        <input
          v-model="searchQuery"
          type="search"
          placeholder="搜索歌名、歌手或专辑"
          autocomplete="off"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="search-clear-btn"
          aria-label="清空搜索"
          @click="clearSearch"
        >
          x
        </button>
      </label>

      <div class="filter-scopes" role="tablist" aria-label="搜索范围">
        <button
          v-for="scope in scopeOptions"
          :key="scope.value"
          type="button"
          class="scope-btn"
          :class="{ active: filterScope === scope.value }"
          @click="setFilterScope(scope.value)"
        >
          {{ scope.label }}
        </button>
      </div>

      <p class="results-summary">
        <template v-if="hasSearchQuery">
          找到 {{ filteredCount }} 首匹配歌曲，当前已加载 {{ loadedCount }} 首
        </template>
        <template v-else>当前已加载 {{ loadedCount }} 首喜欢的音乐</template>
      </p>
    </div>
  </div>
</template>

<style scoped>
.liked-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-start;
  margin-bottom: 24px;
}

.play-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 28px;
  background: var(--accent);
  color: var(--white);
  border: 2px solid var(--black);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 24px;
  transition: all 0.2s ease;
  box-shadow: 4px 4px 0 var(--black);
}

.play-all-btn:hover {
  background: #e55a2b;
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 var(--black);
}

.play-all-btn:active {
  transform: translate(0, 0);
  box-shadow: 2px 2px 0 var(--black);
}

.search-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  min-height: 52px;
  border: 2px solid var(--black);
  border-radius: 12px;
  background: var(--white);
  box-shadow: 4px 4px 0 var(--black);
  color: var(--gray);
}

.search-input input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 14px;
  color: var(--black);
  background: transparent;
}

.search-input input::placeholder {
  color: var(--gray);
}

.search-clear-btn {
  border: none;
  background: transparent;
  color: var(--gray);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.filter-scopes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.scope-btn {
  padding: 8px 14px;
  border: 2px solid var(--black);
  border-radius: 999px;
  background: var(--white);
  color: var(--black);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.scope-btn.active,
.scope-btn:hover {
  background: var(--black);
  color: var(--white);
}

.results-summary {
  margin: 0;
  font-size: 12px;
  color: var(--gray);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 768px) {
  .liked-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .play-all-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
