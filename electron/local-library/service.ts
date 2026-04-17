import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

import chokidar, { type FSWatcher } from 'chokidar'
import { parseFile } from 'music-metadata'

import type { Song } from '@/types/schemas'
import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryFolder,
  LocalLibraryPage,
  LocalLibraryScanStatus,
  LocalLibraryState,
  LocalLibrarySummaryQuery,
  LocalLibraryTrack,
  LocalLibraryTrackQuery
} from '@/types/localLibrary'
import { createLocalLibraryScanStatus, LOCAL_LIBRARY_SONG_ID_PREFIX } from '@/types/localLibrary'

import { LocalLibraryCoverManager } from './coverManager'
import { createFolderId, createTrackId, LocalLibraryRepository } from './repository'
import { createLocalMediaUrl } from './protocol'

type PersistedFolder = Omit<LocalLibraryFolder, 'songCount'>
type PersistedState = {
  folders: PersistedFolder[]
  tracks: Array<Omit<LocalLibraryTrack, 'coverHash'> & { coverHash?: string | null }>
}

type LegacyStoreShape = {
  get: <T>(key: string, defaultValue?: T) => T
}

type ParsedLocalTrackMetadata = {
  title: string | null
  artist: string | null
  album: string | null
  duration: number | null
  coverData?: Buffer | null
  coverFormat?: string | null
}

type LocalTrackMetadataReader = (filePath: string) => Promise<ParsedLocalTrackMetadata | null>
type LocalLibraryWatcherFactory = (folderPath: string) => FSWatcher
type PendingFolderChanges = {
  upsert: Set<string>
  remove: Set<string>
  requiresFullRescan: boolean
}

type StatusListener = (status: LocalLibraryScanStatus) => void
type UpdatedListener = (state: LocalLibraryState) => void

const LOCAL_LIBRARY_STORE_KEY = 'localLibraryState'
const AUDIO_FILE_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.m4a',
  '.ogg',
  '.wav',
  '.aac',
  '.ape',
  '.opus'
])
const WATCH_DEBOUNCE_MS = 1500

const StoreModule = require('electron-store') as {
  default?: new (options?: { projectName: string }) => LegacyStoreShape
}

const Store = StoreModule.default ?? (StoreModule as unknown as new () => LegacyStoreShape)

function createDefaultLegacyStore(): LegacyStoreShape {
  return new Store({ projectName: 'luo-music' })
}

function normalizeFolderPath(folderPath: string): string {
  return path.resolve(folderPath).replace(/[\\/]+$/, '')
}

function normalizeFilePath(filePath: string): string {
  return path.resolve(filePath)
}

function parseTrackDisplayName(fileName: string): { title: string; artist: string } {
  const stem = path.parse(fileName).name.trim()
  if (!stem) {
    return {
      title: '未知歌曲',
      artist: '未知艺术家'
    }
  }

  const parts = stem
    .split(' - ')
    .map(part => part.trim())
    .filter(Boolean)

  if (parts.length >= 2) {
    return {
      artist: parts[0] ?? '未知艺术家',
      title: parts.slice(1).join(' - ')
    }
  }

  return {
    title: stem,
    artist: '未知艺术家'
  }
}

function createDefaultWatcher(folderPath: string): FSWatcher {
  return chokidar.watch(folderPath, {
    ignored: /(^|[/\\])\../,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1200,
      pollInterval: 100
    }
  })
}

async function readTrackMetadata(filePath: string): Promise<ParsedLocalTrackMetadata | null> {
  try {
    const metadata = await parseFile(filePath)
    const picture = metadata.common.picture?.[0]
    const title =
      typeof metadata.common.title === 'string' && metadata.common.title.trim().length > 0
        ? metadata.common.title.trim()
        : null
    const artist =
      typeof metadata.common.artist === 'string' && metadata.common.artist.trim().length > 0
        ? metadata.common.artist.trim()
        : null
    const album =
      typeof metadata.common.album === 'string' && metadata.common.album.trim().length > 0
        ? metadata.common.album.trim()
        : null
    const duration =
      typeof metadata.format.duration === 'number' && Number.isFinite(metadata.format.duration)
        ? Math.max(0, Math.round(metadata.format.duration * 1000))
        : null

    if (!title && !artist && !album && duration === null && !picture) {
      return null
    }

    return {
      title,
      artist,
      album,
      duration,
      coverData: picture?.data ? Buffer.from(picture.data) : null,
      coverFormat: picture?.format ?? null
    }
  } catch {
    return null
  }
}

