import { ref } from 'vue'

import type { LocalLibraryScanStatus, LocalLibraryState } from '@/types/localLibrary'
import { createUnsupportedLocalLibraryState } from '@/types/localLibrary'

export function useLocalLibraryStateModel() {
  const state = ref<LocalLibraryState>(createUnsupportedLocalLibraryState())
  const status = ref<LocalLibraryScanStatus>(state.value.status)

  function applyState(nextState: LocalLibraryState): void {
    state.value = nextState
    status.value = nextState.status
  }

  function applyStatus(nextStatus: LocalLibraryScanStatus): void {
    status.value = nextStatus
    state.value = {
      ...state.value,
      status: nextStatus
    }
  }

  return {
    applyState,
    applyStatus,
    state,
    status
  }
}
