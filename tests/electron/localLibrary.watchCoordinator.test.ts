import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LocalLibraryWatchCoordinator } from '../../electron/local-library/watchCoordinator'

function createWatcherHarness() {
  const listeners = new Map<string, Array<(filePath: string) => void>>()
  const watcher = {
    on: vi.fn((event: string, listener: (filePath: string) => void) => {
      const eventListeners = listeners.get(event) ?? []
      eventListeners.push(listener)
      listeners.set(event, eventListeners)
      return watcher
    }),
    close: vi.fn().mockResolvedValue(undefined)
  }

  return {
    watcher,
    emit(event: string, filePath: string) {
      for (const listener of listeners.get(event) ?? []) {
        listener(filePath)
      }
    }
  }
}

describe('LocalLibraryWatchCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('retains pending folder changes when a flush fails so a later flush can retry them', async () => {
    const watcherHarness = createWatcherHarness()
    const onFlush = vi
      .fn<(_: string, pending: { upsert: Set<string> }) => Promise<void>>()
      .mockRejectedValueOnce(new Error('db locked'))
      .mockResolvedValueOnce(undefined)

    const coordinator = new LocalLibraryWatchCoordinator({
      debounceMs: 10,
      isAudioFile: () => true,
      normalizeFilePath: filePath => filePath,
      onError: vi.fn(),
      onFlush,
      watcherFactory: () => watcherHarness.watcher as never
    })

    coordinator.startWatchingFolder({
      id: 'folder-1',
      path: 'D:\\Music',
      name: 'Music',
      enabled: true,
      createdAt: Date.now(),
      lastScannedAt: null
    })

    watcherHarness.emit('change', 'D:\\Music\\one.mp3')
    await vi.advanceTimersByTimeAsync(10)
    await Promise.resolve()

    watcherHarness.emit('change', 'D:\\Music\\two.mp3')
    await vi.advanceTimersByTimeAsync(10)
    await Promise.resolve()

    expect(onFlush).toHaveBeenCalledTimes(2)
    expect(onFlush.mock.calls[1]?.[1].upsert).toEqual(
      new Set(['D:\\Music\\one.mp3', 'D:\\Music\\two.mp3'])
    )

    await coordinator.dispose()
  })
})
