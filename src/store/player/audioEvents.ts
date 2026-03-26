import { Disposable, DisposableStore, type IDisposable } from '@/base/common/lifecycle/disposable'
import { playerCore } from '@/utils/player/core/playerCore'

import type { PlayerState } from './playerState'

export interface AudioEventCallbacks {
  onTimeUpdate?: (time: number) => void
  onLoadedMetadata?: (duration: number) => void
  onEnded?: () => void
  onPlay?: () => void
  onPause?: () => void
  onError?: (error: unknown) => void
}

export interface TimeUpdateConfig {
  uiUpdateInterval: number
  ipcBroadcastInterval: number
  getCurrentLyricLine?: () => { text: string; trans: string; roma: string } | null
  syncLyricIndex?: (time: number) => boolean
  createLyricUpdatePayload?: (params: {
    time: number
    index: number
    line: { text: string; trans: string; roma: string } | null
    playing: boolean
  }) => Record<string, unknown>
}

export class AudioEventHandler implements IDisposable {
  private readonly eventDisposables = new DisposableStore()
  private lastUiUpdateTime = 0
  private lastBroadcastTime = 0
  private progressSyncTimer: ReturnType<typeof setInterval> | null = null
  private config: TimeUpdateConfig = {
    uiUpdateInterval: 250,
    ipcBroadcastInterval: 500,
    getCurrentLyricLine: undefined,
    syncLyricIndex: undefined
  }
  private disposedState = false
  // 用于差量检查的状态
  private lastBroadcastLyricIndex = -1
  private lastBroadcastLyricData: { text: string; trans: string; roma: string } | null = null
  private lastBroadcastPlaying: boolean | null = null

  constructor(
    private readonly state: PlayerState,
    private readonly callbacks: AudioEventCallbacks,
    private readonly platform?: {
      isElectron: () => boolean
      send: (channel: string, data: unknown) => void
    }
  ) {}

  init(config?: TimeUpdateConfig): void {
    if (this.disposedState) {
      console.warn('[AudioEventHandler] Cannot init after dispose')
      return
    }

    if (config) {
      this.config = { ...this.config, ...config }
    }

    this.cleanupEvents()
    this.registerTimeUpdateListener()
    this.registerMetadataListener()
    this.registerEndedListener()
    this.registerPlayListener()
    this.registerPauseListener()
    this.registerErrorListener()
  }

  setTimeUpdateConfig(config: Partial<TimeUpdateConfig>): void {
    Object.assign(this.config, config)
  }

  setCallbacks(callbacks: Partial<AudioEventCallbacks>): void {
    Object.assign(this.callbacks, callbacks)
  }

  private cleanupEvents(): void {
    this.eventDisposables.clear()
    this.stopProgressSyncLoop()
    this.lastUiUpdateTime = 0
    this.lastBroadcastTime = 0
    // 重置差量检查状态
    this.lastBroadcastLyricIndex = -1
    this.lastBroadcastLyricData = null
    this.lastBroadcastPlaying = null
  }

  private broadcastLyricUpdate(): void {
    if (!this.platform) {
      return
    }

    const currentLyricLine = this.config.getCurrentLyricLine?.() ?? null
    const currentTime = Number(playerCore.currentTime) || this.state.progress

    // 差量检查：只有当歌词索引或内容真正变化时才发送
    const hasIndexChanged = this.state.currentLyricIndex !== this.lastBroadcastLyricIndex
    const hasContentChanged = !currentLyricLine
      ? this.lastBroadcastLyricData !== null
      : currentLyricLine.text !== this.lastBroadcastLyricData?.text ||
        currentLyricLine.trans !== this.lastBroadcastLyricData?.trans ||
        currentLyricLine.roma !== this.lastBroadcastLyricData?.roma
    const hasPlayingChanged = this.lastBroadcastPlaying !== this.state.playing

    if (!hasIndexChanged && !hasContentChanged && !hasPlayingChanged) {
      return
    }

    // 更新缓存状态
    this.lastBroadcastLyricIndex = this.state.currentLyricIndex
    this.lastBroadcastLyricData = currentLyricLine ? { ...currentLyricLine } : null
    this.lastBroadcastPlaying = this.state.playing

    this.platform.send('lyric-time-update', {
      ...(this.config.createLyricUpdatePayload?.({
        time: currentTime,
        index: this.state.currentLyricIndex,
        line: currentLyricLine,
        playing: this.state.playing
      }) ?? {
        time: currentTime,
        index: this.state.currentLyricIndex,
        text: currentLyricLine?.text || '',
        trans: currentLyricLine?.trans || '',
        roma: currentLyricLine?.roma || '',
        playing: this.state.playing
      })
    })
  }

