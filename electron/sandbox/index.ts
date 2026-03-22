import { contextBridge, ipcRenderer } from 'electron'
import { SEND_CHANNELS, RECEIVE_CHANNELS, INVOKE_CHANNELS } from '../shared/protocol/channels.ts'
import { createLegacyElectronAPI, type ElectronAPI } from './legacyElectronApi'

// 导入服务代理
import { IpcProxy, LogProxy, ConfigProxy, ApiProxy, WindowProxy, PlayerProxy } from './services'

console.log('--- Preload script loaded (TypeScript) ---')

type SendChannel = (typeof SEND_CHANNELS)[keyof typeof SEND_CHANNELS]
type ReceiveChannel = (typeof RECEIVE_CHANNELS)[keyof typeof RECEIVE_CHANNELS]
type InvokeChannel = (typeof INVOKE_CHANNELS)[keyof typeof INVOKE_CHANNELS]
type Channel = InvokeChannel | SendChannel | ReceiveChannel
interface ValidatedIpcBridge {
  send: (channel: string, ...args: unknown[]) => void
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
  supportsSendChannel: (channel: string) => channel is SendChannel
}

/**
 * 服务代理 API 接口
 */
export interface ServiceAPI {
  // IPC 核心
  invoke: <T>(channel: Channel, ...args: unknown[]) => Promise<T>
  send: (channel: Channel, ...args: unknown[]) => void
  supportsSendChannel: (channel: string) => boolean
  on: (channel: Channel, listener: (...args: unknown[]) => void) => () => void
  once: (channel: Channel, listener: (...args: unknown[]) => void) => void
  removeListener: (channel: Channel, listener: (...args: unknown[]) => void) => void
  removeAllListeners: (channel?: Channel) => void

  // 日志服务
  createLogger: (module: string) => {
    trace: (message: string, data?: unknown) => void
    debug: (message: string, data?: unknown) => void
    info: (message: string, data?: unknown) => void
    warn: (message: string, data?: unknown) => void
    error: (message: string, data?: unknown) => void
    errorWithStack: (error: Error, context?: string) => void
  }

  // 配置服务
  config: {
    get: <T extends keyof import('./services').AppConfig>(
      key: T
    ) => Promise<import('./services').AppConfig[T]>
    getAll: () => Promise<import('./services').AppConfig>
    set: <T extends keyof import('./services').AppConfig>(
      key: T,
      value: import('./services').AppConfig[T]
    ) => Promise<void>
    delete: (key: keyof import('./services').AppConfig) => Promise<void>
    reset: () => Promise<void>
    onConfigChange: (
      listener: (event: import('./services').ConfigChangeEvent) => void
    ) => () => void
  }

  // API 服务
  api: {
    search: (
      keyword: string,
      type?: import('./services').SearchType,
      platform?: import('./services').MusicPlatform,
      page?: number,
      limit?: number
    ) => Promise<import('./services').SearchResult>
    getSongUrl: (params: import('./services').SongUrlParams) => Promise<string>
    getLyric: (
      params: import('./services').LyricParams
    ) => Promise<import('./services').LyricResponse>
    getSongDetail: (params: import('./services').DetailParams) => Promise<unknown>
    getPlaylistDetail: (
      id: string,
      platform?: import('./services').MusicPlatform
    ) => Promise<unknown>
    getArtistDetail: (id: string, platform?: import('./services').MusicPlatform) => Promise<unknown>
    getAlbumDetail: (id: string, platform?: import('./services').MusicPlatform) => Promise<unknown>
    getRecommendedPlaylists: (
      platform?: import('./services').MusicPlatform,
      limit?: number
    ) => Promise<unknown[]>
    getChart: (platform?: import('./services').MusicPlatform, id?: string) => Promise<unknown[]>
  }

