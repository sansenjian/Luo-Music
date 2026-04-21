<script setup lang="ts">
const props = defineProps<{
  visual: string
  title: string
  description: string
}>()
</script>

<template>
  <section class="home-empty-state" aria-live="polite">
    <div class="empty-visual" aria-hidden="true">{{ props.visual }}</div>
    <h3 class="empty-title">{{ props.title }}</h3>
    <p class="empty-description">{{ props.description }}</p>
  </section>
</template>

<style scoped>
.home-empty-state {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 32px;
  text-align: center;
  color: var(--gray);
}

.empty-visual {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: color-mix(in srgb, var(--accent) 45%, var(--white));
}

.empty-title {
  max-width: 360px;
  margin: 0;
  color: var(--black);
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
}

.empty-description {
  max-width: 420px;
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}

@media (max-width: 600px) {
  .home-empty-state {
    padding: 36px 20px;
  }

  .empty-title {
    font-size: 18px;
  }

  .empty-description {
    font-size: 13px;
  }
}
</style>
