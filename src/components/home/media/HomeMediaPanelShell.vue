<script setup lang="ts">
import HomeMediaState from '@/components/home/media/HomeMediaState.vue'

const props = withDefaults(
  defineProps<{
    empty?: boolean
    emptyTitle?: string
    emptyDescription?: string
    emptyVariant?: 'plain' | 'card'
  }>(),
  {
    empty: false,
    emptyTitle: '',
    emptyDescription: '',
    emptyVariant: 'plain'
  }
)
</script>

<template>
  <section class="media-panel-shell-root">
    <div v-if="props.empty" class="media-panel-empty">
      <slot name="empty">
        <HomeMediaState
          class="media-panel-empty-state"
          :title="props.emptyTitle"
          :description="props.emptyDescription"
          :variant="props.emptyVariant"
        />
      </slot>
    </div>

    <div v-else class="media-panel-shell">
      <slot name="hero" />

      <section class="media-panel-content">
        <slot name="toolbar" />
        <slot />
      </section>
    </div>
  </section>
</template>

<style scoped>
.media-panel-shell-root {
  height: 100%;
  overflow-y: auto;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.96)), var(--bg);
}

.media-panel-shell {
  min-height: 100%;
  padding: 34px 34px 40px;
}

.media-panel-empty {
  min-height: 100%;
}

.media-panel-content {
  margin-top: 36px;
}

@media (max-width: 960px) {
  .media-panel-shell {
    padding: 24px 20px 32px;
  }
}
</style>
