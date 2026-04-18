<script setup lang="ts">
import type {
  LocalMusicEmptyStateModel,
  LocalMusicSummaryCard
} from '@/composables/home/localMusic.types'

defineProps<{
  cards: LocalMusicSummaryCard[]
  emptyState: LocalMusicEmptyStateModel
  hasMore: boolean
  pageLoading: boolean
}>()

defineEmits<{
  'load-more': []
  select: [cardId: string]
}>()
</script>

<template>
  <div v-if="cards.length === 0" class="local-empty-state">
    <div class="empty-icon">{{ emptyState.icon }}</div>
    <h2>{{ emptyState.title }}</h2>
    <p>{{ emptyState.description }}</p>
  </div>

  <template v-else>
    <div class="summary-grid">
      <article v-for="card in cards" :key="card.id" class="summary-card">
        <div
          class="summary-cover"
          :class="{ empty: !card.coverUrl }"
          :style="card.coverUrl ? { backgroundImage: `url(${card.coverUrl})` } : undefined"
        >
          <span v-if="!card.coverUrl">{{ card.fallbackLabel }}</span>
        </div>
        <div class="summary-copy">
          <strong>{{ card.title }}</strong>
          <span v-for="(line, index) in card.lines" :key="`${card.id}-${index}`">{{ line }}</span>
        </div>
        <button type="button" class="summary-action" @click="$emit('select', card.id)">
          {{ card.actionLabel }}
        </button>
      </article>
    </div>

    <div v-if="hasMore" class="load-more-row">
      <button type="button" class="hero-action" :disabled="pageLoading" @click="$emit('load-more')">
        {{ pageLoading ? '加载中...' : '加载更多' }}
      </button>
    </div>
  </template>
</template>