function createTrackSong(
  trackId: string,
  title: string,
  artist: string,
  album: string,
  filePath: string,
  duration: number,
  coverHash: string | null
): Song {
  return {
    id: trackId,
    name: title,
    artists: [{ id: `local-artist:${artist}`, name: artist }],
    album: {
      id: `local-album:${album}`,
      name: album,
      picUrl: ''
    },
    duration,
    mvid: 0,
    platform: 'netease',
    originalId: trackId,
    url: createLocalMediaUrl(filePath),
    extra: {
      localSource: true,
      localFilePath: filePath,
      localAlbum: album,
      localCoverHash: coverHash
    }
  }
}

function isLegacyState(value: unknown): value is PersistedState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<PersistedState>
  return Array.isArray(candidate.folders) && Array.isArray(candidate.tracks)
}

function createEmptyPendingFolderChanges(): PendingFolderChanges {
  return {
    upsert: new Set<string>(),
    remove: new Set<string>(),
    requiresFullRescan: false
  }
}

export class LocalLibraryService {
  private readonly repository: LocalLibraryRepository
  private readonly legacyStore: LegacyStoreShape
  private readonly metadataReader: LocalTrackMetadataReader
  private readonly watcherFactory: LocalLibraryWatcherFactory
  private readonly coverManager: LocalLibraryCoverManager
  private readonly statusListeners = new Set<StatusListener>()
  private readonly updatedListeners = new Set<UpdatedListener>()
  private readonly watchers = new Map<string, FSWatcher>()
  private readonly watchTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly pendingFolderChanges = new Map<string, PendingFolderChanges>()
  private scanPromise: Promise<LocalLibraryState> | null = null
  private currentStatus = createLocalLibraryScanStatus()
  private disposed = false

