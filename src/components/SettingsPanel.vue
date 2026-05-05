<script setup lang="ts">
import { ref } from 'vue'

import { uiMessages } from '@/messages/ui'

import AppSettingsContent from './settings/AppSettingsContent.vue'

const showSettings = ref(false)

function toggleSettings(): void {
  showSettings.value = !showSettings.value
}

function closeSettings(): void {
  showSettings.value = false
}
</script>

<template>
  <div class="settings-wrapper">
    <button
      class="settings-btn"
      type="button"
      :aria-label="uiMessages.settings.dialogButtonLabel"
      :title="uiMessages.settings.dialogButtonLabel"
      @click="toggleSettings"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="3"></circle>
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
        ></path>
      </svg>
    </button>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showSettings" class="settings-overlay" @click.self="closeSettings">
          <div class="settings-panel">
            <div class="settings-header">
              <h2>{{ uiMessages.settings.dialogTitle }}</h2>
              <button
                class="close-btn"
                type="button"
                :aria-label="uiMessages.settings.dialogButtonLabel"
                @click="closeSettings"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div class="settings-content">
              <AppSettingsContent surface="dialog" />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.settings-btn {
  width: 28px;
  height: 28px;
  border: var(--ui-border);
  border-radius: var(--ui-control-radius);
  background: var(--ui-control-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--black);
  transition: all 0.1s;
  flex-shrink: 0;
}

.settings-btn:hover {
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
  box-shadow: var(--ui-primary-shadow);
}

.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--ui-overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-panel {
  background: var(--ui-panel-bg);
  border: var(--ui-border-strong);
  border-radius: var(--ui-card-radius);
  box-shadow: var(--ui-floating-shadow);
  width: 90%;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: var(--ui-divider);
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
}

.settings-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--white);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.close-btn:hover {
  opacity: 1;
}

.settings-content {
  padding: 16px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
