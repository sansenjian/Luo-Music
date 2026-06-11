import type { LocalLibraryState } from '@shared/types/localLibrary'

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

  async function rescanFolder(folderId: string): Promise<LocalLibraryState> {
    const nextState = await runMutation(() => platformService.scanLocalLibraryFolder(folderId))
    applyState(nextState)
    return nextState
  }

  async function showFolder(folderId: string): Promise<boolean> {
    return runMutation(() => platformService.showLocalLibraryFolder(folderId))
  }

  async function showTrack(trackId: string): Promise<boolean> {
    return runMutation(() => platformService.showLocalLibraryTrack(trackId))
  }

  return {
    addFolder,
    removeFolder,
    rescan,
    rescanFolder,
    setFolderEnabled,
    showFolder,
    showTrack
  }
}
