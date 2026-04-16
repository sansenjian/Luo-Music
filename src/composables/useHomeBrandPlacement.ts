import { readonly, ref } from 'vue'

import { services } from '@/services'
import type { StorageService } from '@/services/storageService'

export type HomeBrandPlacement = 'header' | 'sidebar'

const HOME_BRAND_PLACEMENT_KEY = 'homeBrandPlacement'
const DEFAULT_HOME_BRAND_PLACEMENT: HomeBrandPlacement = 'sidebar'
const VALID_HOME_BRAND_PLACEMENTS = new Set<HomeBrandPlacement>(['header', 'sidebar'])

const brandPlacementState = ref<HomeBrandPlacement>(DEFAULT_HOME_BRAND_PLACEMENT)
let isBrandPlacementInitialized = false

function resolveHomeBrandPlacement(value: string | null): HomeBrandPlacement {
  return value && VALID_HOME_BRAND_PLACEMENTS.has(value as HomeBrandPlacement)
    ? (value as HomeBrandPlacement)
    : DEFAULT_HOME_BRAND_PLACEMENT
}

export type HomeBrandPlacementDeps = {
  storageService?: Pick<StorageService, 'getItem' | 'setItem'>
}

export function useHomeBrandPlacement(deps: HomeBrandPlacementDeps = {}) {
  const storageService = deps.storageService ?? services.storage()

  if (!isBrandPlacementInitialized) {
    brandPlacementState.value = resolveHomeBrandPlacement(
      storageService.getItem(HOME_BRAND_PLACEMENT_KEY)
    )
    isBrandPlacementInitialized = true
  }

  function setBrandPlacement(nextPlacement: HomeBrandPlacement): void {
    brandPlacementState.value = nextPlacement
    storageService.setItem(HOME_BRAND_PLACEMENT_KEY, nextPlacement)
  }

  return {
    brandPlacement: readonly(brandPlacementState),
    setBrandPlacement
  }
}
