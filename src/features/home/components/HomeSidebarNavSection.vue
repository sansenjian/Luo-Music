<script setup lang="ts">
import HomeSidebarIcon from './HomeSidebarIcon.vue'
import type { HomeSidebarNavItem } from './homeSidebar.types'

defineProps<{
  title: string
  titleId: string
  collapsed: boolean
  items: HomeSidebarNavItem[]
  muted?: boolean
  isActive: (itemId: string) => boolean
}>()

const emit = defineEmits<{
  select: [itemId: string]
}>()
</script>

<template>
  <section
    class="sidebar-section"
    :class="{ 'is-collapsed': collapsed, 'is-expanded': !collapsed }"
    :aria-labelledby="!collapsed ? titleId : undefined"
    :aria-label="collapsed ? title : undefined"
  >
    <p v-if="!collapsed" :id="titleId" class="section-title">{{ title }}</p>
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="sidebar-link"
      data-ui="sidebar-link"
      :class="[
        { active: isActive(item.id) },
        { 'sidebar-link-muted': muted },
        { 'is-collapsed': collapsed, 'is-expanded': !collapsed }
      ]"
      :aria-current="isActive(item.id) ? 'page' : undefined"
      :aria-label="item.label"
      @click="emit('select', item.id)"
    >
      <span class="sidebar-icon" aria-hidden="true"><HomeSidebarIcon :icon="item.icon" /></span>
      <span v-if="!collapsed" class="sidebar-label">{{ item.label }}</span>
    </button>
  </section>
</template>

<style scoped>
.sidebar-section + .sidebar-section {
  margin-top: 22px;
}

.section-title {
  margin: 0 0 10px;
  padding-left: 6px;
  font-size: 14px;
  font-weight: 800;
  color: var(--gray-light);
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--sidebar-link-radius);
  background: transparent;
  color: var(--black);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.sidebar-link:hover {
  background: var(--sidebar-link-hover-bg);
  transform: translateX(2px);
}

.sidebar-link.active {
  background: var(--sidebar-active-bg);
  color: var(--sidebar-active-text, var(--white));
  box-shadow: var(--sidebar-active-shadow);
}

.sidebar-link-muted {
  color: var(--gray);
}

.sidebar-link-muted.active {
  color: var(--sidebar-active-text, var(--white));
}

.sidebar-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.sidebar-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sidebar-label {
  min-width: 0;
  flex: 1;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
}

.sidebar-section.is-collapsed .section-title {
  display: none;
}

.sidebar-link.is-collapsed {
  justify-content: center;
}

.sidebar-link.is-expanded {
  width: 100%;
  height: auto;
  margin: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  padding: 10px 12px;
}

.sidebar-link.is-expanded .sidebar-label {
  min-width: 0;
  white-space: nowrap;
  writing-mode: horizontal-tb;
  word-break: keep-all;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
