import type { LocalLibraryScanStatus, LocalLibraryState } from '@/types/localLibrary'

type StatusListener = (status: LocalLibraryScanStatus) => void
type UpdatedListener = (state: LocalLibraryState) => void

export class LocalLibraryEventHub {
  private readonly statusListeners = new Set<StatusListener>()
  private readonly updatedListeners = new Set<UpdatedListener>()

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

  emitStatus(status: LocalLibraryScanStatus): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status)
      } catch (error) {
        console.error('[LocalLibraryEventHub] Status listener failed:', error)
      }
    }
  }

  emitUpdated(state: LocalLibraryState): void {
    for (const listener of this.updatedListeners) {
      try {
        listener(state)
      } catch (error) {
        console.error('[LocalLibraryEventHub] Update listener failed:', error)
      }
    }
  }
}
