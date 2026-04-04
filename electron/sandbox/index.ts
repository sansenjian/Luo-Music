import { contextBridge, ipcRenderer } from 'electron'
import { SEND_CHANNELS, RECEIVE_CHANNELS, INVOKE_CHANNELS } from '../shared/protocol/channels.ts'
import { createLegacyElectronAPI, type ElectronAPI } from './legacyElectronApi'

// 导入服务代理
import { LogProxy, ConfigProxy, ApiProxy, WindowProxy, PlayerProxy } from './services'
import type { Song, LyricLine } from './services/playerProxy'

console.log('--- Preload script loaded (TypeScript) ---')

async function initializeSentryPreloadBridge(): Promise<void> {
  try {
    const sentryPreloadModule = await import('@sentry/electron/preload')
    sentryPreloadModule.hookupIpc()
  } catch (error) {
    console.warn('[Preload] Failed to initialize Sentry IPC bridge', error)
  }
}

void initializeSentryPreloadBridge()

type SendChannel = (typeof SEND_CHANNELS)[keyof typeof SEND_CHANNELS]
type ReceiveChannel = (typeof RECEIVE_CHANNELS)[keyof typeof RECEIVE_CHANNELS]
type InvokeChannel = (typeof INVOKE_CHANNELS)[keyof typeof INVOKE_CHANNELS]
type Channel = InvokeChannel | SendChannel | ReceiveChannel

type IpcCoreAPI = {
  invoke: <T = unknown>(channel: Channel, ...args: unknown[]) => Promise<T>
  send: (channel: Channel, ...args: unknown[]) => void
  on: (channel: Channel, callback: (...args: unknown[]) => void) => () => void
  once: (channel: Channel, callback: (...args: unknown[]) => void) => void
  removeListener: (channel: Channel, callback: (...args: unknown[]) => void) => void
  removeAllListeners: (channel?: Channel) => void
  supportsSendChannel: (channel: string) => channel is SendChannel
}

type LoggerServiceAPI = Pick<
  LogProxy,
  'trace' | 'debug' | 'info' | 'warn' | 'error' | 'errorWithStack'
>

type ConfigServiceAPI = Pick<
  ConfigProxy,
  'get' | 'getAll' | 'set' | 'delete' | 'reset' | 'onConfigChange'
>

type ApiServiceAPI = Pick<
  ApiProxy,
  | 'search'
  | 'getSongUrl'
  | 'getLyric'
  | 'getSongDetail'
  | 'getPlaylistDetail'
  | 'getArtistDetail'
  | 'getAlbumDetail'
  | 'getRecommendedPlaylists'
  | 'getChart'
>

type WindowServiceAPI = Pick<
  WindowProxy,
  | 'minimize'
  | 'toggleMaximize'
  | 'close'
  | 'minimizeToTray'
  | 'setAlwaysOnTop'
  | 'toggleFullScreen'
  | 'getState'
  | 'isMaximized'
  | 'isMinimized'
  | 'isFullScreen'
  | 'restore'
  | 'show'
  | 'hide'
  | 'toggleDesktopLyric'
  | 'setDesktopLyricOnTop'
  | 'lockDesktopLyric'
>

type PlayerServiceAPI = Pick<
  PlayerProxy,
  | 'play'
  | 'pause'
  | 'toggle'
  | 'playSong'
  | 'playSongById'
  | 'skipToPrevious'
  | 'skipToNext'
  | 'seekTo'
  | 'setVolume'
  | 'toggleMute'
  | 'setPlayMode'
  | 'togglePlayMode'
  | 'getState'
  | 'getCurrentSong'
  | 'getPlaylist'
  | 'getDesktopLyricSnapshot'
  | 'addToNext'
  | 'removeFromPlaylist'
  | 'clearPlaylist'
  | 'getLyric'
  | 'onPlayStateChange'
  | 'onSongChange'
  | 'onLyricUpdate'
  | 'onPlayError'
>

type ServiceAPIShape = IpcCoreAPI & {
  createLogger: (module: string) => LoggerServiceAPI
  config: ConfigServiceAPI
  api: ApiServiceAPI
  window: WindowServiceAPI
  player: PlayerServiceAPI
}
interface ValidatedIpcBridge {
  send: (channel: string, ...args: unknown[]) => void
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  once: (channel: string, callback: (...args: unknown[]) => void) => void
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void
  removeAllListeners: (channel?: string) => void
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
  supportsSendChannel: (channel: string) => channel is SendChannel
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

