<script setup lang="ts">
import type { SidebarIconName } from './homeSidebar.types'

defineProps<{
  icon: SidebarIconName
}>()
</script>

<template>
  <svg
    v-if="icon === 'home'"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path d="M4 11.8 12 5l8 6.8V20a1 1 0 0 1-1 1h-4.8v-5.2H9.8V21H5a1 1 0 0 1-1-1z" />
  </svg>
  <svg
    v-else-if="icon === 'discover'"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5A8.5 8.5 0 0 0 12 3.5Zm2.9 5.6-1.8 5-5 1.8 1.8-5 5-1.8Z"
    />
  </svg>
  <svg
    v-else-if="icon === 'roaming'"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path d="M3.8 15.8c2.1-2.5 4.7-3.8 7.8-3.8s5.7 1.3 7.8 3.8" />
    <path d="M7 10.4a5.2 5.2 0 0 1 10 0" />
    <circle cx="12" cy="17.2" r="1.1" />
  </svg>
  <svg
    v-else-if="icon === 'liked'"
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="none"
    aria-hidden="true"
  >
    <path d="M12 20.2 5 13.6a4.4 4.4 0 0 1 6.2-6.2L12 8.2l.8-.8a4.4 4.4 0 0 1 6.2 6.2Z" />
  </svg>
  <svg
    v-else-if="icon === 'history'"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path d="M12 4.2a7.8 7.8 0 1 1-6.7 3.8" />
    <path d="M5.3 4.8v4.4h4.4" />
    <path d="M12 8.2v4.2l2.8 1.8" />
  </svg>
  <svg
    v-else-if="icon === 'songs'"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path d="M15.5 5.2v8.4a2.7 2.7 0 1 1-1.4-2.4V6.4l6-1.2v7.2a2.7 2.7 0 1 1-1.4-2.4V4Z" />
  </svg>
  <svg
    v-else-if="icon === 'favorites'"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      d="M4.6 6.4h4l1.3 1.8h9.5a1 1 0 0 1 1 1V18a1.5 1.5 0 0 1-1.5 1.5H5.1A1.5 1.5 0 0 1 3.6 18V7.4a1 1 0 0 1 1-1Z"
    />
  </svg>
  <svg
    v-else-if="icon === 'artists'"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      d="M8.1 11.2a2.5 2.5 0 1 0-2.5-2.5 2.5 2.5 0 0 0 2.5 2.5Zm7.8 0a2.5 2.5 0 1 0-2.5-2.5 2.5 2.5 0 0 0 2.5 2.5Z"
    />
    <path d="M3.9 18.8a4.2 4.2 0 0 1 8.4 0" />
    <path d="M11.7 18.8a4.2 4.2 0 0 1 8.4 0" />
  </svg>
  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
    <path
      d="M5.2 6.2h13.6a1.2 1.2 0 0 1 1.2 1.2v9.2a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 16.6V7.4a1.2 1.2 0 0 1 1.2-1.2Z"
    />
    <path d="M8 18.8h8" />
    <path d="M8.6 11.6h6.8" />
  </svg>
</template>
