<script setup lang="ts">
import PluginManagerSection from '../settings/PluginManagerSection.vue'
</script>

<template>
  <section class="workspace-plugins-shell" aria-labelledby="workspace-plugins-title">
    <header class="workspace-plugins-header">
      <div>
        <p class="workspace-plugins-eyebrow">扩展</p>
        <h2 id="workspace-plugins-title">插件管理</h2>
      </div>
      <p class="workspace-plugins-caption">安装和管理音乐源插件，扩展平台能力</p>
    </header>

    <PluginManagerSection />
  </section>
</template>

<style scoped>
.workspace-plugins-shell {
  height: 100%;
  padding: 24px 28px;
  overflow-y: auto;
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.7), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(246, 247, 249, 0.98));
}

.workspace-plugins-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.workspace-plugins-eyebrow {
  margin: 0 0 6px;
  color: var(--gray);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.workspace-plugins-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: var(--black);
}

.workspace-plugins-caption {
  margin: 4px 0 0;
  max-width: 280px;
  color: var(--gray);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  text-align: right;
}

@media (max-width: 960px) {
  .workspace-plugins-shell {
    padding: 18px;
  }

  .workspace-plugins-header {
    flex-direction: column;
  }

  .workspace-plugins-caption {
    max-width: none;
    text-align: left;
  }
}
</style>
