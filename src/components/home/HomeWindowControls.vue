<script setup lang="ts">
import UserAvatar from '../UserAvatar.vue'

const props = defineProps<{
  isElectron: boolean
}>()

const emit = defineEmits<{
  'close-window': []
  'maximize-window': []
  'minimize-window': []
}>()
</script>

<template>
  <div class="window-controls">
    <UserAvatar />
    <template v-if="props.isElectron">
      <button class="win-btn" @click="emit('minimize-window')" title="Minimize">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>

      <button class="win-btn" @click="emit('maximize-window')" title="Maximize">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        </svg>
      </button>

      <button class="win-btn win-close" @click="emit('close-window')" title="Close">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </template>
  </div>
</template>

<style scoped>
.window-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-end;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--black);
  opacity: 0.8;
}

.win-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  opacity: 1;
}

.win-close:hover {
  background: #ff4d4f;
  color: white;
  opacity: 1;
}

@media (max-width: 900px) {
  .window-controls {
    gap: 4px;
  }

  .win-btn {
    width: 28px;
    height: 28px;
  }
}

@media (max-width: 600px) {
  .win-btn {
    width: 28px;
    height: 28px;
  }

  .win-btn svg {
    width: 14px;
    height: 14px;
  }
}
</style>
