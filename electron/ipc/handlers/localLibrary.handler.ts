import { dialog } from 'electron'
import type { OpenDialogOptions } from 'electron'

import { localLibraryService } from '../../local-library/service'
import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '../../shared/protocol/channels.ts'
import { ipcService } from '../IpcService'
import type { WindowManager } from '../../WindowManager'
import type { LocalLibrarySummaryQuery, LocalLibraryTrackQuery } from '@/types/localLibrary'

let listenersRegistered = false

function parseOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new Error(`Invalid ${fieldName}`)
  }

  return value
}

function parseOptionalLimit(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new Error('Invalid query.limit')
  }

  return value
}

function parseSummaryQuery(query: unknown): LocalLibrarySummaryQuery | undefined {
  if (query === undefined || query === null) {
    return undefined
  }

  if (typeof query !== 'object') {
    throw new Error('Invalid local library summary query')
  }

  const candidate = query as Record<string, unknown>
  return {
    cursor:
      candidate.cursor === null ? null : parseOptionalString(candidate.cursor, 'query.cursor'),
    limit: parseOptionalLimit(candidate.limit),
    search: parseOptionalString(candidate.search, 'query.search')
  }
}

function parseTrackQuery(query: unknown): LocalLibraryTrackQuery | undefined {
  if (query === undefined || query === null) {
    return undefined
  }

  if (typeof query !== 'object') {
    throw new Error('Invalid local library track query')
  }

  const candidate = query as Record<string, unknown>
  return {
    ...parseSummaryQuery(query),
    album: parseOptionalString(candidate.album, 'query.album'),
    artist: parseOptionalString(candidate.artist, 'query.artist'),
    folderId: parseOptionalString(candidate.folderId, 'query.folderId')
  }
}

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
    return localLibraryService.getTracksPage(parseTrackQuery(query))
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.LOCAL_LIBRARY_GET_ARTISTS, async query => {
    return localLibraryService.getArtistsPage(parseSummaryQuery(query))
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.LOCAL_LIBRARY_GET_ALBUMS, async query => {
    return localLibraryService.getAlbumsPage(parseSummaryQuery(query))
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.LOCAL_LIBRARY_GET_COVER, async (coverHash: string) => {
    return localLibraryService.getCoverDataUrl(coverHash)
  })
}