    once(channel: string, callback: (...args: unknown[]) => void): void {
      if (!validReceiveChannels.has(channel as ReceiveChannel)) {
        throw new Error(`Invalid receive channel: ${channel}`)
      }
      renderer.once(
        channel as ReceiveChannel,
        (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
          callback(...args)
        }
      )
    },

    removeListener(channel: string, callback: (...args: unknown[]) => void): void {
      renderer.removeListener(channel as ReceiveChannel, callback)
    },

    removeAllListeners(channel?: string): void {
      renderer.removeAllListeners(channel)
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
 * Create the consolidated service API exposed to the renderer, combining validated IPC operations with proxy-backed service namespaces.
 *
 * @param ipc - The validated IPC bridge used to route and validate IPC calls
 * @returns An object exposing core IPC methods plus logger creation and the `config`, `api`, `window`, and `player` service namespaces
 */
function createServiceAPI(ipc: ValidatedIpcBridge): ServiceAPIShape {
  // Initialize proxy services.
  const configProxy = new ConfigProxy()
  const apiProxy = new ApiProxy()
  const windowProxy = new WindowProxy()
  const playerProxy = new PlayerProxy()

  const ipcCore: IpcCoreAPI = {
    invoke: <T = unknown>(channel: Channel, ...args: unknown[]) =>
      ipc.invoke(channel, ...args) as Promise<T>,
    send: (channel: Channel, ...args: unknown[]) => ipc.send(channel, ...args),
    supportsSendChannel: (channel: string) => ipc.supportsSendChannel(channel),
    on: (channel: Channel, listener: (...args: unknown[]) => void) => ipc.on(channel, listener),
    once: (channel: Channel, listener: (...args: unknown[]) => void) => ipc.once(channel, listener),
    removeListener: (channel: Channel, listener: (...args: unknown[]) => void) =>
      ipc.removeListener(channel, listener),
    removeAllListeners: (channel?: Channel) => ipc.removeAllListeners(channel)
  }

  const config: ConfigServiceAPI = {
    get: key => configProxy.get(key),
    getAll: () => configProxy.getAll(),
    set: (key, value) => configProxy.set(key, value),
    delete: key => configProxy.delete(key),
    reset: () => configProxy.reset(),
    onConfigChange: listener => configProxy.onConfigChange(listener)
  }

  const api: ApiServiceAPI = {
    search: (keyword, type, platform, page, limit) =>
      apiProxy.search(keyword, type, platform, page, limit),
    getSongUrl: params => apiProxy.getSongUrl(params),
    getLyric: params => apiProxy.getLyric(params),
    getSongDetail: params => apiProxy.getSongDetail(params),
    getPlaylistDetail: (id, platform) => apiProxy.getPlaylistDetail(id, platform),
    getArtistDetail: (id, platform) => apiProxy.getArtistDetail(id, platform),
    getAlbumDetail: (id, platform) => apiProxy.getAlbumDetail(id, platform),
    getRecommendedPlaylists: (platform, limit) => apiProxy.getRecommendedPlaylists(platform, limit),
    getChart: (platform, id) => apiProxy.getChart(platform, id)
  }

  const windowApi: WindowServiceAPI = {
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
  }

  const player: PlayerServiceAPI = {
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
    getDesktopLyricSnapshot: () => playerProxy.getDesktopLyricSnapshot(),
    addToNext: song => playerProxy.addToNext(song),
    removeFromPlaylist: index => playerProxy.removeFromPlaylist(index),
    clearPlaylist: () => playerProxy.clearPlaylist(),
    getLyric: (songId, platform) => playerProxy.getLyric(songId, platform),
    onPlayStateChange: (listener: (data: { isPlaying: boolean; currentTime: number }) => void) =>
      playerProxy.onPlayStateChange(listener),
    onSongChange: (listener: (data: { song: Song | null; index: number }) => void) =>
      playerProxy.onSongChange(listener),
    onLyricUpdate: (listener: (data: { index: number; line: LyricLine | null }) => void) =>
      playerProxy.onLyricUpdate(listener),
    onPlayError: (listener: (data: { error: string; song: Song | null }) => void) =>
      playerProxy.onPlayError(listener)
  }

  return {
    ...ipcCore,
    createLogger: (module: string) => new LogProxy(module),
    config,
    api,
    window: windowApi,
    player
  }
}

export type ServiceAPI = ReturnType<typeof createServiceAPI>

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
