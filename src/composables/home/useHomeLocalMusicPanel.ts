import { computed, ref, watch } from 'vue'

import { useLocalLibrary } from '@/composables/useLocalLibrary'
import { usePlayerStore } from '@/store/playerStore'
import { useToastStore } from '@/store/toastStore'
import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryFolder,
  LocalLibraryTrackQuery,
  LocalLibraryViewMode
} from '@/types/localLibrary'
import { isLocalLibrarySong } from '@/types/localLibrary'
import {
  formatLocalLibraryBytes,
  formatLocalLibraryDateTime,
  formatLocalLibraryTotalDuration
} from '@/utils/localLibrary/formatters'

import type {
  LocalMusicEmptyStateModel,
  LocalMusicSummaryCard,
  LocalMusicViewModeOption
} from './localMusic.types'
import { playMediaSongSelection, resolvePanelErrorMessage } from './mediaPanelShared'

const LOCAL_LIBRARY_VIEW_MODES: LocalMusicViewModeOption[] = [
  { id: 'songs', label: '歌曲' },
  { id: 'artists', label: '艺人' },
  { id: 'albums', label: '专辑' }
]

const LOADING_EMPTY_STATE: LocalMusicEmptyStateModel = {
  icon: '…',
  title: '正在读取本地音乐',
  description: '稍等片刻，桌面端正在准备你的本地资料库。'
}

const UNSUPPORTED_EMPTY_STATE: LocalMusicEmptyStateModel = {
  icon: '♪',
  title: '本地音乐仅支持桌面端',
  description: '当前运行环境无法直接访问本地文件系统，请在 Electron 版本中使用这个功能。'
}

const ROOT_EMPTY_STATE: LocalMusicEmptyStateModel = {
  icon: '＋',
  title: '添加你的第一个本地音乐文件夹',
  description: '扫描完成后，这里会直接展示可播放的本地歌曲列表。'
}

const SONGS_FILTER_EMPTY_STATE: LocalMusicEmptyStateModel = {
  icon: '?',
  title: '没有匹配结果',
  description: '试试更短的关键词，或者切换筛选范围后再搜索。'
}

const SONGS_EMPTY_STATE: LocalMusicEmptyStateModel = {
  icon: '♪',
  title: '还没有扫描到歌曲',
  description: '请确认文件夹里包含常见音频格式，例如 MP3、FLAC、M4A 或 OGG。'
}

const ARTISTS_EMPTY_STATE: LocalMusicEmptyStateModel = {
  icon: '◎',
  title: '还没有可展示的艺人',
  description: '添加文件夹并完成扫描后，这里会按艺人聚合你的本地资料库。'
}

const ALBUMS_EMPTY_STATE: LocalMusicEmptyStateModel = {
  icon: '▣',
  title: '还没有可展示的专辑',
  description: '添加文件夹并完成扫描后，这里会按专辑聚合你的本地资料库。'
}

