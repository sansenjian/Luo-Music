import { Disposable, DisposableStore, type IDisposable } from '@/base/common/lifecycle/disposable'
import type { Song } from '@/types/schemas'
import type { PlayMode } from '@/utils/player/constants/playMode'

import type { PlayerState } from './playerState'

export interface IpcHandlersDeps {
  getState: () => PlayerState
  onStateChange: (changes: Partial<PlayerState>) => void
  togglePlay: () => void
  toggleMute: () => void
  play?: () => void
  pause?: () => void
  playPrev: () => void
  playNext: () => void
  playSong: (song: Song, playlist?: Song[]) => void
  playSongById: (id: string | number, platform?: 'netease' | 'qq') => Promise<void> | void
  addToNext: (song: Song) => void
  removeFromPlaylist: (index: number) => void
  clearPlaylist: () => void
  setPlayMode: (mode: PlayMode) => void
  seek: (time: number) => void
  setVolume: (vol: number) => void
  toggleCompactMode: () => void
  platform: {
    isElectron: () => boolean
    on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  }
}

export class IpcEventHandler implements IDisposable {
  private readonly disposables = new DisposableStore()
  private disposedState = false

  constructor(private readonly deps: IpcHandlersDeps) {}

  private clearListeners(): void {
    this.disposables.clear()
  }

  init(): void {
    if (this.disposedState) {
      console.warn('[IpcEventHandler] Cannot init after dispose')
      return
    }

    if (this.disposables.size > 0) {
      this.clearListeners()
    }

    if (!this.deps.platform.isElectron()) {
      return
    }

    this.registerMusicPlayingControl()
    this.registerSongControl()
    this.registerPlayModeControl()
    this.registerVolumeControl()
    this.registerProcessControl()
    this.registerCompactModeControl()
    this.registerHidePlayer()
  }

  dispose(): void {
    if (this.disposedState) {
      return
    }

    this.clearListeners()
    this.disposables.dispose()
    this.disposedState = true
  }

  private registerListener(channel: string, callback: (...args: unknown[]) => void): void {
    const unsubscribe = this.deps.platform.on(channel, callback)
    this.disposables.add(Disposable.from(unsubscribe))
  }

  private registerMusicPlayingControl(): void {
    this.registerListener('music-playing-control', (command: unknown) => {
      if (!command) {
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
          this.deps.toggleMute()
        }

        return
      }

      if (typeof command === 'object') {
        const cmd = command as { type?: string; time?: number; volume?: number }
        if (cmd.type === 'seek' && typeof cmd.time === 'number') {
          this.deps.seek(cmd.time)
          return
        }

        if (cmd.type === 'volume' && typeof cmd.volume === 'number') {
          this.deps.setVolume(cmd.volume)
        }
      }
    })
  }

  private registerSongControl(): void {
    this.registerListener('music-song-control', (direction: unknown) => {
      if (direction === 'prev') {
        this.deps.playPrev()
        return
      }

      if (direction === 'next') {
        this.deps.playNext()
        return
      }

      if (!direction || typeof direction !== 'object') {
        return
      }

      const command = direction as
        | { type: 'play-song'; song: Song; playlist?: Song[] }
        | { type: 'play-song-by-id'; id: string | number; platform?: 'netease' | 'qq' }
        | { type: 'add-to-next'; song: Song }
        | { type: 'remove-from-playlist'; index: number }
        | { type: 'clear-playlist' }

      if (command.type === 'play-song') {
        this.deps.playSong(command.song, command.playlist)
        return
      }

      if (command.type === 'play-song-by-id') {
        void this.deps.playSongById(command.id, command.platform)
        return
      }

      if (command.type === 'add-to-next') {
        this.deps.addToNext(command.song)
        return
      }

      if (command.type === 'remove-from-playlist') {
        this.deps.removeFromPlaylist(command.index)
        return
      }

      if (command.type === 'clear-playlist') {
        this.deps.clearPlaylist()
      }
    })
  }

  private registerPlayModeControl(): void {
    this.registerListener('music-playmode-control', (mode: unknown) => {
      if (mode === 'toggle') {
        this.deps.setPlayMode(((this.deps.getState().playMode + 1) % 4) as PlayMode)
        return
      }

      if (typeof mode === 'number' && Number.isInteger(mode) && mode >= 0 && mode <= 3) {
        this.deps.setPlayMode(mode as PlayMode)
      }
    })
  }

  private registerVolumeControl(): void {
    this.registerListener('music-volume-up', () => {
      const state = this.deps.getState()
      this.deps.setVolume(Math.min(1, state.volume + 0.1))
    })

    this.registerListener('music-volume-down', () => {
      const state = this.deps.getState()
      this.deps.setVolume(Math.max(0, state.volume - 0.1))
    })
  }

  private registerProcessControl(): void {
    this.registerListener('music-process-control', (_direction: unknown) => {
      // Seek control still stays in playerStore for now.
    })
  }

  private registerCompactModeControl(): void {
    this.registerListener('music-compact-mode-control', () => {
      this.deps.toggleCompactMode()
    })
  }

  private registerHidePlayer(): void {
    this.registerListener('hide-player', () => {
      this.deps.toggleCompactMode()
    })
  }
}

export class IpcHandlers implements IDisposable {
  private eventHandler: IpcEventHandler | null = null

  constructor(private readonly deps: IpcHandlersDeps) {}

  setup(): void {
    this.teardown()

    if (!this.deps.platform.isElectron()) {
      return
    }

    this.eventHandler = new IpcEventHandler(this.deps)
    this.eventHandler.init()
  }

  teardown(): void {
    if (this.eventHandler) {
      this.eventHandler.dispose()
      this.eventHandler = null
    }
  }

  dispose(): void {
    this.teardown()
  }
}

export function createIpcHandlers(deps: IpcHandlersDeps): IpcHandlers {
  return new IpcHandlers(deps)
}
