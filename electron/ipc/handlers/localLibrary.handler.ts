import path from 'node:path'
import { dialog, shell } from 'electron'
import type { OpenDialogOptions } from 'electron'

import { getLocalLibraryService } from '../../local-library/service'
import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '@shared/protocol/channels'
import { ipcService } from '../IpcService'
import type { WindowManager } from '../../WindowManager'
import type {
  LocalLibraryCoverSize,
  LocalLibrarySummaryQuery,
  LocalLibraryTrackQuery
} from '@shared/types/localLibrary'

let listenersRegistered = false
const LOCAL_LIBRARY_FOLDER_ID_PATTERN = /^local-folder:[a-f0-9]{40}$/i
const LOCAL_LIBRARY_COVER_HASH_PATTERN = /^[a-f0-9]{40}$/i
const LOCAL_LIBRARY_TRACK_ID_PATTERN = /^local:[a-f0-9]{40}$/i

function parseOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new Error(`Invalid ${fieldName}`)
  }

  return value
}

function parseRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}`)
  }

  return value.trim()
}

function parseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${fieldName}`)
  }

  return value
}

function parseOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  return parseBoolean(value, fieldName)
}

function parseAbsoluteFolderPath(value: unknown): string {
  const folderPath = parseRequiredString(value, 'folderPath')
  if (!path.isAbsolute(folderPath)) {
    throw new Error('Invalid folderPath')
  }

  return folderPath
}

function parseFolderId(value: unknown, fieldName = 'folderId'): string {
  const folderId = parseRequiredString(value, fieldName)
  if (!LOCAL_LIBRARY_FOLDER_ID_PATTERN.test(folderId)) {
    throw new Error(`Invalid ${fieldName}`)
  }

  return folderId
}

function parseCoverHash(value: unknown): string {
  const coverHash = parseRequiredString(value, 'coverHash')
  if (!LOCAL_LIBRARY_COVER_HASH_PATTERN.test(coverHash)) {
    throw new Error('Invalid coverHash')
  }

  return coverHash
}

function parseCoverSize(value: unknown): LocalLibraryCoverSize {
  if (value === undefined || value === null || value === '') {
    return 'large'
  }

  if (value === 'thumb' || value === 'album' || value === 'large') {
    return value
  }

  throw new Error('Invalid coverSize')
}

function parseTrackId(value: unknown): string {
  const trackId = parseRequiredString(value, 'trackId')
  if (!LOCAL_LIBRARY_TRACK_ID_PATTERN.test(trackId)) {
    throw new Error('Invalid trackId')
  }

  return trackId
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

function parseOptionalTimestamp(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${fieldName}`)
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
  const duplicateMode = parseOptionalString(candidate.duplicateMode, 'query.duplicateMode')
  if (duplicateMode !== undefined && duplicateMode !== 'strict' && duplicateMode !== 'fuzzy') {
    throw new Error('Invalid query.duplicateMode')
  }

  return {
    ...parseSummaryQuery(query),
    album: parseOptionalString(candidate.album, 'query.album'),
    artist: parseOptionalString(candidate.artist, 'query.artist'),
    duplicateMode,
    folderId: parseOptionalString(candidate.folderId, 'query.folderId'),
    hideDuplicates: parseOptionalBoolean(candidate.hideDuplicates, 'query.hideDuplicates'),
    recentlyAddedOnly: parseOptionalBoolean(candidate.recentlyAddedOnly, 'query.recentlyAddedOnly'),
    recentlyAddedSince: parseOptionalTimestamp(
      candidate.recentlyAddedSince,
      'query.recentlyAddedSince'
    ),
    showDuplicatesOnly: parseOptionalBoolean(
      candidate.showDuplicatesOnly,
      'query.showDuplicatesOnly'
    )
  }
}

function ensureLocalLibraryListenersRegistered(): void {
  if (listenersRegistered) {
    return
  }

  const localLibraryService = getLocalLibraryService()
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
  const localLibraryService = getLocalLibraryService()

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
    async (folderPath: unknown) => {
      return localLibraryService.addFolder(parseAbsoluteFolderPath(folderPath))
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.LOCAL_LIBRARY_REMOVE_FOLDER,
    async (folderId: unknown) => {
      return localLibraryService.removeFolder(parseFolderId(folderId))
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.LOCAL_LIBRARY_SET_FOLDER_ENABLED,
    async (folderId: unknown, enabled: unknown) => {
      return localLibraryService.setFolderEnabled(
        parseFolderId(folderId),
        parseBoolean(enabled, 'enabled')
      )
    }
  )

  ipcService.registerInvoke(INVOKE_CHANNELS.LOCAL_LIBRARY_SCAN, async () => {
    return localLibraryService.scan()
  })

  ipcService.registerInvoke(
    INVOKE_CHANNELS.LOCAL_LIBRARY_SCAN_FOLDER,
    async (folderId: unknown) => {
      return localLibraryService.scanFolder(parseFolderId(folderId))
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.LOCAL_LIBRARY_SHOW_FOLDER,
    async (folderId: unknown) => {
      const folderPath = localLibraryService.getFolderPath(parseFolderId(folderId))
      const errorMessage = await shell.openPath(folderPath)

      if (errorMessage) {
        throw new Error(errorMessage)
      }

      return true
    }
  )

  ipcService.registerInvoke(INVOKE_CHANNELS.LOCAL_LIBRARY_SHOW_TRACK, async (trackId: unknown) => {
    const trackPath = localLibraryService.getTrackFilePath(parseTrackId(trackId))
    shell.showItemInFolder(trackPath)

    return true
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

  ipcService.registerInvoke(
    INVOKE_CHANNELS.LOCAL_LIBRARY_GET_COVER,
    async (coverHash: unknown, coverSize: unknown) => {
      return localLibraryService.getCoverDataUrl(
        parseCoverHash(coverHash),
        parseCoverSize(coverSize)
      )
    }
  )
}
