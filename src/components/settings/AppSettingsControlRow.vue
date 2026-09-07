<script setup lang="ts">
defineProps<{
  label: string
  forId?: string
}>()
</script>

<template>
  <div class="settings-control-row">
    <div class="settings-control-copy">
      <label v-if="forId" class="settings-control-label" :for="forId">{{ label }}</label>
      <span v-else class="settings-control-label">{{ label }}</span>
      <slot name="meta" />
    </div>
    <div class="settings-control-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.settings-control-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  padding: 12px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
}

.settings-control-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.settings-control-label {
  min-width: 0;
  color: var(--gray, #666);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.35;
  text-transform: uppercase;
}

.settings-control-body {
  min-width: 0;
}

@container settings-section (min-width: 520px) {
  .settings-control-row {
    grid-template-columns: minmax(120px, 176px) minmax(0, 1fr);
    align-items: center;
  }

  .settings-control-copy {
    display: grid;
    justify-content: stretch;
    gap: 4px;
  }
}
</style>
