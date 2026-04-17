import { readonly, ref } from 'vue'

import { services } from '@/services'
import type { StorageService } from '@/services/storageService'

export type CompactPlayerFooterLayout = 'full' | 'with-sidebar'

const COMPACT_PLAYER_FOOTER_LAYOUT_KEY = 'compactPlayerFooterLayout'
const DEFAULT_COMPACT_PLAYER_FOOTER_LAYOUT: CompactPlayerFooterLayout = 'full'
const VALID_COMPACT_PLAYER_FOOTER_LAYOUTS = new Set<CompactPlayerFooterLayout>([
  'full',
  'with-sidebar'
])

const compactPlayerFooterLayoutState = ref<CompactPlayerFooterLayout>(
  DEFAULT_COMPACT_PLAYER_FOOTER_LAYOUT
)
let isCompactPlayerFooterLayoutInitialized = false

function resolveCompactPlayerFooterLayout(value: string | null): CompactPlayerFooterLayout {
  return value && VALID_COMPACT_PLAYER_FOOTER_LAYOUTS.has(value as CompactPlayerFooterLayout)
    ? (value as CompactPlayerFooterLayout)
    : DEFAULT_COMPACT_PLAYER_FOOTER_LAYOUT
}

export type CompactPlayerFooterLayoutDeps = {
  storageService?: Pick<StorageService, 'getItem' | 'setItem'>
}

export function useCompactPlayerFooterLayout(deps: CompactPlayerFooterLayoutDeps = {}) {
  const storageService = deps.storageService ?? services.storage()

  if (!isCompactPlayerFooterLayoutInitialized) {
    compactPlayerFooterLayoutState.value = resolveCompactPlayerFooterLayout(
      storageService.getItem(COMPACT_PLAYER_FOOTER_LAYOUT_KEY)
    )
    isCompactPlayerFooterLayoutInitialized = true
  }

  function setCompactPlayerFooterLayout(nextLayout: CompactPlayerFooterLayout): void {
    compactPlayerFooterLayoutState.value = nextLayout
    storageService.setItem(COMPACT_PLAYER_FOOTER_LAYOUT_KEY, nextLayout)
  }

  return {
    compactPlayerFooterLayout: readonly(compactPlayerFooterLayoutState),
    setCompactPlayerFooterLayout
  }
}

export default useCompactPlayerFooterLayout
