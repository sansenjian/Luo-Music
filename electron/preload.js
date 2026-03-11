
const { contextBridge, ipcRenderer } = require('electron')

console.log('--- Preload script loaded ---')

const validSendChannels = [
  'toggle-desktop-lyric',
  'desktop-lyric-control',
  'toggle-desktop-lyric-lock',
  'sync-lyric',
  'lyric-time-update',
  'download-music',
  'music-playing-check',
  'music-playmode-tray-change',
  'desktop-lyric-move',
  'desktop-lyric-set-ignore-mouse',
  'log-message'
]

const validReceiveChannels = [
  'main-process-message',
  'cache-cleared',
  'music-playing-control',
  'music-song-control',
  'music-playmode-control',
  'music-volume-up',
  'music-volume-down',
  'music-process-control',
  'hide-player',
  'lyric-update',
  'lyric-time-update',
  'desktop-lyric-lock-state',
  'download-progress',
  'download-complete',
  'download-failed',
  'music-compact-mode-control'
]

const sendIpc = (channel, data) => {
  if (!validSendChannels.includes(channel)) {
    throw new Error(`Invalid channel: ${channel}`)
  }

  ipcRenderer.send(channel, data)
}

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  resizeWindow: (dims) => ipcRenderer.send('resize-window', dims),

  getCacheSize: () => ipcRenderer.invoke('cache:get-size'),
  clearCache: (options) => ipcRenderer.invoke('cache:clear', options),
  clearAllCache: (keepUserData) => ipcRenderer.invoke('cache:clear-all', keepUserData),
  getCachePaths: () => ipcRenderer.invoke('cache:get-paths'),

  sendPlayingState: (playing) => sendIpc('music-playing-check', playing),
  sendPlayModeChange: (mode) => sendIpc('music-playmode-tray-change', mode),
  moveWindow: (x, y) => sendIpc('desktop-lyric-move', { x, y }),

  // API 网关方法
  apiRequest: (service, endpoint, params) => ipcRenderer.invoke('api:request', { service, endpoint, params }),
  getServices: () => ipcRenderer.invoke('api:services'),
  getServiceStatus: (serviceId) => ipcRenderer.invoke('service:status', serviceId),
  startService: (serviceId) => ipcRenderer.invoke('service:start', serviceId),
  stopService: (serviceId) => ipcRenderer.invoke('service:stop', serviceId),

  send: (channel, data) => {
    sendIpc(channel, data)
  },

  on: (channel, callback) => {
    if (validReceiveChannels.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args)
      ipcRenderer.on(channel, subscription)
      return () => {
        ipcRenderer.removeListener(channel, subscription)
      }
    }
    throw new Error(`Invalid channel: ${channel}`)
  }
})