  // 窗口控制
  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    minimizeToTray: () => void
    setAlwaysOnTop: (alwaysOnTop: boolean) => void
    toggleFullScreen: () => void
    getState: () => Promise<import('./services').WindowState>
    isMaximized: () => Promise<boolean>
    isMinimized: () => Promise<boolean>
    isFullScreen: () => Promise<boolean>
    restore: () => void
    show: () => void
    hide: () => void
    toggleDesktopLyric: (show?: boolean) => Promise<void>
    setDesktopLyricOnTop: (alwaysOnTop: boolean) => Promise<void>
    lockDesktopLyric: (locked: boolean) => Promise<void>
  }

  // Player controls
  player: {
    play: () => Promise<void>
    pause: () => Promise<void>
    toggle: () => Promise<void>
    playSong: (
      song: import('./services').Song,
      playlist?: import('./services').Song[]
    ) => Promise<void>
    playSongById: (id: string, platform?: 'netease' | 'qq') => Promise<void>
    skipToPrevious: () => Promise<void>
    skipToNext: () => Promise<void>
    seekTo: (time: number) => Promise<void>
    setVolume: (volume: number) => Promise<void>
    toggleMute: () => Promise<void>
    setPlayMode: (mode: import('./services').PlayMode) => Promise<void>
    togglePlayMode: () => Promise<void>
    getState: () => Promise<import('./services').PlayerState>
    getCurrentSong: () => Promise<import('./services').Song | null>
    getPlaylist: () => Promise<import('./services').Song[]>
    addToNext: (song: import('./services').Song) => Promise<void>
    removeFromPlaylist: (index: number) => Promise<void>
    clearPlaylist: () => Promise<void>
    getLyric: (
      songId: string,
      platform?: 'netease' | 'qq'
    ) => Promise<import('./services').LyricLine[]>
    onPlayStateChange: (
      listener: (data: { isPlaying: boolean; currentTime: number }) => void
    ) => () => void
    onSongChange: (
      listener: (data: { song: import('./services').Song | null; index: number }) => void
    ) => () => void
    onLyricUpdate: (
      listener: (data: { index: number; line: import('./services').LyricLine }) => void
    ) => () => void
    onPlayError: (
      listener: (data: { error: string; song: import('./services').Song }) => void
    ) => () => void
  }
}

function createValidatedIpcBridge(renderer: Electron.IpcRenderer): ValidatedIpcBridge {
  const validSendChannels = new Set<SendChannel>(Object.values(SEND_CHANNELS))
  const validReceiveChannels = new Set<ReceiveChannel>(Object.values(RECEIVE_CHANNELS))
  const validInvokeChannels = new Set<InvokeChannel>(Object.values(INVOKE_CHANNELS))

  return {
    send(channel: string, ...args: unknown[]): void {
      if (!validSendChannels.has(channel as SendChannel)) {
        throw new Error(`Invalid send channel: ${channel}`)
      }
      renderer.send(channel as SendChannel, ...args)
    },

    on(channel: string, callback: (...args: unknown[]) => void): () => void {
      if (!validReceiveChannels.has(channel as ReceiveChannel)) {
        throw new Error(`Invalid receive channel: ${channel}`)
      }

      const validatedChannel = channel as ReceiveChannel
      const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
        callback(...args)
      }

      renderer.on(validatedChannel, subscription)
      return () => {
        renderer.removeListener(validatedChannel, subscription)
      }
    },

    invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
      if (!validInvokeChannels.has(channel as InvokeChannel)) {
        throw new Error(`Invalid invoke channel: ${channel}`)
      }
      return renderer.invoke(channel as InvokeChannel, ...args) as Promise<T>
    },

    supportsSendChannel(channel: string): channel is SendChannel {
      return validSendChannels.has(channel as SendChannel)
    }
  }
}

/**
 * 创建服务代理 API
 */
