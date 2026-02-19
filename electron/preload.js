import { contextBridge, ipcRenderer } from 'electron'

// 暴露受限的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  resizeWindow: (dims) => ipcRenderer.send('resize-window', dims),
  on: (channel, callback) => {
    // 允许列表，防止渲染进程监听任意频道
    const validChannels = ['main-process-message']
    if (validChannels.includes(channel)) {
      // 过滤 event 对象
      const subscription = (event, ...args) => callback(...args)
      ipcRenderer.on(channel, subscription)
      return () => ipcRenderer.removeListener(channel, subscription)
    }
    throw new Error(`Invalid channel: ${channel}`)
  }
})

// 移除 DOMContentLoaded 中的版本信息显示，避免 process.versions 访问问题
