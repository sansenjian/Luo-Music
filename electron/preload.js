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
      'hide-player'
    ]
    if (validChannels.includes(channel)) {
      const subscription = (event, ...args) => callback(...args)
      ipcRenderer.on(channel, subscription)
      return () => ipcRenderer.removeListener(channel, subscription)
    }
    throw new Error(`Invalid channel: ${channel}`)
  }
})
