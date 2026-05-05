<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    searchQuery: string
    searchPlaceholder?: string
    inlineMessage?: string | null
    inlineActionLabel?: string | null
    searchHint?: string | null
  }>(),
  {
    searchPlaceholder: '搜索歌曲、歌手或专辑',
    inlineMessage: null,
    inlineActionLabel: null,
    searchHint: null
  }
)

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'clear-search': []
  'inline-action': []
}>()

function handleInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update:searchQuery', target?.value ?? '')
}
</script>

<template>
  <div class="media-toolbar">
    <div class="media-toolbar-main">
      <div class="media-toolbar-tabs">
        <slot name="tabs" />
      </div>

      <div v-if="props.inlineMessage" class="media-inline-message" role="alert">
        <span>{{ props.inlineMessage }}</span>
        <button
          v-if="props.inlineActionLabel"
          type="button"
          class="inline-action"
          @click="emit('inline-action')"
        >
          {{ props.inlineActionLabel }}
        </button>
      </div>
    </div>

    <div class="media-search-wrapper">
      <label class="media-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="7"></circle>
          <path d="m20 20-3.5-3.5"></path>
        </svg>
        <input
          :value="props.searchQuery"
          type="search"
          :placeholder="props.searchPlaceholder"
          @input="handleInput"
        />
        <button
          v-if="props.searchQuery"
          type="button"
          class="search-clear"
          aria-label="清空搜索"
          @click="emit('clear-search')"
        >
          ×
        </button>
      </label>
      <span v-if="props.searchHint" class="search-loading-hint">{{ props.searchHint }}</span>
    </div>
  </div>
</template>

<style scoped>
.media-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 8px;
}

.media-toolbar-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.media-toolbar-tabs {
  display: flex;
  align-items: center;
  gap: 22px;
}

:deep(.subtab) {
  position: relative;
  padding: 0 0 14px;
  border: 0;
  background: transparent;
  color: var(--gray);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

:deep(.subtab.active) {
  color: var(--black);
}

:deep(.subtab.active)::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 3px;
  background: var(--ui-track-fill);
  border-radius: 999px;
}

:deep(.subtab:disabled) {
  cursor: default;
  opacity: 0.5;
}

.media-inline-message {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: #b42318;
  font-size: 13px;
}

.inline-action {
  border: 0;
  background: transparent;
  color: var(--black);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.media-search-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.media-search {
  width: min(100%, 280px);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  min-height: 38px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-control-radius);
  background: var(--ui-control-bg);
  color: var(--gray);
}

.media-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  outline: none;
  font-size: 13px;
}

.search-clear {
  border: 0;
  background: transparent;
  color: var(--gray);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.search-loading-hint {
  color: var(--gray);
  font-size: 11px;
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

@media (max-width: 760px) {
  .media-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .media-search {
    width: 100%;
  }
}
</style>
