<script setup lang="ts">
import { uiMessages } from '@/messages/ui'

import AppSettingsContent from '@/components/settings/AppSettingsContent.vue'
</script>

<template>
  <section class="workspace-settings-shell" aria-labelledby="workspace-settings-title">
    <header class="workspace-settings-header">
      <div>
        <p class="workspace-settings-eyebrow">{{ uiMessages.settings.workspaceEyebrow }}</p>
        <h2 id="workspace-settings-title">{{ uiMessages.settings.workspaceTitle }}</h2>
      </div>
      <p class="workspace-settings-caption">{{ uiMessages.settings.workspaceCaption }}</p>
    </header>

    <AppSettingsContent surface="workspace" />
  </section>
</template>

<style scoped>
.workspace-settings-shell {
  height: 100%;
  padding: 24px 28px;
  overflow-y: auto;
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.7), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(246, 247, 249, 0.98));
}

.workspace-settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.workspace-settings-eyebrow {
  margin: 0 0 6px;
  color: var(--gray);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.workspace-settings-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: var(--black);
}

.workspace-settings-caption {
  margin: 4px 0 0;
  max-width: 280px;
  color: var(--gray);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  text-align: right;
}

@media (max-width: 960px) {
  .workspace-settings-shell {
    padding: 18px;
  }

  .workspace-settings-header {
    flex-direction: column;
  }

  .workspace-settings-caption {
    max-width: none;
    text-align: left;
  }
}
</style>