  constructor(
    repository: LocalLibraryRepository = new LocalLibraryRepository(),
    legacyStore: LegacyStoreShape = createDefaultLegacyStore(),
    metadataReader: LocalTrackMetadataReader = readTrackMetadata,
    watcherFactory: LocalLibraryWatcherFactory = createDefaultWatcher,
    coverManager: LocalLibraryCoverManager = new LocalLibraryCoverManager()
  ) {
    this.repository = repository
    this.legacyStore = legacyStore
    this.metadataReader = metadataReader
    this.watcherFactory = watcherFactory
    this.coverManager = coverManager
    this.migrateLegacyStateIfNeeded()
    this.startWatchingExistingFolders()
    this.currentStatus = this.createIdleStatus()
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  onUpdated(listener: UpdatedListener): () => void {
    this.updatedListeners.add(listener)
    return () => {
      this.updatedListeners.delete(listener)
    }
  }

  getState(): LocalLibraryState {
    if (this.disposed) {
      return {
        supported: true,
        folders: [],
        tracks: [],
        status: this.currentStatus
      }
    }

    return {
      supported: true,
      folders: this.repository.listFolders(),
      tracks: [],
      status: this.currentStatus
    }
  }

  async getTracksPage(
    query: LocalLibraryTrackQuery = {}
  ): Promise<LocalLibraryPage<LocalLibraryTrack>> {
    return this.repository.getTracksPage(query)
  }

  async getArtistsPage(
    query: LocalLibrarySummaryQuery = {}
  ): Promise<LocalLibraryPage<LocalLibraryArtistSummary>> {
    return this.repository.getArtistsPage(query)
  }

  async getAlbumsPage(
    query: LocalLibrarySummaryQuery = {}
  ): Promise<LocalLibraryPage<LocalLibraryAlbumSummary>> {
    return this.repository.getAlbumsPage(query)
  }

  async getCoverDataUrl(coverHash: string): Promise<string | null> {
    return this.coverManager.getCoverDataUrl(coverHash)
  }

  async addFolder(folderPath: string): Promise<LocalLibraryState> {
    if (this.scanPromise) {
      await this.scanPromise
    }

    const resolvedPath = normalizeFolderPath(folderPath)
    const folderStats = await stat(resolvedPath)
    if (!folderStats.isDirectory()) {
      throw new Error('请选择有效的本地音乐文件夹')
    }

    const existingFolder = this.repository.findFolderByPath(resolvedPath)
    if (existingFolder) {
      this.setStatus(
        this.createIdleStatus({
          message: '该文件夹已在本地音乐列表中'
        })
      )
      return this.getState()
    }

    const nextFolder: PersistedFolder = {
      id: createFolderId(resolvedPath),
      path: resolvedPath,
      name: path.basename(resolvedPath) || resolvedPath,
      enabled: true,
      createdAt: Date.now(),
      lastScannedAt: null
    }

    this.repository.upsertFolder(nextFolder)
    this.startWatchingFolder(nextFolder)
    this.emitUpdated()

    return this.performScanForFolders([nextFolder], '正在扫描本地音乐...')
  }

  async removeFolder(folderId: string): Promise<LocalLibraryState> {
    if (this.scanPromise) {
      await this.scanPromise
    }

    this.stopWatchingFolder(folderId)
    this.pendingFolderChanges.delete(folderId)
    this.repository.removeFolder(folderId)
    this.setStatus(this.createIdleStatus())
    this.emitUpdated()
    void this.cleanupUnusedCovers()

    return this.getState()
  }

  async setFolderEnabled(folderId: string, enabled: boolean): Promise<LocalLibraryState> {
    if (this.scanPromise) {
      await this.scanPromise
    }

    const folder = this.repository.listFolders().find(entry => entry.id === folderId)
    if (!folder) {
      throw new Error('未找到对应的本地音乐文件夹')
    }

    if (folder.enabled === enabled) {
      return this.getState()
    }

    this.repository.setFolderEnabled(folderId, enabled)

    if (!enabled) {
      this.stopWatchingFolder(folderId)
      this.setStatus(
        this.createIdleStatus({
          message: '已停用本地音乐文件夹'
        })
      )
      this.emitUpdated()
      return this.getState()
    }

    const enabledFolder: PersistedFolder = {
      id: folder.id,
      path: folder.path,
      name: folder.name,
      enabled: true,
      createdAt: folder.createdAt,
      lastScannedAt: folder.lastScannedAt
    }
    this.startWatchingFolder(enabledFolder)

    return this.performScanForFolders([enabledFolder], `正在启用 ${enabledFolder.name}`)
  }

  async scan(): Promise<LocalLibraryState> {
    if (this.scanPromise) {
      return this.scanPromise
    }

    this.scanPromise = this.performScan().finally(() => {
      this.scanPromise = null
    })

    return this.scanPromise
  }

  dispose(): void {
    this.disposed = true

    for (const timer of this.watchTimers.values()) {
      clearTimeout(timer)
    }
    this.watchTimers.clear()

    for (const watcher of this.watchers.values()) {
      void watcher.close()
    }
    this.watchers.clear()
    this.pendingFolderChanges.clear()
  }

  private migrateLegacyStateIfNeeded(): void {
    if (this.repository.hasAnyFolder()) {
      return
    }

    const legacyState = this.legacyStore.get<unknown>(LOCAL_LIBRARY_STORE_KEY, undefined)
    if (!isLegacyState(legacyState)) {
      return
    }

    for (const folder of legacyState.folders) {
      this.repository.upsertFolder(folder)
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

    for (const folder of legacyState.folders) {
      this.repository.replaceFolderTracks(folder.id, tracksByFolder.get(folder.id) ?? [])
    }
  }

  private startWatchingExistingFolders(): void {
    for (const folder of this.repository.listEnabledFolders()) {
      this.startWatchingFolder(folder)
    }
  }

  private startWatchingFolder(folder: PersistedFolder): void {
    if (this.watchers.has(folder.id)) {
      return
    }

    const watcher = this.watcherFactory(folder.path)
    watcher.on('add', filePath => {
      this.queueFolderUpsert(folder.id, filePath)
    })
    watcher.on('change', filePath => {
      this.queueFolderUpsert(folder.id, filePath)
    })
    watcher.on('unlink', filePath => {
      this.queueFolderRemoval(folder.id, filePath)
    })
    watcher.on('addDir', () => {
      this.queueFolderFullRescan(folder.id)
    })
    watcher.on('unlinkDir', () => {
      this.queueFolderFullRescan(folder.id)
    })

    this.watchers.set(folder.id, watcher)
  }

  private stopWatchingFolder(folderId: string): void {
    const timer = this.watchTimers.get(folderId)
    if (timer) {
      clearTimeout(timer)
      this.watchTimers.delete(folderId)
    }

    const watcher = this.watchers.get(folderId)
    if (watcher) {
      void watcher.close()
      this.watchers.delete(folderId)
    }
  }

  private queueFolderUpsert(folderId: string, filePath: string): void {
    if (!this.isAudioFile(filePath)) {
      return
    }

    const pending = this.pendingFolderChanges.get(folderId) ?? createEmptyPendingFolderChanges()
    pending.remove.delete(normalizeFilePath(filePath))
    pending.upsert.add(normalizeFilePath(filePath))
    this.pendingFolderChanges.set(folderId, pending)
    this.scheduleFolderSync(folderId)
  }

  private queueFolderRemoval(folderId: string, filePath: string): void {
    if (!this.isAudioFile(filePath)) {
      return
    }

    const pending = this.pendingFolderChanges.get(folderId) ?? createEmptyPendingFolderChanges()
    const normalizedFilePath = normalizeFilePath(filePath)
    pending.upsert.delete(normalizedFilePath)
    pending.remove.add(normalizedFilePath)
    this.pendingFolderChanges.set(folderId, pending)
    this.scheduleFolderSync(folderId)
  }

  private queueFolderFullRescan(folderId: string): void {
    const pending = this.pendingFolderChanges.get(folderId) ?? createEmptyPendingFolderChanges()
    pending.requiresFullRescan = true
    pending.upsert.clear()
    pending.remove.clear()
    this.pendingFolderChanges.set(folderId, pending)
    this.scheduleFolderSync(folderId)
  }

  private scheduleFolderSync(folderId: string): void {
    const existingTimer = this.watchTimers.get(folderId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      this.watchTimers.delete(folderId)
      void this.flushFolderChanges(folderId).catch(error => {
        if (this.disposed) {
          return
        }

        const message = error instanceof Error ? error.message : '同步本地音乐失败'
        this.setStatus(
          createLocalLibraryScanStatus({
            phase: 'error',
            finishedAt: Date.now(),
            currentFolder: this.currentStatus.currentFolder,
            discoveredTracks: this.currentStatus.discoveredTracks,
            message
          })
        )
      })
    }, WATCH_DEBOUNCE_MS)

    if (
      typeof timer === 'object' &&
      timer !== null &&
      'unref' in timer &&
      typeof timer.unref === 'function'
    ) {
      timer.unref()
    }

    this.watchTimers.set(folderId, timer)
  }

  private async flushFolderChanges(folderId: string): Promise<void> {
    if (this.disposed) {
      return
    }

    const pending = this.pendingFolderChanges.get(folderId)
    if (!pending) {
      return
    }

    this.pendingFolderChanges.delete(folderId)

    if (pending.requiresFullRescan) {
      await this.rescanFolder(folderId)
      return
    }

    if (pending.upsert.size === 0 && pending.remove.size === 0) {
      return
    }

    await this.applyIncrementalFolderChanges(folderId, pending)
  }

  private async rescanFolder(folderId: string): Promise<void> {
    if (this.disposed) {
      return
    }

    if (this.scanPromise) {
      await this.scanPromise
    }

    if (this.disposed) {
      return
    }

    const folder = this.repository.listEnabledFolders().find(entry => entry.id === folderId)
    if (!folder) {
      return
    }

    this.scanPromise = this.performScanForFolders(
      [folder],
      '检测到本地文件夹结构变动，正在重新扫描...'
    ).finally(() => {
      this.scanPromise = null
    })

    await this.scanPromise
  }

  private async applyIncrementalFolderChanges(
    folderId: string,
    pending: PendingFolderChanges
  ): Promise<void> {
    if (this.disposed) {
      return
    }

    if (this.scanPromise) {
      await this.scanPromise
    }

    if (this.disposed) {
      return
    }

    const folder = this.repository.listEnabledFolders().find(entry => entry.id === folderId)
    if (!folder) {
      return
    }

    this.scanPromise = this.performIncrementalFolderUpdate(folder, pending).finally(() => {
      this.scanPromise = null
    })

    await this.scanPromise
  }

  private async performScan(): Promise<LocalLibraryState> {
    if (this.disposed) {
      return this.getState()
    }

    const enabledFolders = this.repository.listEnabledFolders()

    if (enabledFolders.length === 0) {
      this.setStatus(this.createIdleStatus())
      return this.getState()
    }

    return this.performScanForFolders(enabledFolders, '正在扫描本地音乐...')
  }

  private async performScanForFolders(
    folders: PersistedFolder[],
    initialMessage: string
  ): Promise<LocalLibraryState> {
    if (this.disposed) {
      return this.getState()
    }

    const startedAt = Date.now()
    this.setStatus(
      createLocalLibraryScanStatus({
        phase: 'scanning',
        startedAt,
        message: initialMessage
      })
    )

    let scannedFolders = 0
    let scannedFiles = 0

    try {
      for (const folder of folders) {
        if (this.disposed) {
          return this.getState()
        }

        scannedFolders += 1
        this.patchStatus({
          scannedFolders,
          currentFolder: folder.path,
          message: `正在扫描 ${folder.name}`
        })

        const folderTracks = await this.scanFolder(folder, nextScannedFiles => {
          if (this.disposed) {
            return
          }

          scannedFiles = nextScannedFiles
          this.patchStatus({
            scannedFiles,
            currentFolder: folder.path,
            message: `正在分析 ${folder.name} 中的音频文件`
          })
        })

        if (this.disposed) {
          return this.getState()
        }

        this.repository.replaceFolderTracks(folder.id, folderTracks)
        this.repository.updateFolderLastScannedAt(folder.id, Date.now())
        this.patchStatus({
          discoveredTracks: this.repository.getTrackCount()
        })
      }

      await this.cleanupUnusedCovers()
      if (this.disposed) {
        return this.getState()
      }

      this.setStatus(
        this.createIdleStatus({
          startedAt,
          finishedAt: Date.now(),
          scannedFolders,
          scannedFiles,
          discoveredTracks: this.repository.getTrackCount()
        })
      )
      this.emitUpdated()

      return this.getState()
    } catch (error) {
      const message = error instanceof Error ? error.message : '扫描本地音乐失败'
      this.setStatus(
        createLocalLibraryScanStatus({
          phase: 'error',
          startedAt,
          finishedAt: Date.now(),
          scannedFolders,
          scannedFiles,
          discoveredTracks: this.repository.getTrackCount(),
          currentFolder: this.currentStatus.currentFolder,
          message
        })
      )
      throw error
    }
  }

  private async performIncrementalFolderUpdate(
    folder: PersistedFolder,
    pending: PendingFolderChanges
  ): Promise<LocalLibraryState> {
    if (this.disposed) {
      return this.getState()
    }

    const startedAt = Date.now()
    this.setStatus(
      createLocalLibraryScanStatus({
        phase: 'scanning',
        startedAt,
        scannedFolders: 1,
        currentFolder: folder.path,
        message: '检测到本地文件变动，正在同步...'
      })
    )

    let scannedFiles = 0

    try {
      const upsertedTracks: LocalLibraryTrack[] = []
      for (const filePath of pending.upsert) {
        if (this.disposed) {
          return this.getState()
        }

        scannedFiles += 1
        this.patchStatus({
          scannedFiles,
          currentFolder: folder.path,
          message: `正在同步 ${folder.name} 中的变动文件`
        })
        const track = await this.scanSingleFile(folder, filePath)
        if (track) {
          upsertedTracks.push(track)
        }
      }

      if (this.disposed) {
        return this.getState()
      }

      this.repository.upsertTracks(upsertedTracks)
      this.repository.deleteTracksByFilePaths([...pending.remove])
      this.repository.updateFolderLastScannedAt(folder.id, Date.now())
      await this.cleanupUnusedCovers()
      if (this.disposed) {
        return this.getState()
      }

      this.setStatus(
        this.createIdleStatus({
          startedAt,
          finishedAt: Date.now(),
          scannedFolders: 1,
          scannedFiles,
          discoveredTracks: this.repository.getTrackCount(),
          message: '已同步本地音乐变动'
        })
      )
      this.emitUpdated()
      return this.getState()
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步本地音乐失败'
      this.setStatus(
        createLocalLibraryScanStatus({
          phase: 'error',
          startedAt,
          finishedAt: Date.now(),
          scannedFolders: 1,
          scannedFiles,
          discoveredTracks: this.repository.getTrackCount(),
          currentFolder: folder.path,
          message
        })
      )
      throw error
    }
  }

  private async scanFolder(
    folder: PersistedFolder,
    onProgress: (nextScannedFiles: number) => void
  ): Promise<LocalLibraryTrack[]> {
    if (this.disposed) {
      return []
    }

    const filePaths = await this.collectAudioFiles(folder.path)
    const tracks: LocalLibraryTrack[] = []
    let scannedFiles = this.currentStatus.scannedFiles

    for (const filePath of filePaths) {
      if (this.disposed) {
        return tracks
      }

      scannedFiles += 1
      onProgress(scannedFiles)

      const track = await this.scanSingleFile(folder, filePath)
      if (track) {
        tracks.push(track)
      }
    }

    return tracks
  }

  private async scanSingleFile(
    folder: PersistedFolder,
    filePath: string
  ): Promise<LocalLibraryTrack | null> {
    if (this.disposed) {
      return null
    }

    const normalizedFilePath = normalizeFilePath(filePath)
    if (!this.isAudioFile(normalizedFilePath)) {
      return null
    }

    let fileStats
    try {
      fileStats = await stat(normalizedFilePath)
    } catch {
      return null
    }

    if (!fileStats.isFile()) {
      return null
    }

    const normalizedModifiedAt = Math.round(fileStats.mtimeMs)
    const existingTrack = this.repository.findTrackByFilePath(normalizedFilePath)

    if (
      existingTrack &&
      existingTrack.modifiedAt === normalizedModifiedAt &&
      existingTrack.fileSize === fileStats.size
    ) {
      return existingTrack
    }

    const parsedName = parseTrackDisplayName(path.basename(normalizedFilePath))
    const metadata = await this.metadataReader(normalizedFilePath)
    const title = metadata?.title ?? parsedName.title
    const artist = metadata?.artist ?? parsedName.artist
    const album =
      metadata?.album ??
      path.basename(path.dirname(normalizedFilePath)) ??
      folder.name ??
      '本地音乐'
    const duration = metadata?.duration ?? 0
    const coverHash = await this.resolveCoverHash(metadata, existingTrack)
    const trackId = createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, normalizedFilePath)

    return {
      id: trackId,
      folderId: folder.id,
      filePath: normalizedFilePath,
      fileName: path.basename(normalizedFilePath),
      title,
      artist,
      album,
      duration,
      fileSize: fileStats.size,
      modifiedAt: normalizedModifiedAt,
      coverHash,
      song: createTrackSong(trackId, title, artist, album, normalizedFilePath, duration, coverHash)
    }
  }

