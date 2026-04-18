import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryPage,
  LocalLibraryScanStatus,
  LocalLibraryState,
  LocalLibrarySummaryQuery,
  LocalLibraryTrack,
  LocalLibraryTrackQuery
} from '@/types/localLibrary'
import { createLocalLibraryScanStatus } from '@/types/localLibrary'

import { LocalLibraryCoverManager } from './coverManager'
import { LocalLibraryEventHub } from './eventHub'
import { migrateLegacyLocalLibraryStateIfNeeded } from './migration'
import { configureLocalMediaRootsResolver } from './protocol'
import { createFolderId, LocalLibraryRepository } from './repository'
import type { PersistedFolder } from './repository.types'
import { LocalLibraryScanEngine } from './scanEngine'
import {
  createDefaultLegacyStore,
  createDefaultWatcher,
  isAudioFile,
  normalizeFilePath,
  normalizeFolderPath,
  readTrackMetadata,
  requiresFullDurationParse,
  resolveFileStats,
  type LegacyStoreShape,
  type LocalLibraryWatcherFactory,
  type LocalTrackMetadataReader,
  type PendingFolderChanges
} from './service.helpers'
import { createIdleLocalLibraryStatus, createLocalLibraryErrorStatus } from './statusPolicy'
import { LocalLibraryWatchCoordinator } from './watchCoordinator'

const LOCAL_LIBRARY_STORE_KEY = 'localLibraryState'
const WATCH_DEBOUNCE_MS = 1500

