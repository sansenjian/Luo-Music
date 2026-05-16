import { computed, ref } from 'vue'

import type { LocalLibraryScanStatus, LocalLibraryState } from '@shared/types/localLibrary'
import { createUnsupportedLocalLibraryState } from '@shared/types/localLibrary'

export function useLocalLibraryStateModel() {
  const state = ref<LocalLibraryState>(createUnsupportedLocalLibraryState())
  const status = computed<LocalLibraryScanStatus>(() => state.value.status)

  function applyState(nextState: LocalLibraryState): void {
    state.value = nextState
  }

  function applyStatus(nextStatus: LocalLibraryScanStatus): void {
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
