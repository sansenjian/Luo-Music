<script setup lang="ts">
import { useWindowResizeFrame } from '@/composables/useWindowResizeFrame'
import type { ResizeHandleDirection } from '@/utils/window/framelessResize'

type ResizeHandle = {
  direction: ResizeHandleDirection
  className: string
}

const RESIZE_HANDLES: ResizeHandle[] = [
  { direction: 'n', className: 'handle-n' },
  { direction: 's', className: 'handle-s' },
  { direction: 'e', className: 'handle-e' },
  { direction: 'w', className: 'handle-w' },
  { direction: 'ne', className: 'handle-ne' },
  { direction: 'nw', className: 'handle-nw' },
  { direction: 'se', className: 'handle-se' },
  { direction: 'sw', className: 'handle-sw' }
]

const { beginResize } = useWindowResizeFrame()

function handlePointerDown(direction: ResizeHandleDirection, event: PointerEvent): void {
  void beginResize(direction, event)
}
</script>

<template>
  <div class="window-resize-frame" aria-hidden="true">
    <div
      v-for="handle in RESIZE_HANDLES"
      :key="handle.direction"
      class="resize-handle"
      :class="handle.className"
      @pointerdown="handlePointerDown(handle.direction, $event)"
    ></div>
  </div>
</template>

<style scoped>
.window-resize-frame {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2500;
}

.resize-handle {
  position: absolute;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.handle-n,
.handle-s {
  left: 10px;
  right: 10px;
  height: 8px;
}

.handle-n {
  top: 0;
  cursor: ns-resize;
}

.handle-s {
  bottom: 0;
  cursor: ns-resize;
}

.handle-e,
.handle-w {
  top: 10px;
  bottom: 10px;
  width: 8px;
}

.handle-e {
  right: 0;
  cursor: ew-resize;
}

.handle-w {
  left: 0;
  cursor: ew-resize;
}

.handle-ne,
.handle-nw,
.handle-se,
.handle-sw {
  width: 14px;
  height: 14px;
}

.handle-ne {
  top: 0;
  right: 0;
  cursor: nesw-resize;
}

.handle-nw {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}

.handle-se {
  right: 0;
  bottom: 0;
  cursor: nwse-resize;
}

.handle-sw {
  left: 0;
  bottom: 0;
  cursor: nesw-resize;
}
</style>
