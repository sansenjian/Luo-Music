import { onMounted, onUnmounted } from 'vue'

import { RECEIVE_CHANNELS } from '../../electron/shared/protocol/channels'
import { useLocalLibraryCommands } from '@/composables/local-library/useLocalLibraryCommands'
import { useLocalLibraryQueries } from '@/composables/local-library/useLocalLibraryQueries'
import { useLocalLibraryRequests } from '@/composables/local-library/useLocalLibraryRequests'
import { useLocalLibraryStateModel } from '@/composables/local-library/useLocalLibraryStateModel'
import { services } from '@/services'
import type { LocalLibraryScanStatus, LocalLibraryState } from '@/types/localLibrary'

import type {
  LocalLibraryPlatformService,
  UseLocalLibraryCommandsGroup,
  UseLocalLibraryQueriesGroup,
  UseLocalLibraryStateGroup
} from './local-library/types'

export function useLocalLibrary() {
  const platformService = services.platform() as LocalLibraryPlatformService
  const unsubscribers: Array<() => void> = []
  const { loading, mutating, pageLoading, runMutation, runPageRequest, runRequest } =
    useLocalLibraryRequests()
  const { applyState, applyStatus, state, status } = useLocalLibraryStateModel()
  const {
    albumsPage,
    artistsPage,
    coverUrls,
    loadAlbums,
    loadArtists,
    loadInitialPages,
    loadTracks,
    patchTrackDuration,
    reloadLoadedPages,
    songsPage
  } = useLocalLibraryQueries(platformService, runPageRequest)
  const { addFolder, removeFolder, rescan, setFolderEnabled } = useLocalLibraryCommands(
    platformService,
    applyState,
    runMutation
  )

  async function refresh(): Promise<void> {
    const nextState = await runRequest(() => platformService.getLocalLibraryState())
    applyState(nextState)
  }

  onMounted(() => {
    unsubscribers.push(
      platformService.on(RECEIVE_CHANNELS.LOCAL_LIBRARY_UPDATED, payload => {
        applyState(payload as LocalLibraryState)
        void reloadLoadedPages()
      })
    )
    unsubscribers.push(
      platformService.on(RECEIVE_CHANNELS.LOCAL_LIBRARY_SCAN_STATUS, payload => {
        applyStatus(payload as LocalLibraryScanStatus)
      })
    )

    void (async () => {
      try {
        await refresh()
        if (state.value.supported) {
          await loadInitialPages()
        }
      } catch {
        // The request layer already updates loading state; keep mount resilient.
      }
    })()
  })

  onUnmounted(() => {
    for (const unsubscribe of unsubscribers.splice(0)) {
      unsubscribe()
    }
  })

  const stateGroup: UseLocalLibraryStateGroup = {
    loading,
    mutating,
    pageLoading,
    refresh,
    state,
    status
  }

  const queries: UseLocalLibraryQueriesGroup = {
    albumsPage,
    artistsPage,
    coverUrls,
    loadAlbums,
    loadArtists,
    loadTracks,
    patchTrackDuration,
    songsPage
  }

  const commands: UseLocalLibraryCommandsGroup = {
    addFolder,
    removeFolder,
    rescan,
    setFolderEnabled
  }

  return {
    stateGroup,
    queries,
    commands,
    state,
    status,
    loading,
    pageLoading,
    mutating,
    songsPage,
    artistsPage,
    albumsPage,
    coverUrls,
    refresh,
    addFolder,
    removeFolder,
    setFolderEnabled,
    rescan,
    loadTracks,
    loadArtists,
    loadAlbums
  }
}
