import { computed, ref, watch } from 'vue'

import { useAudioOutputPlugin } from '@/composables/useAudioOutputPlugin'
import { useLocalLibrary } from '@/composables/useLocalLibrary'
import type { Song } from '@/platform/music/interface'
import {
  addUniqueSongsToLocalPlaylist,
  useLocalPlaylistStore,
  type AddSongsToLocalPlaylistResult
} from '@/store/localPlaylistStore'
import { usePlayerStore } from '@/store/playerStore'
import { useToastStore } from '@/store/toastStore'
import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryFolder,
  LocalLibraryHealthSummary,
  LocalLibraryMetadataCandidateSummary,
  LocalLibraryTrackQuery,
  LocalLibraryViewMode
} from '@shared/types/localLibrary'
import {
  LOCAL_LIBRARY_INBOX_WINDOW_MS,
  createEmptyLocalLibraryHealthSummary,
  createEmptyLocalLibraryMetadataCandidateSummary,
  isLocalLibrarySong
} from '@shared/types/localLibrary'
import type {
  AudioOutputBitPerfectStatus,
  AudioOutputMode,
  AudioOutputNativePlaybackState,
  AudioOutputStatus
} from '@shared/audioOutput/protocol'
import {
  formatLocalLibraryBytes,
  formatLocalLibraryDateTime,
  formatLocalLibraryTotalDuration
} from '@/utils/localLibrary/formatters'

import type {
  LocalMusicDiagnosticCard,
  LocalMusicEmptyStateModel,
  LocalMusicPlaylistOption,
  LocalMusicSummaryCard,
  LocalMusicViewModeOption
} from './localMusic.types'
import { playMediaSongSelection, resolvePanelErrorMessage } from './mediaPanelShared'