  private async resolveCoverHash(
    metadata: ParsedLocalTrackMetadata | null,
    existingTrack: LocalLibraryTrack | null
  ): Promise<string | null> {
    if (!metadata) {
      return existingTrack?.coverHash ?? null
    }

    if (Object.prototype.hasOwnProperty.call(metadata, 'coverData')) {
      if (metadata.coverData) {
        return this.coverManager.saveEmbeddedCover(metadata.coverData, metadata.coverFormat)
      }

      return null
    }

    return existingTrack?.coverHash ?? null
  }

  private async collectAudioFiles(rootPath: string): Promise<string[]> {
    const queue = [rootPath]
    const files: string[] = []

    while (queue.length > 0) {
      const currentPath = queue.pop()
      if (!currentPath) {
        continue
      }

      const entries = await readdir(currentPath, {
        withFileTypes: true
      })

      for (const entry of entries) {
        if (entry.isSymbolicLink()) {
          continue
        }

        const entryPath = path.join(currentPath, entry.name)

        if (entry.isDirectory()) {
          queue.push(entryPath)
          continue
        }

        if (
          entry.isFile() &&
          AUDIO_FILE_EXTENSIONS.has(path.extname(entry.name).toLocaleLowerCase())
        ) {
          files.push(entryPath)
        }
      }
    }

    return files
  }