export class LocalLibraryService {
  private readonly eventHub = new LocalLibraryEventHub()
  private readonly scanEngine: LocalLibraryScanEngine
  private readonly watchCoordinator: LocalLibraryWatchCoordinator
  private readonly repository: LocalLibraryRepository
  private readonly legacyStore: LegacyStoreShape
  private readonly metadataReader: LocalTrackMetadataReader
  private readonly watcherFactory: LocalLibraryWatcherFactory
  private readonly coverManager: LocalLibraryCoverManager
  private readonly durationRepairPromises = new Map<string, Promise<void>>()
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
    configureLocalMediaRootsResolver(() =>
      this.repository.listEnabledFolders().map(folder => folder.path)
    )
    this.scanEngine = new LocalLibraryScanEngine({
      coverManager: this.coverManager,
      isDisposed: () => this.disposed,
      metadataReader: this.metadataReader,
      repository: this.repository
    })
    this.watchCoordinator = new LocalLibraryWatchCoordinator({
      debounceMs: WATCH_DEBOUNCE_MS,
      isAudioFile,
      normalizeFilePath,
      onError: error => {
        if (this.disposed) {
          return
        }

        const message = error instanceof Error ? error.message : '同步本地音乐失败'
        this.setStatus(
          createLocalLibraryErrorStatus(
            this.currentStatus,
            this.currentStatus.discoveredTracks,
            message
          )
        )
      },
      onFlush: (folderId, pending) => this.handleQueuedFolderChanges(folderId, pending),
      watcherFactory: this.watcherFactory
    })
    migrateLegacyLocalLibraryStateIfNeeded(
      this.repository,
      this.legacyStore,
      LOCAL_LIBRARY_STORE_KEY
    )
    this.watchCoordinator.startWatchingFolders(this.repository.listEnabledFolders())
    this.currentStatus = this.createIdleStatus()
  }

  onStatusChange(listener: (status: LocalLibraryScanStatus) => void): () => void {
    return this.eventHub.onStatusChange(listener)
  }

  onUpdated(listener: (state: LocalLibraryState) => void): () => void {
    return this.eventHub.onUpdated(listener)
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
    const trackPage = this.repository.getTracksPage(query)
    this.scheduleMissingDurationRepair(trackPage.items)
    return trackPage
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
    const folderStats = await resolveFileStats(resolvedPath)
    if (!folderStats?.isDirectory()) {
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
      name: resolvedPath.split(/[\\/]/).pop() || resolvedPath,
      enabled: true,
      createdAt: Date.now(),
      lastScannedAt: null
    }

    this.repository.upsertFolder(nextFolder)
    this.watchCoordinator.startWatchingFolder(nextFolder)
    this.emitUpdated()

    return this.runExclusiveScan(() =>
      this.performScanForFolders([nextFolder], '正在扫描本地音乐...')
    )
  }

  async removeFolder(folderId: string): Promise<LocalLibraryState> {
    if (this.scanPromise) {
      await this.scanPromise
    }

    await this.watchCoordinator.stopWatchingFolder(folderId)
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
      await this.watchCoordinator.stopWatchingFolder(folderId)
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
    this.watchCoordinator.startWatchingFolder(enabledFolder)

    return this.runExclusiveScan(() =>
      this.performScanForFolders([enabledFolder], `正在启用 ${enabledFolder.name}`)
    )
  }

  async scan(): Promise<LocalLibraryState> {
    if (this.scanPromise) {
      return this.scanPromise
    }

    return this.runExclusiveScan(() => this.performScan())
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await this.watchCoordinator.dispose()
    this.repository.close()
  }

  private runExclusiveScan(task: () => Promise<LocalLibraryState>): Promise<LocalLibraryState> {
    this.scanPromise = task().finally(() => {
      this.scanPromise = null
    })

    return this.scanPromise
  }

  private async handleQueuedFolderChanges(
    folderId: string,
    pending: PendingFolderChanges
  ): Promise<void> {
    if (this.disposed) {
      return
    }

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

        const folderTracks = await this.scanEngine.scanFolder(
          folder,
          nextScannedFiles => {
            if (this.disposed) {
              return
            }

            scannedFiles = nextScannedFiles
            this.patchStatus({
              scannedFiles,
              currentFolder: folder.path,
              message: `正在分析 ${folder.name} 中的音频文件`
            })
          },
          this.currentStatus.scannedFiles
        )

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
        createLocalLibraryErrorStatus(
          this.currentStatus,
          this.repository.getTrackCount(),
          message,
          {
            startedAt,
            scannedFolders,
            scannedFiles
          }
        )
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
        const track = await this.scanEngine.scanSingleFile(folder, filePath)
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
        createLocalLibraryErrorStatus(
          this.currentStatus,
          this.repository.getTrackCount(),
          message,
          {
            startedAt,
            scannedFolders: 1,
            scannedFiles,
            currentFolder: folder.path
          }
        )
      )
      throw error
    }
  }

  private createIdleStatus(
    overrides: Partial<LocalLibraryScanStatus> = {}
  ): LocalLibraryScanStatus {
    return createIdleLocalLibraryStatus(
      this.repository.listFolders(),
      this.repository.getTrackCount(),
      overrides
    )
  }

  private patchStatus(partialStatus: Partial<LocalLibraryScanStatus>): void {
    this.setStatus({
      ...this.currentStatus,
      ...partialStatus
    })
  }

  private setStatus(nextStatus: LocalLibraryScanStatus): void {
    this.currentStatus = nextStatus
    this.eventHub.emitStatus(nextStatus)
  }

  private emitUpdated(): void {
    this.eventHub.emitUpdated(this.getState())
  }

  private async cleanupUnusedCovers(): Promise<void> {
    if (this.disposed) {
      return
    }

    const usedHashes = new Set(this.repository.listUsedCoverHashes())

    await this.coverManager.cleanupUnusedCovers(usedHashes)
  }

  private scheduleMissingDurationRepair(tracks: LocalLibraryTrack[]): void {
    for (const track of tracks) {
      if (!this.shouldRepairTrackDuration(track) || this.durationRepairPromises.has(track.id)) {
        continue
      }

      const repairPromise = this.repairTrackDuration(track)
        .catch(error => {
          if (!this.disposed) {
            console.warn('[LocalLibraryService] Failed to repair track duration:', error)
          }
        })
        .finally(() => {
          if (this.durationRepairPromises.get(track.id) === repairPromise) {
            this.durationRepairPromises.delete(track.id)
          }
        })

      this.durationRepairPromises.set(track.id, repairPromise)
    }
  }

  private shouldRepairTrackDuration(track: LocalLibraryTrack): boolean {
    return track.duration <= 0 && requiresFullDurationParse(track.filePath)
  }

  private async repairTrackDuration(track: LocalLibraryTrack): Promise<void> {
    if (this.disposed) {
      return
    }

    if (this.scanPromise) {
      await this.scanPromise
    }

    if (this.disposed) {
      return
    }

    const folder = this.repository.listEnabledFolders().find(entry => entry.id === track.folderId)
    if (!folder) {
      return
    }

    const repairedTrack = await this.scanEngine.scanSingleFile(folder, track.filePath, {
      forceMetadataRefresh: true
    })
    if (
      !repairedTrack ||
      repairedTrack.duration <= 0 ||
      repairedTrack.duration === track.duration
    ) {
      return
    }

    this.repository.upsertTracks([repairedTrack])
    this.emitUpdated()
  }
}

let localLibraryServiceInstance: LocalLibraryService | null = null

export function getLocalLibraryService(): LocalLibraryService {
  if (!localLibraryServiceInstance) {
    localLibraryServiceInstance = new LocalLibraryService()
  }

  return localLibraryServiceInstance
}

export async function disposeLocalLibraryService(): Promise<void> {
  if (!localLibraryServiceInstance) {
    return
  }

  const service = localLibraryServiceInstance
  localLibraryServiceInstance = null
  await service.dispose()
}
