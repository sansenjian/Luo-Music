<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    kicker: string
    title: string
    coverUrl?: string
    coverAlt?: string
    coverShellClass?: string
    coverFallbackClass?: string
    avatarUrl?: string
    avatarAlt?: string
    avatarFallbackLabel?: string
    metaLabel: string
    countLabel: string
    primaryActionLabel: string
    primaryActionDisabled?: boolean
  }>(),
  {
    coverUrl: '',
    coverAlt: '',
    coverShellClass: '',
    coverFallbackClass: '',
    avatarUrl: '',
    avatarAlt: '',
    avatarFallbackLabel: '我',
    primaryActionDisabled: false
  }
)

const emit = defineEmits<{
  'primary-action': []
}>()
</script>

<template>
  <section class="media-hero">
    <div class="media-cover" :class="props.coverShellClass">
      <img
        v-if="props.coverUrl"
        :src="props.coverUrl"
        :alt="props.coverAlt || props.title"
        class="media-cover-image"
      />
      <div
        v-else
        class="media-cover-image media-cover-fallback"
        :class="props.coverFallbackClass"
      ></div>
      <slot name="cover-overlay" />
    </div>

    <div class="media-summary">
      <p class="media-kicker">{{ props.kicker }}</p>
      <h1>{{ props.title }}</h1>
      <div class="media-meta">
        <img
          v-if="props.avatarUrl"
          :src="props.avatarUrl"
          :alt="props.avatarAlt || '用户头像'"
          class="media-meta-avatar"
        />
        <span v-else class="media-meta-avatar fallback">
          {{ props.avatarFallbackLabel }}
        </span>
        <span class="media-meta-copy">{{ props.metaLabel }}</span>
        <span class="media-meta-count">{{ props.countLabel }}</span>
      </div>

      <div class="media-actions">
        <button
          type="button"
          class="hero-action hero-action-primary"
          :disabled="props.primaryActionDisabled"
          @click="emit('primary-action')"
        >
          {{ props.primaryActionLabel }}
        </button>
        <button type="button" class="hero-action" :disabled="true" title="即将推出">下载</button>
        <button
          type="button"
          class="hero-action hero-action-icon"
          aria-label="更多操作"
          title="即将推出"
          disabled
        >
          ···
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.media-hero {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 28px;
  align-items: end;
}

.media-cover {
  position: relative;
  width: 180px;
  height: 180px;
  overflow: hidden;
  border: 3px solid var(--black);
  border-radius: 20px;
  background: linear-gradient(135deg, #d3dae7, #eef2f8);
  box-shadow: 10px 10px 0 rgba(0, 0, 0, 0.12);
}

.media-cover-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.media-cover-fallback {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0)),
    linear-gradient(160deg, #ced8e6, #eef2f8 70%, #ffffff);
}

.media-summary {
  min-width: 0;
}

.media-kicker {
  margin: 0 0 8px;
  color: var(--gray);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.media-summary h1 {
  margin: 0;
  font-size: clamp(30px, 4vw, 42px);
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.media-meta {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--gray);
  font-size: 13px;
}

.media-meta-avatar {
  width: 28px;
  height: 28px;
  border: 2px solid var(--black);
  border-radius: 999px;
  object-fit: cover;
}

.media-meta-avatar.fallback {
  display: grid;
  place-items: center;
  background: var(--black);
  color: var(--white);
  font-weight: 700;
}

.media-meta-copy {
  color: var(--black);
  font-weight: 700;
}

.media-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 22px;
  flex-wrap: wrap;
}

.hero-action {
  min-height: 42px;
  padding: 10px 18px;
  border: 2px solid var(--black);
  border-radius: 12px;
  background: var(--white);
  color: var(--black);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background 0.18s ease,
    color 0.18s ease;
}

.hero-action:hover:not(:disabled) {
  transform: translateY(-1px);
}

.hero-action:disabled {
  cursor: wait;
  opacity: 0.6;
}

.hero-action-primary {
  background: var(--accent);
  color: var(--white);
}

.hero-action-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.hero-action-icon {
  min-width: 42px;
  padding-inline: 14px;
}

@media (max-width: 960px) {
  .media-hero {
    grid-template-columns: 140px minmax(0, 1fr);
    gap: 20px;
  }

  .media-cover {
    width: 140px;
    height: 140px;
  }
}

@media (max-width: 760px) {
  .media-hero {
    grid-template-columns: 1fr;
  }

  .media-cover {
    width: 180px;
    height: 180px;
  }
}
</style>
