import { Disposable, DisposableStore } from '@/base/common/lifecycle/disposable'
import type { LyricEngine } from '@/utils/player/core/lyric'
import type { PlaybackErrorHandler } from '@/utils/player/modules/playbackErrorHandler'

import {
  createAudioEventHandler,
  type AudioEventCallbacks,
  type AudioEventHandler,
  type TimeUpdateConfig
} from './audioEvents'
import { createIpcHandlers, type IpcHandlers, type IpcHandlersDeps } from './ipcHandlers'
import {
  createPlaybackActions,
  type PlaybackActions,
  type PlaybackActionsDeps
} from './playbackActions'
import type { PlayerState } from './playerState'

export type CurrentLyricLine = {
  text: string
  trans: string
  roma: string
} | null

export type PlayerStoreOwner = {
  $dispose: () => void
}

export class PlayerStoreRuntime extends Disposable {
  private readonly resources = this.register(new DisposableStore())
  private audioEventHandler: AudioEventHandler | null = null
  private playbackActions: PlaybackActions | null = null
  private ipcHandlers: IpcHandlers | null = null
  private errorHandler: PlaybackErrorHandler | null = null
  private lyricEngine: LyricEngine | null = null
  private currentLyricLineProvider: (() => CurrentLyricLine) | null = null
  private stateSyncRegistered = false
  private stateSyncNotify: (() => void) | null = null
  private stateSyncTimer: ReturnType<typeof setTimeout> | null = null
  private lastStateSyncTime = 0

  setCurrentLyricLineProvider(provider: (() => CurrentLyricLine) | null): void {
    this.currentLyricLineProvider = provider
  }

  setLyricEngine(engine: LyricEngine | null): void {
    this.lyricEngine = engine
  }

  getLyricEngine(): LyricEngine | null {
    return this.lyricEngine
  }

  ensureErrorHandler(factory: () => PlaybackErrorHandler): PlaybackErrorHandler {
    if (!this.errorHandler) {
      this.errorHandler = factory()
    }

    return this.errorHandler
  }

  getErrorHandler(): PlaybackErrorHandler | null {
    return this.errorHandler
  }

  resetErrorHandler(): void {
    this.errorHandler?.reset()
  }

  ensurePlaybackActions(deps: PlaybackActionsDeps): PlaybackActions {
    if (!this.playbackActions) {
      this.playbackActions = createPlaybackActions(deps)
    }

    return this.playbackActions
  }

  configureAudioEventHandler(
    state: PlayerState,
    callbacks: AudioEventCallbacks,
    config: TimeUpdateConfig,
    platform?: {
      isElectron: () => boolean
      send: (channel: string, data: unknown) => void
    }
  ): AudioEventHandler {
    if (!this.audioEventHandler) {
      this.audioEventHandler = createAudioEventHandler(state, callbacks, platform)
      this.resources.add(this.audioEventHandler)
    } else {
      this.audioEventHandler.setCallbacks(callbacks)
    }

    this.audioEventHandler.init({
      ...config,
      getCurrentLyricLine: () => this.currentLyricLineProvider?.() ?? null
    })

    return this.audioEventHandler
  }

  setupIpcHandlers(deps: IpcHandlersDeps): IpcHandlers {
    if (!this.ipcHandlers) {
      this.ipcHandlers = createIpcHandlers(deps)
      this.resources.add(this.ipcHandlers)
    }

    this.ipcHandlers.setup()
    return this.ipcHandlers
  }

  ensureStateSync(
    register: (notify: () => void) => () => void,
    notify: () => void,
    interval: number
  ): void {
    if (this.stateSyncRegistered) {
      return
    }

    this.stateSyncNotify = notify

    const scheduleSync = () => {
      const now = Date.now()
      const elapsed = now - this.lastStateSyncTime

      if (elapsed >= interval) {
        this.flushStateSync()
        return
      }

      if (this.stateSyncTimer) {
        return
      }

      this.stateSyncTimer = setTimeout(
        () => {
          this.flushStateSync()
        },
        Math.max(0, interval - elapsed)
      )

      if (
        typeof this.stateSyncTimer === 'object' &&
        this.stateSyncTimer !== null &&
        'unref' in this.stateSyncTimer &&
        typeof this.stateSyncTimer.unref === 'function'
      ) {
        this.stateSyncTimer.unref()
      }
    }

    const unsubscribe = register(scheduleSync)
    this.stateSyncRegistered = true
    this.resources.add(
      Disposable.from(() => {
        this.stateSyncRegistered = false
        this.stateSyncNotify = null
        this.clearStateSyncTimer()
        unsubscribe()
      })
    )
  }

  teardownIpcHandlers(): void {
    this.ipcHandlers?.teardown()
  }

  reset(): void {
    // Windows平台：验证资源清理状态，防止内存泄漏
    if (this.audioEventHandler && this.resources.size > 0) {
      console.warn('[PlayerStoreRuntime] AudioEventHandler not disposed before reset')
    }
    if (this.ipcHandlers && this.resources.size > 0) {
      console.warn('[PlayerStoreRuntime] IpcHandlers not disposed before reset')
    }
    if (this.playbackActions && this.resources.size > 0) {
      console.warn('[PlayerStoreRuntime] PlaybackActions not disposed before reset')
    }

    this.resources.clear()
    this.clearStateSyncTimer()
    this.lastStateSyncTime = 0
    this.stateSyncNotify = null
    this.audioEventHandler = null
    this.playbackActions = null
    this.ipcHandlers = null
    this.errorHandler = null
    this.lyricEngine = null
    this.currentLyricLineProvider = null
    this.stateSyncRegistered = false
  }

  override dispose(): void {
    this.reset()
    super.dispose()
  }

  private clearStateSyncTimer(): void {
    if (this.stateSyncTimer) {
      clearTimeout(this.stateSyncTimer)
      this.stateSyncTimer = null
    }
  }

  private flushStateSync(): void {
    this.clearStateSyncTimer()
    this.lastStateSyncTime = Date.now()
    this.stateSyncNotify?.()
  }
}

const runtimes = new WeakMap<PlayerStoreOwner, PlayerStoreRuntime>()
const patchedOwners = new WeakSet<PlayerStoreOwner>()

export function getPlayerStoreRuntime(owner: PlayerStoreOwner): PlayerStoreRuntime | undefined {
  return runtimes.get(owner)
}

export function ensurePlayerStoreRuntime(owner: PlayerStoreOwner): PlayerStoreRuntime {
  let runtime = runtimes.get(owner)

  if (!runtime) {
    runtime = new PlayerStoreRuntime()
    runtimes.set(owner, runtime)
  }

  if (!patchedOwners.has(owner)) {
    const originalDispose = owner.$dispose.bind(owner)

    owner.$dispose = () => {
      try {
        runtimes.get(owner)?.dispose()
      } finally {
        runtimes.delete(owner)
        patchedOwners.delete(owner)
        originalDispose()
      }
    }

    patchedOwners.add(owner)
  }

  return runtime
}

export function resetPlayerStoreRuntime(owner: PlayerStoreOwner): void {
  runtimes.get(owner)?.reset()
}
