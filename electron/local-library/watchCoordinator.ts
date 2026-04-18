import type { PersistedFolder } from './repository.types'
import {
  createEmptyPendingFolderChanges,
  type LocalLibraryWatcherFactory,
  type PendingFolderChanges
} from './service.helpers'

type LocalLibraryWatchCoordinatorOptions = {
  debounceMs: number
  isAudioFile: (filePath: string) => boolean
  normalizeFilePath: (filePath: string) => string
  onError: (error: unknown) => void
  onFlush: (folderId: string, pending: PendingFolderChanges) => Promise<void>
  watcherFactory: LocalLibraryWatcherFactory
}

export class LocalLibraryWatchCoordinator {
  private readonly watchers = new Map<string, ReturnType<LocalLibraryWatcherFactory>>()
  private readonly watchTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly pendingFolderChanges = new Map<string, PendingFolderChanges>()
  private readonly flushPromises = new Map<string, Promise<void>>()
  private disposed = false

  constructor(private readonly options: LocalLibraryWatchCoordinatorOptions) {}

  startWatchingFolders(folders: PersistedFolder[]): void {
    for (const folder of folders) {
      this.startWatchingFolder(folder)
    }
  }

  startWatchingFolder(folder: PersistedFolder): void {
    if (this.disposed) {
      return
    }

    if (this.watchers.has(folder.id)) {
      return
    }

    const watcher = this.options.watcherFactory(folder.path)
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

  async stopWatchingFolder(folderId: string): Promise<void> {
    const timer = this.watchTimers.get(folderId)
    if (timer) {
      clearTimeout(timer)
      this.watchTimers.delete(folderId)
    }

    const watcher = this.watchers.get(folderId)
    if (watcher) {
      await Promise.resolve(watcher.close()).catch(this.options.onError)
      this.watchers.delete(folderId)
    }

    this.pendingFolderChanges.delete(folderId)

    const inflightFlush = this.flushPromises.get(folderId)
    if (inflightFlush) {
      await inflightFlush.catch(this.options.onError)
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true

    for (const timer of this.watchTimers.values()) {
      clearTimeout(timer)
    }
    this.watchTimers.clear()

    const watcherClosePromises = [...this.watchers.values()].map(watcher =>
      Promise.resolve(watcher.close()).catch(this.options.onError)
    )
    const inflightFlushes = [...this.flushPromises.values()].map(flush =>
      flush.catch(this.options.onError)
    )

    this.watchers.clear()
    this.pendingFolderChanges.clear()
    await Promise.all([...watcherClosePromises, ...inflightFlushes])
    this.flushPromises.clear()
  }

  private queueFolderUpsert(folderId: string, filePath: string): void {
    if (this.disposed) {
      return
    }

    if (!this.options.isAudioFile(filePath)) {
      return
    }

    const pending = this.pendingFolderChanges.get(folderId) ?? createEmptyPendingFolderChanges()
    const normalizedFilePath = this.options.normalizeFilePath(filePath)
    pending.remove.delete(normalizedFilePath)
    pending.upsert.add(normalizedFilePath)
    this.pendingFolderChanges.set(folderId, pending)
    this.scheduleFolderSync(folderId)
  }

  private queueFolderRemoval(folderId: string, filePath: string): void {
    if (this.disposed) {
      return
    }

    if (!this.options.isAudioFile(filePath)) {
      return
    }

    const pending = this.pendingFolderChanges.get(folderId) ?? createEmptyPendingFolderChanges()
    const normalizedFilePath = this.options.normalizeFilePath(filePath)
    pending.upsert.delete(normalizedFilePath)
    pending.remove.add(normalizedFilePath)
    this.pendingFolderChanges.set(folderId, pending)
    this.scheduleFolderSync(folderId)
  }

  private queueFolderFullRescan(folderId: string): void {
    if (this.disposed) {
      return
    }

    const pending = this.pendingFolderChanges.get(folderId) ?? createEmptyPendingFolderChanges()
    pending.requiresFullRescan = true
    pending.upsert.clear()
    pending.remove.clear()
    this.pendingFolderChanges.set(folderId, pending)
    this.scheduleFolderSync(folderId)
  }

  private scheduleFolderSync(folderId: string): void {
    if (this.disposed) {
      return
    }

    const existingTimer = this.watchTimers.get(folderId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      if (this.disposed) {
        return
      }

      this.watchTimers.delete(folderId)
      const queuedFlush = (this.flushPromises.get(folderId) ?? Promise.resolve())
        .then(() => this.flushFolderChanges(folderId))
        .catch(this.options.onError)
        .finally(() => {
          if (this.flushPromises.get(folderId) === queuedFlush) {
            this.flushPromises.delete(folderId)
          }
        })

      this.flushPromises.set(folderId, queuedFlush)
    }, this.options.debounceMs)

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
    const pending = this.pendingFolderChanges.get(folderId)
    if (!pending) {
      return
    }

    await this.options.onFlush(folderId, pending)
    this.pendingFolderChanges.delete(folderId)
  }
}
