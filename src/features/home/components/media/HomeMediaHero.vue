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
  border: var(--ui-border-strong);
  border-radius: var(--ui-card-radius);
  --media-cover-bg: linear-gradient(135deg, #d3dae7, #eef2f8);
  --media-cover-fallback-bg:
    radial-gradient(circle at 18% 16%, rgba(255, 255, 255, 0.38), transparent 28%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0)),
    linear-gradient(160deg, #ced8e6, #eef2f8 70%, #ffffff);
  --media-cover-disc-core: #ff8a55;
  --media-cover-disc-shadow: rgba(27, 38, 55, 0.2);
  --media-cover-bar: rgba(255, 255, 255, 0.82);
  background: var(--media-cover-bg);
  box-shadow: var(--ui-shadow);
}

.media-cover-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.media-cover-fallback {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  background: var(--media-cover-fallback-bg);
}

.media-cover-fallback::before {
  content: '';
  position: absolute;
  right: -34px;
  bottom: -30px;
  z-index: 1;
  width: 142px;
  height: 142px;
  border-radius: 999px;
  background:
    repeating-radial-gradient(
      circle,
      transparent 0 8px,
      rgba(17, 24, 39, 0.12) 8px 9px,
      transparent 9px 16px
    ),
    radial-gradient(
      circle,
      var(--media-cover-disc-core) 0 13px,
      rgba(255, 255, 255, 0.94) 13.5px 24px,
      rgba(255, 255, 255, 0.28) 24.5px 28px,
      rgba(255, 255, 255, 0.86) 28.5px 100%
    );
  box-shadow: -18px -18px 42px var(--media-cover-disc-shadow);
}

.media-cover-fallback::after {
  content: '';
  position: absolute;
  left: 26px;
  bottom: 26px;
  z-index: 2;
  width: 12px;
  height: 42px;
  border-radius: 999px;
  background: var(--media-cover-bar);
  box-shadow:
    22px -18px 0 -1px var(--media-cover-bar),
    44px -7px 0 -3px var(--media-cover-bar),
    66px -28px 0 -4px rgba(255, 255, 255, 0.56);
}

.media-cover.collection-cover {
  --media-cover-bg: linear-gradient(135deg, #253248, #131923);
}

.media-cover-fallback.collection-cover-fallback {
  --media-cover-fallback-bg:
    radial-gradient(circle at 18% 16%, rgba(255, 255, 255, 0.24), transparent 30%),
    radial-gradient(circle at 78% 20%, rgba(255, 199, 102, 0.32), transparent 26%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.12), transparent 44%),
    linear-gradient(160deg, #202c3f 0%, #2f7cf6 58%, #19b6d2 100%);
  --media-cover-disc-core: #ffbf57;
  --media-cover-disc-shadow: rgba(8, 18, 32, 0.28);
  --media-cover-bar: rgba(255, 255, 255, 0.82);
}

.media-cover.liked-cover {
  --media-cover-bg: linear-gradient(135deg, #1f8ca3, #5fd1e4);
}

.media-cover-fallback.liked-cover-fallback {
  --media-cover-fallback-bg:
    radial-gradient(circle at 18% 16%, rgba(255, 255, 255, 0.26), transparent 30%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0)),
    linear-gradient(160deg, #0b8097, #5fd1e4 68%, #b9f3ff);
  --media-cover-disc-core: #ff6f8a;
  --media-cover-disc-shadow: rgba(7, 72, 88, 0.24);
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
  letter-spacing: 0;
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
  border: var(--ui-border);
  border-radius: 999px;
  object-fit: cover;
}

.media-meta-avatar.fallback {
  display: grid;
  place-items: center;
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
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
  border: var(--ui-border);
  border-radius: var(--ui-control-radius);
  background: var(--ui-control-bg);
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
  background: var(--ui-primary-bg);
  color: var(--ui-primary-text);
  box-shadow: var(--ui-primary-shadow);
}

.hero-action-primary:hover:not(:disabled) {
  background: var(--ui-primary-hover-bg);
  color: var(--ui-primary-hover-text);
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
