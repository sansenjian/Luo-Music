import { readonly, ref } from 'vue'

import { services } from '@/services'
import type { StorageService } from '@/services/storageService'

export type DockedPlayerBarLayout = 'full' | 'with-sidebar'

const DOCKED_PLAYER_BAR_LAYOUT_KEY = 'dockedPlayerBarLayout'
const LEGACY_COMPACT_PLAYER_BAR_LAYOUT_KEY = 'compactPlayerFooterLayout'
const DEFAULT_DOCKED_PLAYER_BAR_LAYOUT: DockedPlayerBarLayout = 'full'
const VALID_DOCKED_PLAYER_BAR_LAYOUTS = new Set<DockedPlayerBarLayout>(['full', 'with-sidebar'])

const dockedPlayerBarLayoutState = ref<DockedPlayerBarLayout>(DEFAULT_DOCKED_PLAYER_BAR_LAYOUT)
let isDockedPlayerBarLayoutInitialized = false

function resolveDockedPlayerBarLayout(value: string | null): DockedPlayerBarLayout {
  return value && VALID_DOCKED_PLAYER_BAR_LAYOUTS.has(value as DockedPlayerBarLayout)
    ? (value as DockedPlayerBarLayout)
    : DEFAULT_DOCKED_PLAYER_BAR_LAYOUT
}

export type DockedPlayerBarLayoutDeps = {
  storageService?: Pick<StorageService, 'getItem' | 'setItem'>
}

export function useDockedPlayerBarLayout(deps: DockedPlayerBarLayoutDeps = {}) {
  const storageService = deps.storageService ?? services.storage()

  if (!isDockedPlayerBarLayoutInitialized) {
    const storedLayout =
      storageService.getItem(DOCKED_PLAYER_BAR_LAYOUT_KEY) ??
      storageService.getItem(LEGACY_COMPACT_PLAYER_BAR_LAYOUT_KEY)

    dockedPlayerBarLayoutState.value = resolveDockedPlayerBarLayout(storedLayout)
    isDockedPlayerBarLayoutInitialized = true
  }

  function setDockedPlayerBarLayout(nextLayout: DockedPlayerBarLayout): void {
    dockedPlayerBarLayoutState.value = nextLayout
    storageService.setItem(DOCKED_PLAYER_BAR_LAYOUT_KEY, nextLayout)
  }

  return {
    dockedPlayerBarLayout: readonly(dockedPlayerBarLayoutState),
    setDockedPlayerBarLayout
  }
}

export default useDockedPlayerBarLayout
