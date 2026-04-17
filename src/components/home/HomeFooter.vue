<script setup lang="ts">
import type { CompactPlayerFooterLayout } from '@/composables/useCompactPlayerFooterLayout'

const props = withDefaults(
  defineProps<{
    isCompact: boolean
    isLoading: boolean
    trackCount: number
    compactPlayerFooterLayout?: CompactPlayerFooterLayout
  }>(),
  {
    compactPlayerFooterLayout: 'full'
  }
)
</script>

<template>
  <footer
    v-if="props.isCompact"
    class="compact-player"
    :class="`layout-${props.compactPlayerFooterLayout}`"
  >
    <div v-if="props.compactPlayerFooterLayout === 'with-sidebar'" class="compact-sidebar-fill">
      <slot name="compact-sidebar-fill" />
    </div>
    <div class="compact-player-body">
      <slot name="compact-player" />
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

.compact-player {
  display: flex;
  flex-shrink: 0;
  background: var(--bg);
  padding: 0;
  height: 80px;
  overflow: hidden;
}

.compact-player-body {
  flex: 1;
  min-width: 0;
  background: var(--white);
  border-top: 3px solid var(--black);
  overflow: hidden;
}

.compact-player.layout-full .compact-player-body {
  width: 100%;
}

.compact-sidebar-fill {
  display: flex;
  align-items: stretch;
  flex: 0 0 var(--home-sidebar-width, 236px);
  width: var(--home-sidebar-width, 236px);
  min-width: var(--home-sidebar-width, 236px);
  border-top: 3px solid var(--black);
  border-right: 3px solid var(--black);
  background:
    radial-gradient(circle at top left, var(--sidebar-shell-glow), transparent 28%),
    var(--sidebar-shell-bg);
}

.compact-sidebar-fill :deep(.sidebar-login-panel) {
  padding-bottom: calc(12px + var(--safe-bottom));
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
