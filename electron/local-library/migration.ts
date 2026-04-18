import type { LocalLibraryTrack } from '@/types/localLibrary'

import type { LocalLibraryRepository } from './repository'
import type { PersistedFolder } from './repository.types'
import { isLegacyState, type LegacyStoreShape } from './service.helpers'

export function migrateLegacyLocalLibraryStateIfNeeded(
  repository: LocalLibraryRepository,
  legacyStore: LegacyStoreShape,
  storeKey: string
): void {
  if (repository.hasAnyFolder()) {
    return
  }

  const legacyState = legacyStore.get<unknown>(storeKey, undefined)
  if (!isLegacyState(legacyState)) {
    return
  }

  for (const folder of legacyState.folders) {
    repository.upsertFolder(folder)
  }

  const tracksByFolder = new Map<string, LocalLibraryTrack[]>()
  for (const track of legacyState.tracks) {
    const collection = tracksByFolder.get(track.folderId) ?? []
    collection.push({
      ...track,
      coverHash: track.coverHash ?? null
    })
    tracksByFolder.set(track.folderId, collection)
  }

  for (const folder of legacyState.folders as PersistedFolder[]) {
    repository.replaceFolderTracks(folder.id, tracksByFolder.get(folder.id) ?? [])
  }
}
