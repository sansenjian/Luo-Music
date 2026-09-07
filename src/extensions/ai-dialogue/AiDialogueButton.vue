<template>
  <button
    v-if="isElectron"
    class="ai-dialogue-button"
    :class="{ active: isOpen }"
    @click="emit('toggle')"
    aria-label="AI 助手"
  >
    <span class="ai-dialogue-button__icon">AI</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  isOpen: boolean
  isElectron: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<style scoped>
.ai-dialogue-button {
  position: fixed;
  right: 24px;
  bottom: 100px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: var(--primary-color, #3b82f6);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

.ai-dialogue-button.active {
  background: var(--primary-color-active, #2563eb);
}

.ai-dialogue-button__icon {
  font-size: 14px;
  font-weight: 600;
}
</style>