function createServiceAPI(ipc: ValidatedIpcBridge): ServiceAPI {
  // Initialize proxy services.
  const ipcProxy = new IpcProxy()
  const configProxy = new ConfigProxy()
  const apiProxy = new ApiProxy()
  const windowProxy = new WindowProxy()
  const playerProxy = new PlayerProxy()

  return {
    // IPC 核心
    invoke: (channel: Channel, ...args) => ipcProxy.invoke(channel, ...args),
    send: (channel: Channel, ...args) => ipcProxy.send(channel, ...args),
    supportsSendChannel: (channel: string) => ipc.supportsSendChannel(channel),
    on: (channel: Channel, listener) => ipcProxy.on(channel, listener),
    once: (channel: Channel, listener) => ipcProxy.once(channel, listener),
    removeListener: (channel: Channel, listener) => ipcProxy.removeListener(channel, listener),
    removeAllListeners: (channel?: Channel) => ipcProxy.removeAllListeners(channel),

    // 日志服务
    createLogger: module => new LogProxy(module),

    // 配置服务
    config: {
      get: key => configProxy.get(key),
      getAll: () => configProxy.getAll(),
      set: (key, value) => configProxy.set(key, value),
      delete: key => configProxy.delete(key),
      reset: () => configProxy.reset(),
      onConfigChange: listener => configProxy.onConfigChange(listener)
    },

    // API 服务
    api: {
      search: (keyword, type, platform, page, limit) =>
        apiProxy.search(keyword, type, platform, page, limit),
      getSongUrl: params => apiProxy.getSongUrl(params),
      getLyric: params => apiProxy.getLyric(params),
      getSongDetail: params => apiProxy.getSongDetail(params),
      getPlaylistDetail: (id, platform) => apiProxy.getPlaylistDetail(id, platform),
      getArtistDetail: (id, platform) => apiProxy.getArtistDetail(id, platform),
      getAlbumDetail: (id, platform) => apiProxy.getAlbumDetail(id, platform),
      getRecommendedPlaylists: (platform, limit) =>
        apiProxy.getRecommendedPlaylists(platform, limit),
      getChart: (platform, id) => apiProxy.getChart(platform, id)
    },

    // 窗口控制
    window: {
      minimize: () => windowProxy.minimize(),
      toggleMaximize: () => windowProxy.toggleMaximize(),
      close: () => windowProxy.close(),
      minimizeToTray: () => windowProxy.minimizeToTray(),
      setAlwaysOnTop: alwaysOnTop => windowProxy.setAlwaysOnTop(alwaysOnTop),
      toggleFullScreen: () => windowProxy.toggleFullScreen(),
      getState: () => windowProxy.getState(),
      isMaximized: () => windowProxy.isMaximized(),
      isMinimized: () => windowProxy.isMinimized(),
      isFullScreen: () => windowProxy.isFullScreen(),
      restore: () => windowProxy.restore(),
      show: () => windowProxy.show(),
      hide: () => windowProxy.hide(),
      toggleDesktopLyric: show => windowProxy.toggleDesktopLyric(show),
      setDesktopLyricOnTop: alwaysOnTop => windowProxy.setDesktopLyricOnTop(alwaysOnTop),
      lockDesktopLyric: locked => windowProxy.lockDesktopLyric(locked)
    },

    // Player controls
    player: {
      play: () => playerProxy.play(),
      pause: () => playerProxy.pause(),
      toggle: () => playerProxy.toggle(),
      playSong: (song, playlist) => playerProxy.playSong(song, playlist),
      playSongById: (id, platform) => playerProxy.playSongById(id, platform),
      skipToPrevious: () => playerProxy.skipToPrevious(),
      skipToNext: () => playerProxy.skipToNext(),
      seekTo: time => playerProxy.seekTo(time),
      setVolume: volume => playerProxy.setVolume(volume),
      toggleMute: () => playerProxy.toggleMute(),
      setPlayMode: mode => playerProxy.setPlayMode(mode),
      togglePlayMode: () => playerProxy.togglePlayMode(),
      getState: () => playerProxy.getState(),
      getCurrentSong: () => playerProxy.getCurrentSong(),
      getPlaylist: () => playerProxy.getPlaylist(),
      addToNext: song => playerProxy.addToNext(song),
      removeFromPlaylist: index => playerProxy.removeFromPlaylist(index),
      clearPlaylist: () => playerProxy.clearPlaylist(),
      getLyric: (songId, platform) => playerProxy.getLyric(songId, platform),
      onPlayStateChange: listener => playerProxy.onPlayStateChange(listener),
      onSongChange: listener => playerProxy.onSongChange(listener),
      onLyricUpdate: listener => playerProxy.onLyricUpdate(listener),
      onPlayError: listener => playerProxy.onPlayError(listener)
    }
  }
}

function exposeAPI(): void {
  const ipc = createValidatedIpcBridge(ipcRenderer)
  const services = createServiceAPI(ipc)
  const electronAPI = createLegacyElectronAPI(services.window, ipc)

  // Expose both legacy electronAPI and the new services API.
  contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  contextBridge.exposeInMainWorld('services', services)
}

exposeAPI()

declare global {
  interface Window {
    electronAPI: ElectronAPI
    services: ServiceAPI
  }
}
