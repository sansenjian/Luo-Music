const { contextBridge, ipcRenderer } = require('electron')

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
  }
})

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency])
  }
})
