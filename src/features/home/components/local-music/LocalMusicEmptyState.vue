<script setup lang="ts">
import type { LocalMusicEmptyStateModel } from '@/features/home/composables/localMusic.types'

defineProps<{
  model: LocalMusicEmptyStateModel
}>()
</script>

<template>
  <div class="local-empty-state">
    <div class="empty-icon">{{ model.icon }}</div>
    <h2>{{ model.title }}</h2>
    <p>{{ model.description }}</p>
    <slot />
  </div>
</template>
