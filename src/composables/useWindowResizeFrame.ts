import { onBeforeUnmount } from 'vue'

import { INVOKE_CHANNELS, SEND_CHANNELS } from '../../electron/shared/protocol/channels'
import { isElectronRuntime } from '@/utils/runtime'
import {
  computeResizedWindowBounds,
  type ResizeHandleDirection,
  type WindowBounds
} from '@/utils/window/framelessResize'

type WindowState = {
  isMaximized: boolean
  isMinimized: boolean
  isFullScreen: boolean
}

type WindowServicesBridge = {
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
  send(channel: string, ...args: unknown[]): void
  window: {
    getState(): Promise<WindowState>
  }
}

type ResizeSession = {
  direction: ResizeHandleDirection
  initialBounds: WindowBounds
  startScreenX: number
  startScreenY: number
}

const MIN_WINDOW_WIDTH = 400
const MIN_WINDOW_HEIGHT = 80

function getWindowServicesBridge(): WindowServicesBridge | null {
  return typeof window !== 'undefined' && 'services' in window ? window.services : null
}

function getResizeCursor(direction: ResizeHandleDirection): string {
  switch (direction) {
    case 'n':
    case 's':
      return 'ns-resize'
    case 'e':
    case 'w':
      return 'ew-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
    case 'nw':
    case 'se':
      return 'nwse-resize'
  }
}

export function useWindowResizeFrame() {
  let resizeSession: ResizeSession | null = null
  let previousCursor = ''
  let pendingBounds: WindowBounds | null = null
  let resizeRafId: number | null = null

  function flushPendingBounds(): void {
    resizeRafId = null

    if (!pendingBounds) {
      return
    }

    const bridge = getWindowServicesBridge()
    if (!bridge) {
      pendingBounds = null
      return
    }

    bridge.send(SEND_CHANNELS.WINDOW_SET_BOUNDS, pendingBounds)
    pendingBounds = null
  }

  function queueBounds(bounds: WindowBounds): void {
    pendingBounds = bounds

    if (resizeRafId !== null) {
      return
    }

    resizeRafId = window.requestAnimationFrame(() => {
      flushPendingBounds()
    })
  }

  function applyCursor(direction: ResizeHandleDirection): void {
    previousCursor = document.body.style.cursor
    const cursor = getResizeCursor(direction)
    document.body.style.cursor = cursor
    document.documentElement.style.cursor = cursor
  }

  function clearCursor(): void {
    document.body.style.cursor = previousCursor
    document.documentElement.style.cursor = ''
  }

  function detachListeners(): void {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', stopResize)
    window.removeEventListener('pointercancel', stopResize)
    window.removeEventListener('blur', stopResize)
  }

  function attachListeners(): void {
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
    window.addEventListener('blur', stopResize)
  }

  function stopResize(): void {
    if (!resizeSession) {
      return
    }

    detachListeners()

    if (resizeRafId !== null) {
      window.cancelAnimationFrame(resizeRafId)
      resizeRafId = null
    }

    flushPendingBounds()
    resizeSession = null
    clearCursor()
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!resizeSession) {
      return
    }

    const nextBounds = computeResizedWindowBounds({
      direction: resizeSession.direction,
      initialBounds: resizeSession.initialBounds,
      deltaX: event.screenX - resizeSession.startScreenX,
      deltaY: event.screenY - resizeSession.startScreenY,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT
    })

    queueBounds(nextBounds)
    event.preventDefault()
  }

  async function beginResize(direction: ResizeHandleDirection, event: PointerEvent): Promise<void> {
    if (!isElectronRuntime() || event.button !== 0) {
      return
    }

    const bridge = getWindowServicesBridge()
    if (!bridge) {
      return
    }

    event.preventDefault()

    const windowState = await bridge.window.getState()
    if (windowState.isMaximized || windowState.isMinimized || windowState.isFullScreen) {
      return
    }

    const initialBounds = await bridge.invoke<WindowBounds>(INVOKE_CHANNELS.WINDOW_GET_BOUNDS)

    resizeSession = {
      direction,
      initialBounds,
      startScreenX: event.screenX,
      startScreenY: event.screenY
    }

    applyCursor(direction)
    attachListeners()
  }

  onBeforeUnmount(() => {
    stopResize()
  })

  return {
    beginResize
  }
}
