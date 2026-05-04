import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue'

type WindowChromeState = {
  isMaximized: boolean
  isMinimized: boolean
  isFullScreen: boolean
}

type WindowChromeBridge = {
  getState(): Promise<WindowChromeState>
}

type WindowServicesBridge = {
  window?: WindowChromeBridge
}

type MaybeRefBoolean = boolean | Ref<boolean> | ComputedRef<boolean>

function getWindowBridge(): WindowChromeBridge | null {
  if (typeof window === 'undefined') {
    return null
  }

  return ((window as Window & { services?: WindowServicesBridge }).services?.window ??
    null) as WindowChromeBridge | null
}

function readBoolean(value: MaybeRefBoolean): boolean {
  return typeof value === 'boolean' ? value : value.value
}

export function useWindowChromeState(isElectron: MaybeRefBoolean) {
  const isMaximized = ref(false)
  const isFullScreen = ref(false)
  let disposed = false
  let refreshFrameId: number | null = null

  async function refreshWindowState(): Promise<void> {
    const bridge = getWindowBridge()
    if (!readBoolean(isElectron) || !bridge) {
      return
    }

    try {
      const state = await bridge.getState()
      if (disposed) {
        return
      }

      isMaximized.value = state.isMaximized
      isFullScreen.value = state.isFullScreen
    } catch (error) {
      console.warn('[useWindowChromeState] Failed to read window state', error)
    }
  }

  function scheduleRefresh(): void {
    if (!readBoolean(isElectron) || refreshFrameId !== null) {
      return
    }

    refreshFrameId = window.requestAnimationFrame(() => {
      refreshFrameId = null
      void refreshWindowState()
    })
  }

  onMounted(() => {
    if (!readBoolean(isElectron)) {
      return
    }

    void refreshWindowState()
    window.addEventListener('resize', scheduleRefresh)
  })

  onBeforeUnmount(() => {
    disposed = true
    window.removeEventListener('resize', scheduleRefresh)

    if (refreshFrameId !== null) {
      window.cancelAnimationFrame(refreshFrameId)
      refreshFrameId = null
    }
  })

  return {
    isWindowMaximized: computed(() => isMaximized.value),
    isWindowFullScreen: computed(() => isFullScreen.value),
    isWindowRounded: computed(
      () => readBoolean(isElectron) && !isMaximized.value && !isFullScreen.value
    ),
    refreshWindowState
  }
}
