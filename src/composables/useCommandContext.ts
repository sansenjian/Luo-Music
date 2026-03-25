import { watchEffect } from 'vue'
import { CONTEXT_KEYS } from '../core/context/contextKeys'
import { services } from '../services'
import { usePlayerStore } from '../store/playerStore'

export function useCommandContext(): void {
  const contextService = services.context()
  const platformService = services.platform()
  const playerStore = usePlayerStore()

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
