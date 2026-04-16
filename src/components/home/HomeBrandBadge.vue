<script setup lang="ts">
import { useRenderStyle } from '@/composables/useRenderStyle'

const props = withDefaults(
  defineProps<{
    iconOnly?: boolean
    placement?: 'header' | 'sidebar'
  }>(),
  {
    iconOnly: false,
    placement: 'sidebar'
  }
)

const { renderStyle } = useRenderStyle()
</script>

<template>
  <div class="brand-badge" :class="[`is-${props.placement}`, `is-${renderStyle}`]">
    <div class="brand-mark" aria-hidden="true">LM</div>
    <div v-if="!props.iconOnly" class="brand-copy">
      <p class="brand-kicker">Library</p>
      <h2>LUO Music</h2>
    </div>
  </div>
</template>

<style scoped>
.brand-badge {
  display: flex;
  align-items: center;
  min-width: 0;
}

.brand-mark {
  border-radius: var(--brand-mark-radius);
  display: grid;
  place-items: center;
  background: linear-gradient(
    135deg,
    var(--brand-gradient-start) 0%,
    var(--brand-gradient-end) 100%
  );
  color: #fff;
  font-weight: 800;
  letter-spacing: 0.08em;
  box-shadow: var(--brand-shadow);
  flex-shrink: 0;
}

.brand-copy {
  min-width: 0;
}

.brand-copy h2 {
  margin: 0;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--black);
}

.brand-kicker {
  margin: 0 0 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--brand-kicker-color);
}

.brand-badge.is-sidebar {
  gap: 14px;
}

.brand-badge.is-sidebar .brand-mark {
  width: 44px;
  height: 44px;
  font-size: 13px;
}

.brand-badge.is-sidebar .brand-copy h2 {
  font-size: 20px;
}

.brand-badge.is-header {
  gap: 12px;
}

.brand-badge.is-header .brand-mark {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  font-size: 12px;
}

.brand-badge.is-header .brand-copy h2 {
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: -0.02em;
}

.brand-badge.is-classic .brand-mark {
  box-shadow: none;
  border: 2px solid var(--black);
}

.brand-badge.is-classic .brand-kicker {
  opacity: 0.82;
}

.brand-badge.is-classic.is-sidebar .brand-copy h2 {
  font-size: 18px;
  letter-spacing: -0.04em;
}

.brand-badge.is-classic.is-sidebar {
  gap: 12px;
}

@media (max-width: 900px) {
  .brand-badge.is-header .brand-copy h2 {
    font-size: 14px;
  }
}

@media (max-width: 600px) {
  .brand-badge.is-header .brand-mark {
    width: 34px;
    height: 34px;
  }

  .brand-badge.is-header .brand-copy h2 {
    font-size: 12px;
  }
}
</style>
