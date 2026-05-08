import { computed } from 'vue'

import {
  useDockedPlayerBarLayout,
  type DockedPlayerBarLayout
} from '@/composables/useDockedPlayerBarLayout'
import { useExperimentalFeatures } from '@/composables/useExperimentalFeatures'
import { useHomeBrandPlacement, type HomeBrandPlacement } from '@/features/home'
import { useProjectUi } from '@/composables/useProjectUi'
import { services } from '@/services'
import { usePlayerStore } from '@/store/playerStore'
import type { WebLyricAppearance } from '@shared/types/player'

export function useAppSettings() {
  const playerStore = usePlayerStore()
  const platformService = services.platform()
  const { brandPlacement, setBrandPlacement } = useHomeBrandPlacement()
  const { dockedPlayerBarLayout, setDockedPlayerBarLayout } = useDockedPlayerBarLayout()
  const {
    experimentalFeatures,
    smtcEnabled,
    setSMTCEnabled,
    waveformEnabled,
    setWaveformEnabled,
    coverSwipeEnabled,
    setCoverSwipeEnabled
  } = useExperimentalFeatures()
  const { renderStyle, setRenderStyle, availableRenderStyleOptions, isRenderStyleActive } =
    useProjectUi()

  const isElectron = computed(() => platformService.isElectron())

  function isBrandPlacementActive(placement: HomeBrandPlacement): boolean {
    return brandPlacement.value === placement
  }

  function isDockedPlayerBarLayoutActive(layout: DockedPlayerBarLayout): boolean {
    return dockedPlayerBarLayout.value === layout
  }

  function setWebLyricAppearance(patch: Partial<WebLyricAppearance>): void {
    playerStore.setWebLyricAppearance(patch)
  }

  function resetWebLyricAppearance(): void {
    playerStore.resetWebLyricAppearance()
  }

  return {
    playerStore,
    isElectron,
    brandPlacement,
    setBrandPlacement,
    dockedPlayerBarLayout,
    setDockedPlayerBarLayout,
    experimentalFeatures,
    smtcEnabled,
    setSMTCEnabled,
    waveformEnabled,
    setWaveformEnabled,
    coverSwipeEnabled,
    setCoverSwipeEnabled,
    webLyricAppearance: computed(() => playerStore.webLyricAppearance),
    setWebLyricAppearance,
    resetWebLyricAppearance,
    renderStyle,
    setRenderStyle,
    availableRenderStyleOptions,
    isBrandPlacementActive,
    isRenderStyleActive,
    isDockedPlayerBarLayoutActive
  }
}
