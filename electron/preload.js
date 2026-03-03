const { contextBridge, ipcRenderer } = require('electron')

// 暴露受限的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制 API
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  resizeWindow: (dims) => ipcRenderer.send('resize-window', dims),
  
  // 缓存管理 API
  getCacheSize: () => ipcRenderer.invoke('cache:get-size'),
  clearCache: (options) => ipcRenderer.invoke('cache:clear', options),
  clearAllCache: (keepUserData) => ipcRenderer.invoke('cache:clear-all', keepUserData),
  getCachePaths: () => ipcRenderer.invoke('cache:get-paths'),
  
  // 事件监听
  on: (channel, callback) => {
    // 允许列表，防止渲染进程监听任意频道
    const validChannels = ['main-process-message', 'cache-cleared']
    if (validChannels.includes(channel)) {
      // 过滤 event 对象
      const subscription = (event, ...args) => callback(...args)
      ipcRenderer.on(channel, subscription)
      return () => ipcRenderer.removeListener(channel, subscription)
    }
    throw new Error(`Invalid channel: ${channel}`)
  }
})
