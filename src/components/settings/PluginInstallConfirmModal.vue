<script setup lang="ts">
import { computed } from 'vue'

import { uiMessages } from '@/messages/ui'

const props = defineProps<{
  modelValue: boolean
  installPath: string
  isInstalling: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()

const trimmedInstallPath = computed(() => props.installPath.trim())
const canConfirm = computed(() => trimmedInstallPath.value.length > 0 && !props.isInstalling)

function close(): void {
  if (props.isInstalling) {
    return
  }

  emit('update:modelValue', false)
}

function confirmInstall(): void {
  if (!canConfirm.value) {
    return
  }

  emit('confirm')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="plugin-install-modal-fade">
      <div v-if="modelValue" class="plugin-install-modal-overlay" @click.self="close">
        <section
          class="plugin-install-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plugin-install-confirm-title"
        >
          <header class="plugin-install-modal-header">
            <h2 id="plugin-install-confirm-title">
              {{ uiMessages.settings.dialogs.pluginInstallConfirmTitle }}
            </h2>
            <button
              class="plugin-install-modal-close"
              type="button"
              :aria-label="uiMessages.settings.dialogs.pluginInstallConfirmCloseLabel"
              :disabled="isInstalling"
              @click="close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <div class="plugin-install-modal-body">
            <p>{{ uiMessages.settings.dialogs.pluginInstallConfirmDescription }}</p>

            <div class="plugin-install-path-card">
              <span>{{ uiMessages.settings.dialogs.pluginInstallConfirmPathLabel }}</span>
              <code>{{ trimmedInstallPath }}</code>
            </div>
          </div>

          <footer class="plugin-install-modal-actions">
            <button
              class="plugin-install-modal-button plugin-install-modal-button-ghost"
              type="button"
              :disabled="isInstalling"
              @click="close"
            >
              {{ uiMessages.settings.actions.cancelInstallPlugin }}
            </button>
            <button
              class="plugin-install-modal-button plugin-install-modal-button-primary"
              type="button"
              :disabled="!canConfirm"
              @click="confirmInstall"
            >
              {{
                isInstalling
                  ? uiMessages.settings.actions.installingPlugin
                  : uiMessages.settings.actions.confirmInstallPlugin
              }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.plugin-install-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--ui-overlay-bg);
}

.plugin-install-modal {
  width: min(440px, 100%);
  overflow: hidden;
  border: var(--ui-border-strong);
  border-radius: var(--ui-card-radius);
  background: var(--ui-panel-bg);
  box-shadow: var(--ui-floating-shadow);
}

.plugin-install-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: var(--ui-divider);
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
}

.plugin-install-modal-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0;
}

.plugin-install-modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--ui-primary-text);
  cursor: pointer;
  opacity: 0.82;
  transition: opacity 0.18s ease;
}

.plugin-install-modal-close:hover:not(:disabled) {
  opacity: 1;
}

.plugin-install-modal-close:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.plugin-install-modal-close svg {
  width: 16px;
  height: 16px;
}

.plugin-install-modal-body {
  display: grid;
  gap: 14px;
  padding: 18px 16px;
}

.plugin-install-modal-body p {
  margin: 0;
  color: var(--gray);
  font-size: 13px;
  line-height: 1.7;
}

.plugin-install-path-card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-control-radius);
  background: var(--ui-surface-muted);
}

.plugin-install-path-card span {
  color: var(--gray-light);
  font-size: 12px;
  font-weight: 700;
}

.plugin-install-path-card code {
  display: block;
  color: var(--black);
  font-family: var(--ui-mono-font, Consolas, monospace);
  font-size: 12px;
  line-height: 1.6;
  word-break: break-all;
}

.plugin-install-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px 16px;
  border-top: var(--ui-divider);
}

.plugin-install-modal-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

.plugin-install-modal-button-primary {
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
  box-shadow: var(--ui-primary-shadow);
}

.plugin-install-modal-button-primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.plugin-install-modal-button-ghost {
  background: transparent;
  color: var(--gray);
  box-shadow: inset 0 0 0 1px var(--ui-border-subtle);
}

.plugin-install-modal-button-ghost:hover:not(:disabled) {
  background: var(--ui-hover-bg);
  color: var(--black);
}

.plugin-install-modal-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  transform: none;
}

.plugin-install-modal-fade-enter-active,
.plugin-install-modal-fade-leave-active {
  transition: opacity 0.18s ease;
}

.plugin-install-modal-fade-enter-from,
.plugin-install-modal-fade-leave-to {
  opacity: 0;
}

@media (max-width: 520px) {
  .plugin-install-modal-actions {
    flex-direction: column-reverse;
  }

  .plugin-install-modal-button {
    width: 100%;
  }
}
</style>
