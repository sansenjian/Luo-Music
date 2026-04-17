import { dialog } from 'electron'
import type { OpenDialogOptions } from 'electron'

import { localLibraryService } from '../../local-library/service'
import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '../../shared/protocol/channels.ts'
import { ipcService } from '../IpcService'
import type { WindowManager } from '../../WindowManager'

let listenersRegistered = false

function ensureLocalLibraryListenersRegistered(): void {
  if (listenersRegistered) {
    return
  }

  localLibraryService.onUpdated(state => {
    ipcService.broadcast(RECEIVE_CHANNELS.LOCAL_LIBRARY_UPDATED, state)
  })
  localLibraryService.onStatusChange(status => {
    ipcService.broadcast(RECEIVE_CHANNELS.LOCAL_LIBRARY_SCAN_STATUS, status)
  })

  listenersRegistered = true
}

export function registerLocalLibraryHandlers(
  windowManager: Pick<WindowManager, 'getWindow'>
): void {
  ensureLocalLibraryListenersRegistered()

  ipcService.registerInvoke(INVOKE_CHANNELS.LOCAL_LIBRARY_GET_STATE, async () => {
    return localLibraryService.getState()
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.LOCAL_LIBRARY_PICK_FOLDER, async () => {
    const dialogOptions: OpenDialogOptions = {
      title: '选择本地音乐文件夹',
      properties: ['openDirectory']
    }
    const ownerWindow = windowManager.getWindow()
    const dialogResult = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (dialogResult.canceled) {
      return null
    }

    return dialogResult.filePaths[0] ?? null
  })

  ipcService.registerInvoke(
    INVOKE_CHANNELS.LOCAL_LIBRARY_ADD_FOLDER,
    async (folderPath: string) => {
      return localLibraryService.addFolder(folderPath)
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.LOCAL_LIBRARY_REMOVE_FOLDER,
    async (folderId: string) => {
      return localLibraryService.removeFolder(folderId)
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.LOCAL_LIBRARY_SET_FOLDER_ENABLED,
    async (folderId: string, enabled: boolean) => {
      return localLibraryService.setFolderEnabled(folderId, enabled)
    }
  )

  ipcService.registerInvoke(INVOKE_CHANNELS.LOCAL_LIBRARY_SCAN, async () => {
    return localLibraryService.scan()
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.LOCAL_LIBRARY_GET_TRACKS, async query => {
    return localLibraryService.getTracksPage(query)
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.LOCAL_LIBRARY_GET_ARTISTS, async query => {
    return localLibraryService.getArtistsPage(query)
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.LOCAL_LIBRARY_GET_ALBUMS, async query => {
    return localLibraryService.getAlbumsPage(query)
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.LOCAL_LIBRARY_GET_COVER, async (coverHash: string) => {
    return localLibraryService.getCoverDataUrl(coverHash)
  })
}