  private isAudioFile(filePath: string): boolean {
    return AUDIO_FILE_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase())
  }

  private createIdleStatus(
    overrides: Partial<LocalLibraryScanStatus> = {}
  ): LocalLibraryScanStatus {
    const folders = this.repository.listFolders()
    const enabledFolderCount = folders.filter(folder => folder.enabled).length
    const discoveredTracks = this.repository.getTrackCount()
    const lastScannedAt = folders.reduce<number | null>((latest, folder) => {
      if (!folder.lastScannedAt) {
        return latest
      }

      return latest === null ? folder.lastScannedAt : Math.max(latest, folder.lastScannedAt)
    }, null)

    let message = '还没有添加本地音乐文件夹'
    if (folders.length > 0 && enabledFolderCount === 0) {
      message = '已停用所有本地音乐文件夹'
    } else if (discoveredTracks > 0) {
      message = `已收录 ${discoveredTracks} 首本地歌曲`
    } else if (enabledFolderCount > 0) {
      message = '当前文件夹内还没有识别到本地音频文件'
    }

    return createLocalLibraryScanStatus({
      phase: 'idle',
      discoveredTracks,
      finishedAt: lastScannedAt,
      message,
      ...overrides
    })
  }

  private patchStatus(partialStatus: Partial<LocalLibraryScanStatus>): void {
    this.setStatus({
      ...this.currentStatus,
      ...partialStatus
    })
  }

  private setStatus(nextStatus: LocalLibraryScanStatus): void {
    this.currentStatus = nextStatus
    for (const listener of this.statusListeners) {
      listener(nextStatus)
    }
  }

  private emitUpdated(): void {
    const nextState = this.getState()
    for (const listener of this.updatedListeners) {
      listener(nextState)
    }
  }

  private async cleanupUnusedCovers(): Promise<void> {
    if (this.disposed) {
      return
    }

    const usedHashes = new Set(
      this.repository
        .listTracks()
        .map(track => track.coverHash)
        .filter(
          (coverHash): coverHash is string => typeof coverHash === 'string' && coverHash.length > 0
        )
    )

    await this.coverManager.cleanupUnusedCovers(usedHashes)
  }
}

export const localLibraryService = new LocalLibraryService()
