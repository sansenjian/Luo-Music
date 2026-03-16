<script setup lang="ts">
import type { MusicServerOption } from '../../composables/useHomePage'

const props = defineProps<{
  selectedServer: string
  selectedServerLabel: string
  servers: MusicServerOption[]
  showSelect: boolean
}>()

const emit = defineEmits<{
  'select-server': [value: string]
  'toggle-select': []
}>()

function onSelectServer(value: string): void {
  emit('select-server', value)
}

function onToggleSelect(): void {
  emit('toggle-select')
}
</script>

<template>
  <div class="server-select-wrapper">
    <div class="server-select-custom" @click="onToggleSelect">
      <span>{{ props.selectedServerLabel }}</span>
      <svg
        class="arrow-icon"
        :class="{ rotated: props.showSelect }"
        viewBox="0 0 24 24"
        width="16"
        height="16"
      >
        <path d="M7 10l5 5 5-5z" fill="currentColor" />
      </svg>
    </div>

    <Transition name="select-dropdown">
      <div v-if="props.showSelect" class="server-dropdown">
        <div
          v-for="server in props.servers"
          :key="server.value"
          class="dropdown-option"
          :class="{ active: props.selectedServer === server.value }"
          @click="onSelectServer(server.value)"
        >
          {{ server.label }}
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.server-select-wrapper {
  position: relative;
}

.server-select-custom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border: 2px solid var(--black);
  background: var(--white);
  cursor: pointer;
  min-width: 100px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  transition: all 0.2s;
  user-select: none;
}

.server-select-custom:hover {
  background: var(--bg);
}

.server-select-custom:active {
  transform: scale(0.98);
}

.arrow-icon {
  transition: transform 0.3s;
  flex-shrink: 0;
}

.arrow-icon.rotated {
  transform: rotate(180deg);
}

.server-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 100%;
  background: var(--white);
  border: 2px solid var(--black);
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.1);
  z-index: 1000;
  overflow: hidden;
}

.dropdown-option {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 1px solid var(--border);
}

.dropdown-option:last-child {
  border-bottom: none;
}

.dropdown-option:hover {
  background: var(--bg);
}

.dropdown-option.active {
  background: var(--black);
  color: var(--white);
}

.dropdown-option.active:hover {
  background: var(--black);
}

.select-dropdown-enter-active,
.select-dropdown-leave-active {
  transition: all 0.2s ease;
}

.select-dropdown-enter-from,
.select-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
