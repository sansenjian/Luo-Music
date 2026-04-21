<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: 'plain' | 'card'
    tone?: 'default' | 'error'
    title?: string
    description: string
    actionLabel?: string
  }>(),
  {
    variant: 'plain',
    tone: 'default',
    title: '',
    actionLabel: ''
  }
)

const emit = defineEmits<{
  action: []
}>()
</script>

<template>
  <div class="media-state" :class="[`variant-${props.variant}`, `tone-${props.tone}`]">
    <div v-if="$slots.icon" class="media-state-icon">
      <slot name="icon" />
    </div>
    <h2 v-if="props.title" class="media-state-title">{{ props.title }}</h2>
    <p class="media-state-description">{{ props.description }}</p>
    <button
      v-if="props.actionLabel"
      type="button"
      class="media-state-action"
      @click="emit('action')"
    >
      {{ props.actionLabel }}
    </button>
  </div>
</template>

<style scoped>
.media-state {
  text-align: center;
  color: var(--gray);
}

.variant-plain {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 64px 24px;
}

.variant-card {
  min-height: 180px;
  display: grid;
  place-items: center;
  gap: 14px;
  padding: 32px 24px;
  border: 2px dashed rgba(17, 24, 39, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
}

.tone-error {
  color: #b42318;
}

.media-state-icon {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  margin: 0 auto 12px;
  border-radius: 18px;
  background: rgba(17, 24, 39, 0.08);
  color: var(--black);
}

.media-state-icon :deep(svg) {
  width: 34px;
  height: 34px;
  display: block;
  fill: currentColor;
}

.media-state-title {
  margin: 0 0 8px;
  color: var(--black);
  font-size: 26px;
}

.media-state-description {
  margin: 0;
  font-size: 14px;
}

.media-state-action {
  min-height: 42px;
  padding: 10px 18px;
  border: 2px solid var(--black);
  border-radius: 12px;
  background: var(--white);
  color: var(--black);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
</style>