const LOCAL_LIBRARY_VIEW_MODES: LocalMusicViewModeOption[] = [
  { id: 'songs', label: '歌曲' },
  { id: 'inbox', label: '新入库' },
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

const INBOX_EMPTY_STATE: LocalMusicEmptyStateModel = {
  icon: '＋',
  title: '最近没有新入库歌曲',
  description: '新扫描或变动同步进入资料库的歌曲，会先出现在这里。'
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
  const localPlaylistStore = useLocalPlaylistStore()
  const localLibrary = useLocalLibrary()
  const { audioOutputStatus } = useAudioOutputPlugin()
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
  const { addFolder, removeFolder, rescan, rescanFolder, setFolderEnabled, showFolder, showTrack } =
    localLibrary.commands

  const activeView = ref<LocalLibraryViewMode>('songs')
  const searchDraft = ref('')
  const appliedSearch = ref('')
  const selectedArtist = ref<string | null>(null)
  const selectedAlbum = ref<Pick<LocalLibraryAlbumSummary, 'name' | 'artist'> | null>(null)
  const hideDuplicateSongs = ref(false)
  const showDuplicateSongsOnly = ref(false)

  const supported = computed(() => state.value.supported)
  const folders = computed(() => state.value.folders)
  const hasFolders = computed(() => folders.value.length > 0)
  const isScanning = computed(() => status.value.phase === 'scanning')
  const hasEnabledFolders = computed(() => folders.value.some(folder => folder.enabled))
  const healthSummary = computed<LocalLibraryHealthSummary>(
    () => state.value.health ?? createEmptyLocalLibraryHealthSummary()
  )
  const metadataCandidateSummary = computed<LocalLibraryMetadataCandidateSummary>(
    () => state.value.metadataCandidateSummary ?? createEmptyLocalLibraryMetadataCandidateSummary()
  )
  const totalFolderLabel = computed(() => `${folders.value.length} 个文件夹`)
  const totalTrackLabel = computed(() => `${status.value.discoveredTracks} 首歌曲`)
  const lastScanLabel = computed(() => {
    const finishedAt = status.value.finishedAt
    if (!finishedAt) {
      return '尚未完成扫描'
    }

    return formatLocalLibraryDateTime(finishedAt)
  })
  const currentSongQuery = computed<LocalLibraryTrackQuery>(() => {
    const query: LocalLibraryTrackQuery = {
      search: appliedSearch.value || undefined,
      artist: selectedAlbum.value ? selectedAlbum.value.artist : selectedArtist.value,
      album: selectedAlbum.value?.name,
      duplicateMode:
        hideDuplicateSongs.value || showDuplicateSongsOnly.value ? 'strict' : undefined,
      hideDuplicates: hideDuplicateSongs.value || undefined,
      showDuplicatesOnly: showDuplicateSongsOnly.value || undefined
    }

    if (activeView.value === 'inbox') {
      query.recentlyAddedOnly = true
    }

    return query
  })
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

    if (activeView.value === 'inbox') {
      return `${songsPage.value.total} 首新入库`
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

    if (activeView.value === 'inbox') {
      return '新入库'
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
    Boolean(
      appliedSearch.value ||
      selectedArtist.value ||
      selectedAlbum.value ||
      hideDuplicateSongs.value ||
      showDuplicateSongsOnly.value
    )
  )
  const hasSearchValue = computed(() =>
    Boolean(searchDraft.value.length > 0 || appliedSearch.value)
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
  const songsEmptyState = computed(() => {
    if (hasSongFilters.value) {
      return SONGS_FILTER_EMPTY_STATE
    }

    return activeView.value === 'inbox' ? INBOX_EMPTY_STATE : SONGS_EMPTY_STATE
  })
  const localDiagnosticsCards = computed<LocalMusicDiagnosticCard[]>(() =>
    createLocalDiagnosticsCards(healthSummary.value, metadataCandidateSummary.value)
  )
  const nativeAudioDiagnosticsSnapshot = ref(
    createNativeAudioDiagnosticsSnapshot(audioOutputStatus.value)
  )
  const nativeAudioDiagnostics = computed<LocalMusicDiagnosticCard[]>(() =>
    createNativeAudioDiagnosticCards(nativeAudioDiagnosticsSnapshot.value)
  )
  const diagnosticCards = computed<LocalMusicDiagnosticCard[]>(() => [
    ...localDiagnosticsCards.value,
    ...nativeAudioDiagnostics.value
  ])
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
  const localPlaylistOptions = computed<LocalMusicPlaylistOption[]>(() =>
    localPlaylistStore.sortedPlaylists.map(playlist => ({
      id: playlist.id,
      name: playlist.name,
      songCount: playlist.songs.length
    }))
  )

  watch(activeView, nextView => {
    void loadView(nextView)
  })

  watch(
    () => createNativeAudioDiagnosticsKey(audioOutputStatus.value),
    () => {
      nativeAudioDiagnosticsSnapshot.value = createNativeAudioDiagnosticsSnapshot(
        audioOutputStatus.value
      )
    },
    { immediate: true }
  )

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

    if (view === 'songs' || view === 'inbox') {
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

  async function handleShowFolder(folder: LocalLibraryFolder): Promise<void> {
    try {
      await showFolder(folder.id)
    } catch (error) {
      toastStore.error(resolvePanelErrorMessage(error, '打开本地音乐文件夹失败'))
    }
  }

  async function handleRescanFolder(folder: LocalLibraryFolder): Promise<void> {
    try {
      await rescanFolder(folder.id)
      toastStore.success(`已同步本地音乐文件夹「${folder.name}」`)
    } catch (error) {
      toastStore.error(resolvePanelErrorMessage(error, '同步本地音乐文件夹失败'))
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

  async function toggleHideDuplicateSongs(): Promise<void> {
    hideDuplicateSongs.value = !hideDuplicateSongs.value
    if (hideDuplicateSongs.value) {
      showDuplicateSongsOnly.value = false
    }

    await loadTracks(currentSongQuery.value)
  }

  async function toggleShowDuplicateSongsOnly(): Promise<void> {
    showDuplicateSongsOnly.value = !showDuplicateSongsOnly.value
    if (showDuplicateSongsOnly.value) {
      hideDuplicateSongs.value = false
    }

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

  async function showLocalSongInFolder(song: Song): Promise<void> {
    if (!isLocalLibrarySong(song)) {
      toastStore.error('只能定位本地音乐文件')
      return
    }

    try {
      await showTrack(String(song.id))
    } catch (error) {
      toastStore.error(resolvePanelErrorMessage(error, '定位本地音乐文件失败'))
    }
  }

  function createLocalPlaylistFromSong(song: Song, playlistName: string): void {
    if (!isLocalLibrarySong(song)) {
      toastStore.error('只能为本地音乐创建本地歌单')
      return
    }

    try {
      const playlist = localPlaylistStore.createPlaylist(playlistName, [song])
      toastStore.success(`已创建本地歌单「${playlist.name}」`)
    } catch (error) {
      toastStore.error(resolvePanelErrorMessage(error, '创建本地歌单失败'))
    }
  }

  function addSongsToLocalPlaylist(
    playlistId: string,
    songs: Song[]
  ): AddSongsToLocalPlaylistResult {
    const runtimeStore = localPlaylistStore as {
      addSongsToPlaylist?: unknown
    }

    if (typeof runtimeStore.addSongsToPlaylist === 'function') {
      return localPlaylistStore.addSongsToPlaylist(playlistId, songs)
    }

    const playlist = localPlaylistStore.playlists.find(item => item.id === playlistId)
    if (!playlist) {
      throw new Error('找不到该本地歌单')
    }

    return addUniqueSongsToLocalPlaylist(playlist, songs)
  }

  function addLocalSongToPlaylist(song: Song, playlistId: string): void {
    if (!isLocalLibrarySong(song)) {
      toastStore.error('只能将本地音乐添加到本地歌单')
      return
    }

    try {
      const { playlist, addedCount } = addSongsToLocalPlaylist(playlistId, [song])
      if (addedCount === 0) {
        toastStore.info(`「${song.name}」已在「${playlist.name}」中`)
        return
      }

      toastStore.success(`已添加到本地歌单「${playlist.name}」`)
    } catch (error) {
      toastStore.error(resolvePanelErrorMessage(error, '添加到本地歌单失败'))
    }
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
    createLocalPlaylistFromSong,
    diagnosticCards,
    folders,
    handleAddFolder,
    handleLoadMore,
    handleRemoveFolder,
    handleRescan,
    handleRescanFolder,
    handleSearchSubmit,
    handleShowFolder,
    handleToggleFolder,
    hasEnabledFolders,
    hasFolders,
    hasMoreForActiveView,
    hasSearchValue,
    hasSongFilters,
    hideDuplicateSongs,
    isScanning,
    lastScanLabel,
    loadingEmptyState: LOADING_EMPTY_STATE,
    localPlaylistOptions,
    metadataCandidateSummary,
    mutating,
    pageLoading,
    addLocalSongToPlaylist,
    playbackSongs,
    playLocalSongAt,
    rootEmptyState: ROOT_EMPTY_STATE,
    searchDraft,
    selectAlbumCard,
    selectArtistCard,
    setActiveView,
    showDuplicateSongsOnly,
    showLocalSongInFolder,
    songsEmptyState,
    status,
    supported,
    healthSummary,
    totalFolderLabel,
    totalTrackLabel,
    unsupportedEmptyState: UNSUPPORTED_EMPTY_STATE,
    updateSearchDraft,
    viewModes: LOCAL_LIBRARY_VIEW_MODES,
    showCurrentViewLoading,
    toggleHideDuplicateSongs,
    toggleShowDuplicateSongsOnly
  }
}

type NativeAudioDiagnosticsSnapshot = {
  activeMode?: AudioOutputMode
  backend: AudioOutputStatus['backend']
  bitDepthMismatch?: boolean
  bitPerfectStatus?: AudioOutputBitPerfectStatus
  channelMismatch?: boolean
  enabled: boolean
  errorCode?: string
  errorMessage?: string
  outputSampleRate?: number
  playbackState?: AudioOutputNativePlaybackState
  reason?: string
  requestedMode: AudioOutputMode
  sampleRateMismatch?: boolean
  sourceSampleRate?: number
}

function createLocalDiagnosticsCards(
  health: LocalLibraryHealthSummary,
  metadataCandidates: LocalLibraryMetadataCandidateSummary
): LocalMusicDiagnosticCard[] {
  const missingMetadataCount =
    health.missingCoverCount + health.missingDurationCount + health.missingTechnicalMetadataCount
  const duplicateDetail =
    health.duplicateGroupCount > 0
      ? `${health.duplicateGroupCount} 组重复，已隐藏 ${health.hiddenDuplicateTrackCount} 首`
      : '暂无重复歌曲分组'
  const metadataDetail =
    missingMetadataCount > 0
      ? `封面 ${health.missingCoverCount}，时长 ${health.missingDurationCount}，技术信息 ${health.missingTechnicalMetadataCount}`
      : duplicateDetail

  return [
    {
      detail: metadataDetail,
      id: 'library-health',
      label: '曲库健康',
      tone: missingMetadataCount > 0 || health.duplicateGroupCount > 0 ? 'warning' : 'success',
      value: `${health.trackCount} 首`
    },
    {
      detail: `最近 ${Math.round(LOCAL_LIBRARY_INBOX_WINDOW_MS / 86400000)} 天首次收录`,
      id: 'library-inbox',
      label: '新入库',
      tone: health.inboxTrackCount > 0 ? 'neutral' : 'success',
      value: `${health.inboxTrackCount} 首`
    },
    {
      detail: createMetadataCandidateDetail(metadataCandidates),
      id: 'metadata-candidates',
      label: '元数据候选',
      tone: metadataCandidates.pendingCount > 0 ? 'warning' : 'success',
      value: `${metadataCandidates.pendingCount} 项`
    }
  ]
}

function createMetadataCandidateDetail(summary: LocalLibraryMetadataCandidateSummary): string {
  if (summary.pendingCount === 0) {
    return '暂无待确认字段'
  }

  const fieldLabels: Record<keyof LocalLibraryMetadataCandidateSummary['byField'], string> = {
    album: '专辑',
    artist: '艺人',
    cover: '封面',
    duration: '时长',
    technical: '技术信息',
    title: '标题'
  }
  const topFields = Object.entries(summary.byField)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([field, count]) => `${fieldLabels[field as keyof typeof fieldLabels]} ${count}`)

  return topFields.length > 0 ? topFields.join('，') : '等待批量确认'
}

function createNativeAudioDiagnosticsKey(status: AudioOutputStatus): string {
  const diagnostics = status.nativePlaybackDiagnostics
  const error = status.nativePlaybackError

  return JSON.stringify({
    activeMode: status.activeMode,
    backend: status.backend,
    bitDepthMismatch: diagnostics?.bitDepthMismatch,
    bitPerfect: status.bitPerfect?.status ?? diagnostics?.bitPerfectStatus,
    channelMismatch: diagnostics?.channelMismatch,
    enabled: status.enabled,
    errorCode: error?.code,
    errorMessage: error?.nativeMessage,
    outputSampleRate: diagnostics?.outputSampleRate,
    playbackState: status.nativePlaybackState,
    reason: diagnostics?.reason ?? status.bitPerfect?.reason ?? status.reason,
    requestedMode: status.requestedMode,
    sampleRateMismatch: diagnostics?.sampleRateMismatch,
    sourceSampleRate: diagnostics?.sourceSampleRate
  })
}

function createNativeAudioDiagnosticsSnapshot(
  status: AudioOutputStatus
): NativeAudioDiagnosticsSnapshot {
  const diagnostics = status.nativePlaybackDiagnostics
  const error = status.nativePlaybackError

  return {
    activeMode: status.activeMode,
    backend: status.backend,
    bitDepthMismatch: diagnostics?.bitDepthMismatch,
    bitPerfectStatus: status.bitPerfect?.status ?? diagnostics?.bitPerfectStatus,
    channelMismatch: diagnostics?.channelMismatch,
    enabled: status.enabled,
    errorCode: error?.code,
    errorMessage: error?.nativeMessage,
    outputSampleRate: diagnostics?.outputSampleRate,
    playbackState: status.nativePlaybackState,
    reason: diagnostics?.reason ?? status.bitPerfect?.reason ?? status.reason,
    requestedMode: status.requestedMode,
    sampleRateMismatch: diagnostics?.sampleRateMismatch,
    sourceSampleRate: diagnostics?.sourceSampleRate
  }
}

function createNativeAudioDiagnosticCards(
  snapshot: NativeAudioDiagnosticsSnapshot
): LocalMusicDiagnosticCard[] {
  const mismatchCount = [
    snapshot.sampleRateMismatch,
    snapshot.channelMismatch,
    snapshot.bitDepthMismatch
  ].filter(Boolean).length
  const isError = snapshot.playbackState === 'error' || Boolean(snapshot.errorCode)
  const playbackDetail = snapshot.errorCode
    ? `${snapshot.errorCode}${snapshot.errorMessage ? `：${snapshot.errorMessage}` : ''}`
    : `请求 ${formatAudioMode(snapshot.requestedMode)}，实际 ${formatAudioMode(snapshot.activeMode ?? snapshot.requestedMode)}`

  return [
    {
      detail: playbackDetail,
      id: 'native-output-state',
      label: '原生输出',
      tone: isError ? 'danger' : snapshot.enabled ? 'success' : 'neutral',
      value: snapshot.enabled
        ? formatNativePlaybackState(snapshot.playbackState)
        : formatAudioBackend(snapshot.backend)
    },
    {
      detail: createOutputClockDetail(snapshot),
      id: 'native-output-clock',
      label: '输出时钟',
      tone: mismatchCount > 0 ? 'warning' : 'success',
      value: snapshot.bitPerfectStatus
        ? formatBitPerfectStatus(snapshot.bitPerfectStatus)
        : mismatchCount > 0
          ? `${mismatchCount} 项偏差`
          : '未验证'
    }
  ]
}

function createOutputClockDetail(snapshot: NativeAudioDiagnosticsSnapshot): string {
  const sourceRate = snapshot.sourceSampleRate ? `${snapshot.sourceSampleRate} Hz` : '未知源'
  const outputRate = snapshot.outputSampleRate ? `${snapshot.outputSampleRate} Hz` : '未知输出'
  const mismatches: string[] = []
  if (snapshot.sampleRateMismatch) mismatches.push('采样率')
  if (snapshot.channelMismatch) mismatches.push('声道')
  if (snapshot.bitDepthMismatch) mismatches.push('位深')

  if (mismatches.length > 0) {
    return `${sourceRate} → ${outputRate}，${mismatches.join('、')}不一致`
  }

  return snapshot.reason || `${sourceRate} → ${outputRate}`
}

function formatAudioMode(mode: AudioOutputMode): string {
  switch (mode) {
    case 'exclusive':
      return '真独占'
    case 'voicemeeter':
      return 'Voicemeeter'
    case 'shared':
      return '共享'
  }
}

function formatAudioBackend(backend: AudioOutputStatus['backend']): string {
  switch (backend) {
    case 'native':
      return '可用'
    case 'unavailable':
      return '不可用'
    case 'disabled':
      return '未启用'
  }
}

function formatNativePlaybackState(state: AudioOutputNativePlaybackState | undefined): string {
  switch (state) {
    case 'starting':
      return '启动中'
    case 'playing':
      return '播放中'
    case 'paused':
      return '已暂停'
    case 'stopped':
      return '已停止'
    case 'ended':
      return '已结束'
    case 'error':
      return '异常'
    case 'idle':
    case undefined:
      return '待机'
  }
}

function formatBitPerfectStatus(status: AudioOutputBitPerfectStatus): string {
  switch (status) {
    case 'candidate':
      return '候选'
    case 'notCandidate':
      return '不满足'
    case 'unverified':
      return '未验证'
  }
}