  private handleProgressUpdate(force = false): void {
    const now = Date.now()
    const currentTime = Number(playerCore.currentTime) || 0
    const lyricIndexChanged = this.config.syncLyricIndex?.(currentTime) ?? false

    if (force || now - this.lastUiUpdateTime >= this.config.uiUpdateInterval) {
      this.lastUiUpdateTime = now
      this.callbacks.onTimeUpdate?.(currentTime)
    }

    if (
      this.platform &&
      (lyricIndexChanged ||
        force ||
        now - this.lastBroadcastTime >= this.config.ipcBroadcastInterval)
    ) {
      this.lastBroadcastTime = now
      this.broadcastLyricUpdate()
    }
  }

  private getProgressSyncInterval(): number {
    const intervals = [this.config.uiUpdateInterval, this.config.ipcBroadcastInterval].filter(
      value => Number.isFinite(value) && value > 0
    )

    if (intervals.length === 0) {
      return 250
    }

    return Math.max(80, Math.min(...intervals, 250))
  }

  private startProgressSyncLoop(): void {
    if (this.progressSyncTimer || this.disposedState) {
      return
    }

    this.progressSyncTimer = setInterval(() => {
      this.handleProgressUpdate()
    }, this.getProgressSyncInterval())

    // 防止定时器阻止进程退出
    if (
      typeof this.progressSyncTimer === 'object' &&
      this.progressSyncTimer !== null &&
      'unref' in this.progressSyncTimer &&
      typeof this.progressSyncTimer.unref === 'function'
    ) {
      this.progressSyncTimer.unref()
    }
  }

  private stopProgressSyncLoop(): void {
    if (this.progressSyncTimer) {
      clearInterval(this.progressSyncTimer)
      this.progressSyncTimer = null
    }
  }

  private registerTimeUpdateListener(): void {
    const handler = () => {
      this.handleProgressUpdate()
    }

    const unsubscribe = playerCore.on('timeupdate', handler)
    this.eventDisposables.add(Disposable.from(unsubscribe))
  }

  private registerMetadataListener(): void {
    const unsubscribe = playerCore.on('loadedmetadata', () => {
      this.callbacks.onLoadedMetadata?.(playerCore.duration)
    })

    this.eventDisposables.add(Disposable.from(unsubscribe))
  }

  private registerEndedListener(): void {
    const unsubscribe = playerCore.on('ended', () => {
      this.stopProgressSyncLoop()
      this.callbacks.onEnded?.()
    })

    this.eventDisposables.add(Disposable.from(unsubscribe))
  }

  private registerPlayListener(): void {
    const unsubscribe = playerCore.on('play', () => {
      this.callbacks.onPlay?.()
      this.handleProgressUpdate(true)
      this.startProgressSyncLoop()
    })

    this.eventDisposables.add(Disposable.from(unsubscribe))
  }

  private registerPauseListener(): void {
    const unsubscribe = playerCore.on('pause', () => {
      this.stopProgressSyncLoop()
      this.callbacks.onPause?.()
      this.broadcastLyricUpdate()
    })

    this.eventDisposables.add(Disposable.from(unsubscribe))
  }

  private registerErrorListener(): void {
    const unsubscribe = playerCore.on('error', (error: unknown) => {
      console.error('[AudioEventHandler] Audio error:', error)
      this.callbacks.onError?.(error)
    })

    this.eventDisposables.add(Disposable.from(unsubscribe))
  }

  dispose(): void {
    if (this.disposedState) {
      return
    }

    this.cleanupEvents()
    this.eventDisposables.dispose()
    this.disposedState = true
  }

  get disposed(): boolean {
    return this.disposedState
  }
}

export function createAudioEventHandler(
  state: PlayerState,
  callbacks: AudioEventCallbacks,
  platform?: {
    isElectron: () => boolean
    send: (channel: string, data: unknown) => void
  }
): AudioEventHandler {
  return new AudioEventHandler(state, callbacks, platform)
}
