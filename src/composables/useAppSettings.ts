import { computed } from 'vue'

import {
  useDockedPlayerBarLayout,
  type DockedPlayerBarLayout
} from '@/composables/useDockedPlayerBarLayout'
import { useHomeBrandPlacement, type HomeBrandPlacement } from '@/composables/useHomeBrandPlacement'
import { useRenderStyle, type RenderStyle } from '@/composables/useRenderStyle'
import { services } from '@/services'
import { usePlayerStore } from '@/store/playerStore'

export function useAppSettings() {
  const playerStore = usePlayerStore()
  const platformService = services.platform()
  const { brandPlacement, setBrandPlacement } = useHomeBrandPlacement()
  const { dockedPlayerBarLayout, setDockedPlayerBarLayout } = useDockedPlayerBarLayout()
  const { renderStyle, setRenderStyle } = useRenderStyle()

  const isElectron = computed(() => platformService.isElectron())

  function isBrandPlacementActive(placement: HomeBrandPlacement): boolean {
    return brandPlacement.value === placement
  }

  function isRenderStyleActive(style: RenderStyle): boolean {
    return renderStyle.value === style
  }

  function isDockedPlayerBarLayoutActive(layout: DockedPlayerBarLayout): boolean {
    return dockedPlayerBarLayout.value === layout
  }

  return {
    playerStore,
    isElectron,
    brandPlacement,
    setBrandPlacement,
    dockedPlayerBarLayout,
    setDockedPlayerBarLayout,
    renderStyle,
    setRenderStyle,
    isBrandPlacementActive,
    isRenderStyleActive,
    isDockedPlayerBarLayoutActive
  }
}
