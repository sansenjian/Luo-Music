/**
 * 音频事件处理器
 *
 * 负责管理 HTMLAudioElement 的所有事件监听
 * 借鉴 VSCode 的 Disposable 模式，实现资源的自动释放
 */

import { playerCore } from '@/utils/player/core/playerCore'
import type { PlayerState } from './playerState'

/**
 * 音频事件回调类型
 */
export interface AudioEventCallbacks {
  onTimeUpdate?: (time: number) => void
  onLoadedMetadata?: (duration: number) => void
  onEnded?: () => void
  onPlay?: () => void
  onPause?: () => void
  onError?: (error: unknown) => void
}

/**
 * 时间更新事件配置
 */
export interface TimeUpdateConfig {
  /** 本地 UI 更新间隔 (ms) */
  uiUpdateInterval: number
  /** IPC 广播间隔 (ms) */
  ipcBroadcastInterval: number
  /** 获取当前歌词行的回调 */
  getCurrentLyricLine?: () => { text: string; trans: string; roma: string } | null
}

/**
 * 可释放资源接口
 */
interface IDisposable {
  dispose(): void
}

/**
 * 音频事件处理器
 */
export class AudioEventHandler {
  private _eventDisposables: IDisposable[] = []
  private _lastUiUpdateTime = 0
  private _lastBroadcastTime = 0
  private _config: TimeUpdateConfig = {
    uiUpdateInterval: 250,
    ipcBroadcastInterval: 500,
    getCurrentLyricLine: undefined
  }
  private _disposed = false

  constructor(
    private readonly state: PlayerState,
    private readonly callbacks: AudioEventCallbacks,
    private readonly platform?: {
      isElectron: () => boolean
      send: (channel: string, data: unknown) => void
    }
  ) {}

  init(config?: TimeUpdateConfig): void {
    if (this._disposed) {
      console.warn('[AudioEventHandler] Cannot init after dispose')
      return
    }

    if (config) {
      this._config = { ...this._config, ...config }
    }

    this._cleanupEvents()
    this._registerTimeUpdateListener()
    this._registerMetadataListener()
    this._registerEndedListener()
    this._registerPlayListener()
    this._registerPauseListener()
    this._registerErrorListener()
  }

  setTimeUpdateConfig(config: Partial<TimeUpdateConfig>): void {
    Object.assign(this._config, config)
  }

  setCallbacks(callbacks: Partial<AudioEventCallbacks>): void {
    Object.assign(this.callbacks, callbacks)
  }

  private _cleanupEvents(): void {
    playerCore.off('timeupdate')
    playerCore.off('loadedmetadata')
    playerCore.off('ended')
    playerCore.off('play')
    playerCore.off('pause')
    playerCore.off('error')

    for (const d of this._eventDisposables) {
      d.dispose()
    }
    this._eventDisposables = []
    this._lastUiUpdateTime = 0
    this._lastBroadcastTime = 0
  }

  private _broadcastLyricUpdate(): void {
    if (!this.platform) {
      return
    }

    const currentLyricLine = this._config.getCurrentLyricLine?.()
    this.platform.send('lyric-time-update', {
      time: Number(playerCore.currentTime) || this.state.progress,
      index: this.state.currentLyricIndex,
      text: currentLyricLine?.text || '',
      trans: currentLyricLine?.trans || '',
      roma: currentLyricLine?.roma || '',
      playing: this.state.playing
    })
  }

  private _registerTimeUpdateListener(): void {
    const handler = () => {
      const now = Date.now()

      if (now - this._lastUiUpdateTime >= this._config.uiUpdateInterval) {
        this._lastUiUpdateTime = now
        const currentTime = Number(playerCore.currentTime) || 0
        this.callbacks.onTimeUpdate?.(currentTime)

        if (this.state.lyricEngine) {
          this.state.lyricEngine.update(currentTime)
        }
      }

      if (this.platform && now - this._lastBroadcastTime >= this._config.ipcBroadcastInterval) {
        this._lastBroadcastTime = now
        this._broadcastLyricUpdate()
      }
    }

    const unsubscribe = playerCore.on('timeupdate', handler)
    this._eventDisposables.push({ dispose: unsubscribe })
  }

  private _registerMetadataListener(): void {
    const handler = () => {
      const duration = playerCore.duration
      this.callbacks.onLoadedMetadata?.(duration)
    }
    const unsubscribe = playerCore.on('loadedmetadata', handler)
    this._eventDisposables.push({ dispose: unsubscribe })
  }

  private _registerEndedListener(): void {
    const handler = () => {
      this.callbacks.onEnded?.()
    }
    const unsubscribe = playerCore.on('ended', handler)
    this._eventDisposables.push({ dispose: unsubscribe })
  }

  private _registerPlayListener(): void {
    const handler = () => {
      this.callbacks.onPlay?.()
      this._broadcastLyricUpdate()
    }
    const unsubscribe = playerCore.on('play', handler)
    this._eventDisposables.push({ dispose: unsubscribe })
  }

  private _registerPauseListener(): void {
    const handler = () => {
      this.callbacks.onPause?.()
      this._broadcastLyricUpdate()
    }
    const unsubscribe = playerCore.on('pause', handler)
    this._eventDisposables.push({ dispose: unsubscribe })
  }

  private _registerErrorListener(): void {
    const handler = (error: unknown) => {
      console.error('[AudioEventHandler] Audio error:', error)
      this.callbacks.onError?.(error)
    }
    const unsubscribe = playerCore.on('error', handler)
    this._eventDisposables.push({ dispose: unsubscribe })
  }

  dispose(): void {
    if (this._disposed) return
    this._cleanupEvents()
    this._disposed = true
  }

  get disposed(): boolean {
    return this._disposed
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
