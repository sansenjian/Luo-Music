import type { LocalLibraryState } from '@/types/localLibrary'

import type {
  LocalLibraryMutationRunner,
  LocalLibraryPlatformService,
  LocalLibraryStateUpdateHandler
} from './types'

export function useLocalLibraryCommands(
  platformService: LocalLibraryPlatformService,
  applyState: LocalLibraryStateUpdateHandler,
  runMutation: LocalLibraryMutationRunner
) {
  async function addFolder(): Promise<LocalLibraryState | null> {
    const folderPath = await platformService.pickLocalLibraryFolder()
    if (!folderPath) {
      return null
    }

    const nextState = await runMutation(() => platformService.addLocalLibraryFolder(folderPath))
    applyState(nextState)
    return nextState
  }

  async function removeFolder(folderId: string): Promise<LocalLibraryState> {
    const nextState = await runMutation(() => platformService.removeLocalLibraryFolder(folderId))
    applyState(nextState)
    return nextState
  }

  async function setFolderEnabled(folderId: string, enabled: boolean): Promise<LocalLibraryState> {
    const nextState = await runMutation(() =>
      platformService.setLocalLibraryFolderEnabled(folderId, enabled)
    )
    applyState(nextState)
    return nextState
  }

  async function rescan(): Promise<LocalLibraryState> {
    const nextState = await runMutation(() => platformService.scanLocalLibrary())
    applyState(nextState)
    return nextState
  }

  return {
    addFolder,
    removeFolder,
    rescan,
    setFolderEnabled
  }
}
