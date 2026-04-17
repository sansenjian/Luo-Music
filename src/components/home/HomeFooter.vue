<script setup lang="ts">
import type { DockedPlayerBarLayout } from '@/composables/useDockedPlayerBarLayout'

const props = withDefaults(
  defineProps<{
    isPlayerDocked: boolean
    isLoading: boolean
    trackCount: number
    dockedPlayerBarLayout?: DockedPlayerBarLayout
  }>(),
  {
    dockedPlayerBarLayout: 'full'
  }
)
</script>

<template>
  <footer
    v-if="props.isPlayerDocked"
    class="docked-player-bar"
    :class="`layout-${props.dockedPlayerBarLayout}`"
  >
    <div class="docked-player-bar-body">
      <slot name="docked-player" />
    </div>
  </footer>

  <footer v-else class="statusbar">
    <div class="status-left">
      <span>{{ props.trackCount }} Tracks</span>
      <span v-if="props.isLoading" class="status-loading">Loading...</span>
    </div>
    <div>44.1kHz / 320kbps</div>
  </footer>
</template>

<style scoped>
.statusbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  padding-bottom: calc(10px + var(--safe-bottom));
  padding-left: calc(20px + var(--safe-left));
  padding-right: calc(20px + var(--safe-right));
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--gray);
  flex-shrink: 0;
  background: var(--bg);
}

.docked-player-bar {
  display: flex;
  flex-shrink: 0;
  background: var(--bg);
  padding: 0;
  height: 80px;
  overflow: hidden;
}

.docked-player-bar-body {
  flex: 1;
  min-width: 0;
  background: var(--white);
  border-top: 3px solid var(--black);
  overflow: hidden;
}

.docked-player-bar.layout-full .docked-player-bar-body {
  width: 100%;
}

.status-left {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.status-loading {
  color: var(--accent);
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