export function useHomeLocalMusicPanel() {
  const playerStore = usePlayerStore()
  const toastStore = useToastStore()
  const localLibrary = useLocalLibrary()
  const { state, status, loading, mutating, pageLoading } = localLibrary.stateGroup
  const {
    albumsPage,
    artistsPage,
    coverUrls,
    loadAlbums,
    loadArtists,
    loadTracks,
    patchTrackDuration,
    songsPage
  } = localLibrary.queries
  const { addFolder, removeFolder, rescan, setFolderEnabled } = localLibrary.commands

  const activeView = ref<LocalLibraryViewMode>('songs')
  const searchDraft = ref('')
  const appliedSearch = ref('')
  const selectedArtist = ref<string | null>(null)
  const selectedAlbum = ref<Pick<LocalLibraryAlbumSummary, 'name' | 'artist'> | null>(null)

  const supported = computed(() => state.value.supported)
  const folders = computed(() => state.value.folders)
  const hasFolders = computed(() => folders.value.length > 0)
  const isScanning = computed(() => status.value.phase === 'scanning')
  const hasEnabledFolders = computed(() => folders.value.some(folder => folder.enabled))
  const totalFolderLabel = computed(() => `${folders.value.length} 个文件夹`)
  const totalTrackLabel = computed(() => `${status.value.discoveredTracks} 首歌曲`)
  const lastScanLabel = computed(() => {
    const finishedAt = status.value.finishedAt
    if (!finishedAt) {
      return '尚未完成扫描'
    }

    return formatLocalLibraryDateTime(finishedAt)
  })
  const currentSongQuery = computed<LocalLibraryTrackQuery>(() => ({
    search: appliedSearch.value || undefined,
    artist: selectedAlbum.value ? selectedAlbum.value.artist : selectedArtist.value,
    album: selectedAlbum.value?.name
  }))
  const playbackSongs = computed(() =>
    songsPage.value.items.map(track => {
      const coverUrl = track.coverHash ? (coverUrls.value[track.coverHash] ?? '') : ''

      return {
        ...track.song,
        album: {
          ...track.song.album,
          picUrl: coverUrl || track.song.album.picUrl
        }
      }
    })
  )
  const currentSummaryLabel = computed(() => {
    if (activeView.value === 'artists') {
      return `${artistsPage.value.total} 位艺人`
    }

    if (activeView.value === 'albums') {
      return `${albumsPage.value.total} 张专辑`
    }

    return `${songsPage.value.total} 首歌曲`
  })
  const currentViewTitle = computed(() => {
    if (activeView.value === 'artists') {
      return '艺人视图'
    }

    if (activeView.value === 'albums') {
      return '专辑视图'
    }

    return '歌曲列表'
  })
  const activeSongScopeLabel = computed(() => {
    if (selectedAlbum.value) {
      return `${selectedAlbum.value.artist} / ${selectedAlbum.value.name}`
    }

    if (selectedArtist.value) {
      return selectedArtist.value
    }

    return null
  })
  const hasSongFilters = computed(() =>
    Boolean(appliedSearch.value || selectedArtist.value || selectedAlbum.value)
  )
  const showCurrentViewLoading = computed(() => {
    if (!(loading.value || pageLoading.value)) {
      return false
    }

    if (activeView.value === 'artists') {
      return artistsPage.value.items.length === 0
    }

    if (activeView.value === 'albums') {
      return albumsPage.value.items.length === 0
    }

    return songsPage.value.items.length === 0
  })
  const songsEmptyState = computed(() =>
    hasSongFilters.value ? SONGS_FILTER_EMPTY_STATE : SONGS_EMPTY_STATE
  )
  const artistCards = computed<LocalMusicSummaryCard[]>(() =>
    artistsPage.value.items.map(artist => ({
      actionLabel: '查看歌曲',
      coverUrl: resolveCoverUrl(artist.coverHash),
      fallbackLabel: '艺',
      id: artist.id,
      lines: [`${artist.trackCount} 首 · ${formatLocalLibraryTotalDuration(artist.totalDuration)}`],
      title: artist.name
    }))
  )
  const albumCards = computed<LocalMusicSummaryCard[]>(() =>
    albumsPage.value.items.map(album => ({
      actionLabel: '查看歌曲',
      coverUrl: resolveCoverUrl(album.coverHash),
      fallbackLabel: '专',
      id: album.id,
      lines: [
        album.artist,
        `${album.trackCount} 首 · ${formatLocalLibraryTotalDuration(album.totalDuration)}`
      ],
      title: album.name
    }))
  )
  const hasMoreForActiveView = computed(() => {
    if (activeView.value === 'artists') {
      return Boolean(artistsPage.value.nextCursor)
    }

    if (activeView.value === 'albums') {
      return Boolean(albumsPage.value.nextCursor)
    }

    return Boolean(songsPage.value.nextCursor)
  })
  const currentPageSizeLabel = computed(() =>
    formatLocalLibraryBytes(
      songsPage.value.items.reduce((sum, track) => {
        return sum + track.fileSize
      }, 0)
    )
  )

  watch(activeView, nextView => {
    void loadView(nextView)
  })

  watch(
    () => [playerStore.currentSong, playerStore.duration] as const,
    ([currentSong, durationSeconds]) => {
      if (!currentSong || !isLocalLibrarySong(currentSong) || !Number.isFinite(durationSeconds)) {
        return
      }

      const durationMs = Math.round(durationSeconds * 1000)
      if (durationMs <= 0) {
        return
      }

      patchTrackDuration(currentSong.id, durationMs)
    }
  )

  async function loadView(view: LocalLibraryViewMode, append = false): Promise<void> {
    const query = appliedSearch.value || undefined

    if (view === 'songs') {
      await loadTracks(currentSongQuery.value, append)
      return
    }

    if (view === 'artists') {
      await loadArtists({ search: query }, append)
      return
    }

    await loadAlbums({ search: query }, append)
  }

  function setActiveView(view: LocalLibraryViewMode): void {
    activeView.value = view
  }

  function updateSearchDraft(value: string): void {
    searchDraft.value = value
  }

  async function handleAddFolder(): Promise<void> {
    try {
      const nextState = await addFolder()
      if (!nextState) {
        return
      }

      toastStore.success(
        nextState.folders.length > 0 ? '本地音乐文件夹已加入资料库' : '已更新本地音乐资料库'
      )
    } catch (error) {
      toastStore.error(resolvePanelErrorMessage(error, '添加本地音乐文件夹失败'))
    }
  }

  async function handleRemoveFolder(folderId: string): Promise<void> {
    try {
      await removeFolder(folderId)
      toastStore.success('已移除本地音乐文件夹')
    } catch (error) {
      toastStore.error(resolvePanelErrorMessage(error, '移除本地音乐文件夹失败'))
    }
  }

  async function handleToggleFolder(folder: LocalLibraryFolder): Promise<void> {
    try {
      const nextEnabledState = !folder.enabled
      await setFolderEnabled(folder.id, nextEnabledState)
      toastStore.success(nextEnabledState ? '已启用本地音乐文件夹' : '已停用本地音乐文件夹')
    } catch (error) {
      toastStore.error(resolvePanelErrorMessage(error, '更新本地音乐文件夹状态失败'))
    }
  }

  async function handleRescan(): Promise<void> {
    try {
      await rescan()
      toastStore.success('本地音乐扫描完成')
    } catch (error) {
      toastStore.error(resolvePanelErrorMessage(error, '重新扫描本地音乐失败'))
    }
  }

  async function handleSearchSubmit(): Promise<void> {
    appliedSearch.value = searchDraft.value.trim()
    await loadView(activeView.value)
  }

  function clearSearch(): void {
    searchDraft.value = ''
    appliedSearch.value = ''
    void loadView(activeView.value)
  }

  async function clearSongScope(): Promise<void> {
    selectedArtist.value = null
    selectedAlbum.value = null
    await loadTracks(currentSongQuery.value)
  }

  async function handleLoadMore(): Promise<void> {
    await loadView(activeView.value, true)
  }

  async function focusArtist(artist: LocalLibraryArtistSummary): Promise<void> {
    selectedArtist.value = artist.name
    selectedAlbum.value = null
    activeView.value = 'songs'
  }

  async function focusAlbum(album: LocalLibraryAlbumSummary): Promise<void> {
    selectedAlbum.value = {
      name: album.name,
      artist: album.artist
    }
    selectedArtist.value = null
    activeView.value = 'songs'
  }

  function selectArtistCard(cardId: string): void {
    const artist = artistsPage.value.items.find(item => item.id === cardId)
    if (!artist) {
      return
    }

    void focusArtist(artist)
  }

  function selectAlbumCard(cardId: string): void {
    const album = albumsPage.value.items.find(item => item.id === cardId)
    if (!album) {
      return
    }

    void focusAlbum(album)
  }

  async function playLocalSongAt(index: number): Promise<void> {
    await playMediaSongSelection(
      playerStore,
      toastStore,
      playbackSongs.value,
      index,
      '播放本地音乐失败'
    )
  }

  function resolveCoverUrl(coverHash: string | null): string {
    return coverHash ? (coverUrls.value[coverHash] ?? '') : ''
  }

  return {
    activeSongScopeLabel,
    activeView,
    albumCards,
    albumsEmptyState: ALBUMS_EMPTY_STATE,
    artistCards,
    artistsEmptyState: ARTISTS_EMPTY_STATE,
    clearSearch,
    clearSongScope,
    currentPageSizeLabel,
    currentSummaryLabel,
    currentViewTitle,
    folders,
    handleAddFolder,
    handleLoadMore,
    handleRemoveFolder,
    handleRescan,
    handleSearchSubmit,
    handleToggleFolder,
    hasEnabledFolders,
    hasFolders,
    hasMoreForActiveView,
    hasSongFilters,
    isScanning,
    lastScanLabel,
    loadingEmptyState: LOADING_EMPTY_STATE,
    mutating,
    pageLoading,
    playbackSongs,
    playLocalSongAt,
    rootEmptyState: ROOT_EMPTY_STATE,
    searchDraft,
    selectAlbumCard,
    selectArtistCard,
    setActiveView,
    songsEmptyState,
    status,
    supported,
    totalFolderLabel,
    totalTrackLabel,
    unsupportedEmptyState: UNSUPPORTED_EMPTY_STATE,
    updateSearchDraft,
    viewModes: LOCAL_LIBRARY_VIEW_MODES,
    showCurrentViewLoading
  }
}
