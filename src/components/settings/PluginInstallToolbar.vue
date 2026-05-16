<script setup lang="ts">
import { uiMessages } from '@/messages/ui'

const installPath = defineModel<string>({ required: true })

defineProps<{
  canInstall: boolean
  isInstalling: boolean
  isLoading: boolean
}>()

const emit = defineEmits<{
  'browse-install-path': []
  install: []
  refresh: []
}>()
</script>

<template>
  <div class="plugin-toolbar">
    <label class="plugin-install-field">
      <svg
        class="plugin-install-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <input
        v-model="installPath"
        class="plugin-install-input"
        type="text"
        :placeholder="uiMessages.settings.fields.pluginInstallPath"
      />
    </label>

    <div class="plugin-toolbar-actions">
      <button
        class="plugin-pill plugin-pill-secondary"
        type="button"
        @click="emit('browse-install-path')"
      >
        {{ uiMessages.settings.actions.browsePluginPath }}
      </button>
      <button
        class="plugin-pill plugin-pill-primary"
        type="button"
        :disabled="!canInstall"
        @click="emit('install')"
      >
        {{
          isInstalling
            ? uiMessages.settings.actions.installingPlugin
            : uiMessages.settings.actions.installPlugin
        }}
      </button>
      <button
        class="plugin-pill plugin-pill-ghost"
        type="button"
        :disabled="isLoading"
        @click="emit('refresh')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          class="plugin-refresh-icon"
          aria-hidden="true"
        >
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.plugin-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.plugin-install-field {
  flex: 1 1 280px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  min-height: 42px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-control-radius);
  background: var(--ui-control-bg);
}

.plugin-install-icon {
  width: 16px;
  height: 16px;
  color: var(--gray-light);
  flex-shrink: 0;
}

.plugin-install-input {
  flex: 1;
  min-width: 0;
  min-height: 38px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--black);
}

.plugin-toolbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.plugin-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: var(--ui-control-radius);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.plugin-pill svg {
  width: 15px;
  height: 15px;
}

.plugin-pill-primary {
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
  box-shadow: var(--ui-primary-shadow);
}

.plugin-pill-primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.plugin-pill-secondary {
  background: var(--ui-surface-muted);
  color: var(--gray);
  box-shadow: inset 0 0 0 1px var(--ui-border-subtle);
}

.plugin-pill-secondary:hover:not(:disabled) {
  background: var(--ui-hover-bg);
  color: var(--black);
  transform: translateY(-1px);
}

.plugin-pill-ghost {
  background: transparent;
  color: var(--gray);
  box-shadow: inset 0 0 0 1px var(--ui-border-subtle);
}

.plugin-pill-ghost:hover:not(:disabled) {
  background: var(--ui-hover-bg);
  color: var(--black);
}

.plugin-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.plugin-refresh-icon {
  width: 16px;
  height: 16px;
}

@media (max-width: 640px) {
  .plugin-toolbar {
    flex-direction: column;
  }

  .plugin-install-field {
    flex-basis: auto;
    width: 100%;
  }

  .plugin-toolbar-actions {
    width: 100%;
  }

  .plugin-toolbar-actions .plugin-pill {
    flex: 1;
  }
}
</style>
