<script setup lang="ts">
const props = defineProps<{
  isCompact: boolean
  isLoading: boolean
  trackCount: number
}>()
</script>

<template>
  <footer v-if="props.isCompact" class="compact-player">
    <slot name="compact-player" />
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
  flex-shrink: 0;
  background: var(--white);
  border-top: 3px solid var(--black);
  padding: 0;
  height: 80px;
  overflow: hidden;
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
