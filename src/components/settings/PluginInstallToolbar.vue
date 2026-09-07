<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { uiMessages } from '@/messages/ui'

const installPath = defineModel<string>({ required: true })

defineProps<{
  canInstall: boolean
  isInstalling: boolean
  isLoading: boolean
}>()

const emit = defineEmits<{
  'browse-install-path': [mode: 'file' | 'directory']
  'request-install': []
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
      <Input
        v-model="installPath"
        class="plugin-install-input"
        type="text"
        :placeholder="uiMessages.settings.fields.pluginInstallPath"
      />
    </label>

    <div class="plugin-toolbar-actions">
      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="emit('browse-install-path', 'file')"
      >
        {{ uiMessages.settings.actions.browsePluginPackage }}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="emit('browse-install-path', 'directory')"
      >
        {{ uiMessages.settings.actions.browsePluginFolder }}
      </Button>
      <Button type="button" size="sm" :disabled="!canInstall" @click="emit('request-install')">
        {{
          isInstalling
            ? uiMessages.settings.actions.installingPlugin
            : uiMessages.settings.actions.installPlugin
        }}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        :disabled="isLoading"
        :aria-label="uiMessages.settings.actions.refreshPlugins"
        :title="uiMessages.settings.actions.refreshPlugins"
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
      </Button>
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
  box-shadow: none;
  font-size: 13px;
  color: var(--black);
}

.plugin-install-input:focus-visible {
  box-shadow: none;
}

.plugin-toolbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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

  .plugin-toolbar-actions > * {
    flex: 1;
  }
}
</style>
