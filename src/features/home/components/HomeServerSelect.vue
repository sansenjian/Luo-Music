<script setup lang="ts">
import {
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport
} from 'reka-ui'

import type { MusicServerOption } from '@/features/home/composables/useHomePage'

const props = defineProps<{
  selectedServer: string
  selectedServerLabel: string
  servers: MusicServerOption[]
  showSelect: boolean
}>()

const emit = defineEmits<{
  'close-select': []
  'select-server': [value: string]
  'toggle-select': []
}>()

function onSelectServer(value: string): void {
  emit('select-server', value)
}

function onOpenChange(isOpen: boolean): void {
  if (isOpen === props.showSelect) {
    return
  }

  if (isOpen) {
    emit('toggle-select')
    return
  }

  emit('close-select')
}
</script>

<template>
  <div class="server-select-host">
    <SelectRoot
      :model-value="props.selectedServer"
      :open="props.showSelect"
      @update:model-value="onSelectServer"
      @update:open="onOpenChange"
    >
      <div class="server-select-wrapper">
        <SelectTrigger class="server-select-custom">
          <SelectValue :placeholder="props.selectedServerLabel" />
          <svg
            class="arrow-icon"
            :class="{ rotated: props.showSelect }"
            viewBox="0 0 24 24"
            width="16"
            height="16"
          >
            <path d="M7 10l5 5 5-5z" fill="currentColor" />
          </svg>
        </SelectTrigger>
      </div>

      <SelectContent class="server-dropdown" position="popper" :side-offset="4">
        <SelectViewport>
          <SelectItem
            v-for="server in props.servers"
            :key="server.value"
            class="dropdown-option"
            :class="{ active: props.selectedServer === server.value }"
            :value="server.value"
            @click="onSelectServer(server.value)"
          >
            <SelectItemText>{{ server.label }}</SelectItemText>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectRoot>
  </div>
</template>

<style scoped>
.server-select-host {
  min-width: 0;
}

.server-select-wrapper {
  position: relative;
}

.server-select-custom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border: var(--ui-border);
  border-radius: var(--ui-control-radius);
  background: var(--ui-control-bg);
  cursor: pointer;
  min-width: 100px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  transition: all 0.2s;
  user-select: none;
}

.server-select-custom:hover {
  background: var(--ui-hover-bg);
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
  min-width: var(--reka-select-trigger-width);
  background: var(--ui-surface);
  border: var(--ui-border);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-floating-shadow);
  z-index: 1000;
  overflow: hidden;
}

.dropdown-option {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 1px solid var(--ui-border-subtle);
  outline: none;
}

.dropdown-option:last-child {
  border-bottom: none;
}

.dropdown-option:hover,
.dropdown-option[data-highlighted] {
  background: var(--ui-hover-bg);
}

.dropdown-option.active,
.dropdown-option[data-state='checked'] {
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
}

.dropdown-option.active:hover,
.dropdown-option[data-state='checked'][data-highlighted] {
  background: var(--ui-primary-hover-bg);
}
</style>
