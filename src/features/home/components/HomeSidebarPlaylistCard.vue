<script setup lang="ts">
import type { HomeSidebarCollectionSelection, HomeSidebarCollectionTone } from './homeSidebar.types'

defineProps<{
  item: HomeSidebarCollectionSelection
  index: number
  collapsed: boolean
  active: boolean
  tone: HomeSidebarCollectionTone
  coverLabel: string
}>()

const emit = defineEmits<{
  select: [item: HomeSidebarCollectionSelection]
  'open-context-menu': [event: MouseEvent, item: HomeSidebarCollectionSelection]
}>()

function resolveCollectionImageLoading(index: number): 'eager' | 'lazy' {
  return index === 0 ? 'eager' : 'lazy'
}

function resolveCollectionImageFetchPriority(index: number): 'high' | 'auto' {
  return index === 0 ? 'high' : 'auto'
}

function resolveCollectionImageDecoding(index: number): 'sync' | 'async' {
  return index === 0 ? 'sync' : 'async'
}
</script>

<template>
  <button
    type="button"
    class="playlist-card"
    data-ui="playlist-card"
    :class="{ active, 'is-collapsed': collapsed, 'is-expanded': !collapsed }"
    :aria-label="item.name"
    @click="emit('select', item)"
    @contextmenu="emit('open-context-menu', $event, item)"
  >
    <span class="playlist-cover" :class="`tone-${tone}`" aria-hidden="true">
      <img
        v-if="item.coverUrl"
        :src="item.coverUrl"
        :alt="item.name"
        class="playlist-cover-image"
        width="54"
        height="54"
        :loading="resolveCollectionImageLoading(index)"
        :fetchpriority="resolveCollectionImageFetchPriority(index)"
        :decoding="resolveCollectionImageDecoding(index)"
      />
      <template v-else>
        <span class="playlist-cover-glow"></span>
        <span class="playlist-cover-disc"></span>
        <span class="playlist-cover-bars">
          <span></span>
          <span></span>
          <span></span>
        </span>
        <span class="playlist-cover-label">{{ coverLabel }}</span>
      </template>
    </span>
    <span v-if="!collapsed" class="playlist-copy">
      <strong>{{ item.name }}</strong>
      <span>{{ item.summary }}</span>
    </span>
  </button>
</template>

<style scoped>
.playlist-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 6px 4px;
  border: 0;
  border-radius: calc(var(--sidebar-link-radius) + 4px);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.18s ease,
    transform 0.18s ease;
}

.playlist-card:hover {
  background: var(--sidebar-link-hover-bg);
  transform: translateX(2px);
}

.playlist-card.active {
  background: color-mix(in srgb, var(--sidebar-link-hover-bg) 70%, transparent);
}

.playlist-cover {
  position: relative;
  width: 54px;
  height: 54px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: var(--white);
  background: var(--playlist-cover-bg);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.16),
    inset 0 -16px 28px rgba(0, 0, 0, 0.18);
}

.playlist-cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.playlist-cover-glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 18% 16%, rgba(255, 255, 255, 0.34), transparent 28%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.14), transparent 44%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(0, 0, 0, 0.2));
}

.playlist-cover-disc {
  position: absolute;
  right: -9px;
  bottom: -7px;
  width: 43px;
  height: 43px;
  border-radius: 999px;
  background:
    repeating-radial-gradient(
      circle,
      transparent 0 4px,
      rgba(0, 0, 0, 0.1) 4px 5px,
      transparent 5px 9px
    ),
    radial-gradient(
      circle,
      var(--playlist-cover-accent) 0 4px,
      rgba(255, 255, 255, 0.92) 4.5px 7px,
      rgba(255, 255, 255, 0.24) 7.5px 9px,
      rgba(255, 255, 255, 0.82) 9.5px 100%
    );
  box-shadow: -8px -8px 18px rgba(0, 0, 0, 0.16);
}

.playlist-cover-disc::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: inherit;
}

.playlist-cover-bars {
  position: absolute;
  left: 11px;
  bottom: 10px;
  display: flex;
  align-items: end;
  gap: 3px;
}

.playlist-cover-bars span {
  width: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.16);
}

.playlist-cover-bars span:nth-child(1) {
  height: 12px;
}

.playlist-cover-bars span:nth-child(2) {
  height: 18px;
}

.playlist-cover-bars span:nth-child(3) {
  height: 9px;
}

.playlist-cover-label {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 2;
  min-width: 21px;
  height: 21px;
  padding: 0 5px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.16);
  box-shadow: 0 8px 14px rgba(0, 0, 0, 0.14);
  backdrop-filter: blur(8px);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0;
}

.tone-mono {
  --playlist-cover-bg: linear-gradient(135deg, #323946 0%, #11161f 100%);
  --playlist-cover-accent: #ffbf57;
}

.tone-violet {
  --playlist-cover-bg: linear-gradient(135deg, #7f5cf4 0%, #d9507f 100%);
  --playlist-cover-accent: #ffdf6e;
}

.tone-mist {
  --playlist-cover-bg: linear-gradient(135deg, #5d7189 0%, #28a89c 100%);
  --playlist-cover-accent: #ffd166;
}

.tone-ocean {
  --playlist-cover-bg: linear-gradient(135deg, #2f7cf6 0%, #19b6d2 100%);
  --playlist-cover-accent: #ff8f5a;
}

.playlist-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.playlist-copy strong,
.playlist-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-copy strong {
  font-size: 14px;
  font-weight: 800;
  color: var(--black);
}

.playlist-copy span {
  font-size: 12px;
  color: var(--gray);
}

.playlist-card.is-collapsed .playlist-copy {
  display: none;
}

.playlist-card.is-collapsed {
  justify-content: center;
}

.playlist-card.is-expanded {
  width: 100%;
  height: auto;
  margin: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  padding: 6px 4px;
}

.playlist-card.is-expanded .playlist-copy {
  min-width: 0;
  white-space: nowrap;
  writing-mode: horizontal-tb;
  word-break: keep-all;
}
</style>
