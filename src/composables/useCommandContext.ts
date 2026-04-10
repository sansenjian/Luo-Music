import { watchEffect } from 'vue'
import { CONTEXT_KEYS } from '../core/context/contextKeys'
import { services } from '../services'
import type { ContextKeyService } from '../services/contextKeyService'
import type { PlatformService } from '../services/platformService'
import { usePlayerStore } from '../store/playerStore'

export type CommandContextDeps = {
  contextService?: Pick<ContextKeyService, 'setContext'>
  platformService?: Pick<PlatformService, 'isElectron'>
  playerStore?: ReturnType<typeof usePlayerStore>
}

export function useCommandContext(deps: CommandContextDeps = {}): void {
  const contextService = deps.contextService ?? services.context()
  const platformService = deps.platformService ?? services.platform()
  const playerStore = deps.playerStore ?? usePlayerStore()

  watchEffect(() => {
    contextService.setContext(CONTEXT_KEYS.PLATFORM_IS_ELECTRON, platformService.isElectron())
    contextService.setContext(
      CONTEXT_KEYS.PLAYER_HAS_CURRENT_SONG,
      playerStore.currentSongInfo !== null
    )
    contextService.setContext(CONTEXT_KEYS.PLAYER_HAS_PLAYLIST, playerStore.songList.length > 0)
    contextService.setContext(
      CONTEXT_KEYS.PLAYER_CAN_SEEK,
      playerStore.currentSongInfo !== null && playerStore.duration > 0
    )
  })
}
