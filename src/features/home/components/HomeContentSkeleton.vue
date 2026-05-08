<script setup lang="ts">
defineProps<{
  title: string
  description: string
  cardCount: number
}>()
</script>

<template>
  <section class="content-skeleton">
    <header class="content-skeleton-header">
      <h2 class="content-skeleton-title">{{ title }}</h2>
      <p class="content-skeleton-description">{{ description }}</p>
    </header>

    <div class="content-skeleton-grid">
      <div v-for="i in cardCount" :key="i" class="content-skeleton-card">
        <div class="skeleton-cover" aria-hidden="true"></div>
        <div class="skeleton-text">
          <span class="skeleton-line skeleton-line-title"></span>
          <span class="skeleton-line skeleton-line-sub"></span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.content-skeleton {
  height: 100%;
  overflow-y: auto;
  padding: 32px 28px;
  background: var(--ui-panel-bg);
}

.content-skeleton-header {
  margin-bottom: 28px;
}

.content-skeleton-title {
  margin: 0 0 8px;
  font-size: 26px;
  font-weight: 800;
  color: var(--black);
  line-height: 1.2;
}

.content-skeleton-description {
  margin: 0;
  font-size: 14px;
  color: var(--gray);
  line-height: 1.5;
}

.content-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 18px;
}

.content-skeleton-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skeleton-cover {
  aspect-ratio: 1;
  border-radius: var(--ui-radius-md);
  background: linear-gradient(135deg, var(--surface-muted) 0%, rgba(0, 0, 0, 0.04) 100%);
  animation: skeleton-pulse 1.8s ease-in-out infinite;
}

.skeleton-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: var(--surface-muted);
  animation: skeleton-pulse 1.8s ease-in-out infinite;
}

.skeleton-line-title {
  width: 70%;
}

.skeleton-line-sub {
  width: 45%;
  height: 10px;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.4;
  }
}

@media (max-width: 600px) {
  .content-skeleton {
    padding: 20px 16px;
  }

  .content-skeleton-title {
    font-size: 22px;
  }

  .content-skeleton-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 14px;
  }
}
</style>
