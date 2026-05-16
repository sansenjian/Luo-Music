<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <section class="settings-section">
    <div class="settings-section-header">
      <h3>{{ title }}</h3>
    </div>
    <slot />
  </section>
</template>

<style scoped>
.settings-section {
  padding: 14px;
  background: var(--bg-secondary, #f5f5f5);
  border: var(--ui-border);
  border-radius: var(--ui-card-radius);
  box-shadow: var(--ui-shadow);
}

.settings-section > * + * {
  margin-top: 12px;
}

.settings-section-header {
  margin: 0 0 12px;
}

.settings-section h3 {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
</style>
