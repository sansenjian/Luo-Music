/**
 * IPC 通信处理模块
 *
 * 负责处理与 Electron 主进程的 IPC 通信：
 * - 全局快捷键事件监听
 * - 系统托盘事件处理
 * - 桌面歌词控制
 * - 窗口控制命令
 *
 * 借鉴 VSCode 的 IPC 通道模式：统一管理事件订阅和资源释放
 */

import type { PlayerState } from './playerState'

/**
 * IPC 处理器依赖接口
 */
export interface IpcHandlersDeps {
  /** 获取播放器状态 */
  getState: () => PlayerState
  /** 状态变更回调 */
  onStateChange: (changes: Partial<PlayerState>) => void
  /** 切换播放 */
  togglePlay: () => void
  play?: () => void
  pause?: () => void
  /** 播放上一首 */
  playPrev: () => void
  /** 播放下一首 */
  playNext: () => void
  /** 设置播放模式 */
  setPlayMode: (mode: number) => void
  /** 设置音量 */
  setVolume: (vol: number) => void
  /** 切换紧凑模式 */
  toggleCompactMode: () => void
  /** 平台 API */
  platform: {
    isElectron: () => boolean
    on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  }
}

/**
 * 可释放资源接口
 */
interface IDisposable {
  dispose(): void
}

/**
 * IPC 事件处理器
 */
export class IpcEventHandler implements IDisposable {
  private _disposables: IDisposable[] = []
  private _disposed = false

  constructor(private readonly deps: IpcHandlersDeps) {}

  /**
   * 初始化 IPC 监听器
   */
  init(): void {
    if (this._disposed) {
      console.warn('[IpcEventHandler] Cannot init after dispose')
      return
    }

    // 防止重复初始化
    if (this._disposables.length > 0) {
      this.dispose()
    }

    // 平台检查
    if (!this.deps.platform.isElectron()) {
      return
    }

    // 注册所有 IPC 监听器
    this._registerMusicPlayingControl()
    this._registerSongControl()
    this._registerPlayModeControl()
    this._registerVolumeControl()
    this._registerProcessControl()
    this._registerCompactModeControl()
    this._registerHidePlayer()
  }

  /**
   * 释放所有资源
   */
  dispose(): void {
    if (this._disposed) return

    for (const d of this._disposables) {
      d.dispose()
    }
    this._disposables = []
    this._disposed = true
  }

  private _registerListener(channel: string, callback: (...args: unknown[]) => void): void {
    const unsubscribe = this.deps.platform.on(channel, callback)
    this._disposables.push({ dispose: unsubscribe })
  }

  private _registerMusicPlayingControl(): void {
    this._registerListener('music-playing-control', (command: unknown) => {
      // Handle different command types
      if (!command) {
        // No command = toggle play/pause (legacy behavior)
        this.deps.togglePlay()
        return
      }

      if (typeof command === 'string') {
        if (command === 'play') {
          if (typeof this.deps.play === 'function') {
            this.deps.play()
          } else if (!this.deps.getState().playing) {
            this.deps.togglePlay()
          }
        } else if (command === 'pause') {
          if (typeof this.deps.pause === 'function') {
            this.deps.pause()
          } else if (this.deps.getState().playing) {
            this.deps.togglePlay()
          }
        } else if (command === 'toggle') {
          this.deps.togglePlay()
        } else if (command === 'toggle-mute') {
          // Toggle mute - not in deps interface, would need extension
        }
        return
      }

      if (typeof command === 'object' && command !== null) {
        const cmd = command as { type?: string; time?: number; volume?: number }
        if (cmd.type === 'seek' && typeof cmd.time === 'number') {
          // Seek command - would need seek function in deps
        } else if (cmd.type === 'volume' && typeof cmd.volume === 'number') {
          // Volume command
          this.deps.setVolume(cmd.volume)
        }
      }
    })
  }

  private _registerSongControl(): void {
    this._registerListener('music-song-control', (direction: unknown) => {
      const dir = direction as string
      if (dir === 'prev') {
        this.deps.playPrev()
      } else if (dir === 'next') {
        this.deps.playNext()
      }
    })
  }

  private _registerPlayModeControl(): void {
    this._registerListener('music-playmode-control', (mode: unknown) => {
      if (mode === 'toggle') {
        // Toggle play mode - cycle through modes
        this.deps.setPlayMode((this.deps.getState().playMode + 1) % 4)
      } else {
        // Set specific mode
        this.deps.setPlayMode(mode as number)
      }
    })
  }

  private _registerVolumeControl(): void {
    this._registerListener('music-volume-up', () => {
      const state = this.deps.getState()
      this.deps.setVolume(Math.min(1, state.volume + 0.1))
    })

    this._registerListener('music-volume-down', () => {
      const state = this.deps.getState()
      this.deps.setVolume(Math.max(0, state.volume - 0.1))
    })
  }

  private _registerProcessControl(): void {
    this._registerListener('music-process-control', (direction: unknown) => {
      const dir = direction as string

      if (dir === 'back') {
        // 快退逻辑在 playerStore 中处理
      } else if (dir === 'forward') {
        // 快进逻辑在 playerStore 中处理
      }
    })
  }

  private _registerCompactModeControl(): void {
    this._registerListener('music-compact-mode-control', () => {
      this.deps.toggleCompactMode()
    })
  }

  private _registerHidePlayer(): void {
    this._registerListener('hide-player', () => {
      this.deps.toggleCompactMode()
    })
  }
}

/**
 * IPC 通信处理器
 */
export class IpcHandlers {
  private _eventHandler: IpcEventHandler | null = null

  constructor(private readonly deps: IpcHandlersDeps) {}

  /**
   * 设置 IPC 监听器
   */
  setup(): void {
    if (!this.deps.platform.isElectron()) return

    this._eventHandler = new IpcEventHandler(this.deps)
    this._eventHandler.init()
  }

  /**
   * 销毁 IPC 监听器
   */
  teardown(): void {
    if (this._eventHandler) {
      this._eventHandler.dispose()
      this._eventHandler = null
    }
  }
}

/**
 * 创建 IPC 通信处理器
 */
export function createIpcHandlers(deps: IpcHandlersDeps): IpcHandlers {
  return new IpcHandlers(deps)
}
