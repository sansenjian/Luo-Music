// @ts-nocheck
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  resizeWindow: (dims) => ipcRenderer.send('resize-window', dims),
  
  getCacheSize: () => ipcRenderer.invoke('cache:get-size'),
  clearCache: (options) => ipcRenderer.invoke('cache:clear', options),
  clearAllCache: (keepUserData) => ipcRenderer.invoke('cache:clear-all', keepUserData),
  getCachePaths: () => ipcRenderer.invoke('cache:get-paths'),
  
  sendPlayingState: (playing) => ipcRenderer.send('music-playing-check', playing),
  sendPlayModeChange: (mode) => ipcRenderer.send('music-playmode-tray-change', mode),
  send: (channel, data) => {
    const validSendChannels = [
      'toggle-desktop-lyric',
      'desktop-lyric-control',
      'toggle-desktop-lyric-lock',
      'sync-lyric',
      'lyric-time-update',
      'download-music',
      'music-playing-control',
      'music-song-control',
      'desktop-lyric-set-ignore-mouse',
      'log-message' // 添加日志通道
    ]
    if (validSendChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },
  
  on: (channel, callback) => {
    const validChannels = [
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
    if (validChannels.includes(channel)) {
      const subscription = (event, ...args) => callback(...args)
      ipcRenderer.on(channel, subscription)
      return () => ipcRenderer.removeListener(channel, subscription)
    }
    throw new Error(`Invalid channel: ${channel}`)
  }
})
