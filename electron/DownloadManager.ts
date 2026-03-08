import electron, { type BrowserWindow as BrowserWindowType, type Event, type DownloadItem, type WebContents } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const { app, ipcMain, session } = electron

export class DownloadManager {
  private downloadPath: string | null = null
  private window: BrowserWindowType | null = null
  private isInitialized = false

  constructor() {
    // 延迟初始化 downloadPath，等待 app.ready 后再获取
    this.initDownloadPath()
  }

  private async initDownloadPath() {
    await app.whenReady()
    this.downloadPath = path.join(app.getPath('downloads'), 'LuoMusic')
    if (!fs.existsSync(this.downloadPath)) {
      fs.mkdirSync(this.downloadPath, { recursive: true })
    }
    this.isInitialized = true
  }

  setWindow(win: BrowserWindowType) {
    this.window = win
  }

  init() {
    // 监听下载事件
    session.defaultSession.on('will-download', (event: Event, item: DownloadItem, webContents: WebContents) => {
      // 获取文件名
      const fileName = item.getFilename()
      // 等待 downloadPath 初始化完成
      const waitForPath = setInterval(() => {
        if (this.isInitialized && this.downloadPath) {
          clearInterval(waitForPath)
          const filePath = path.join(this.downloadPath, fileName)
          
          // 设置保存路径，不显示保存对话框
          item.setSavePath(filePath)
          
          item.on('updated', (event: Event, state: 'progressing' | 'interrupted') => {
            if (state === 'interrupted') {
              console.log('Download is interrupted but can be resumed')
            } else if (state === 'progressing') {
              if (item.isPaused()) {
                console.log('Download is paused')
              } else {
                // 发送进度到渲染进程
                if (this.window) {
                  const progress = item.getReceivedBytes() / item.getTotalBytes()
                  this.window.webContents.send('download-progress', {
                    filename: fileName,
                    progress,
                    received: item.getReceivedBytes(),
                    total: item.getTotalBytes()
                  })
                }
              }
            }
          })
          
          item.once('done', (event: Event, state: 'completed' | 'cancelled' | 'interrupted') => {
            if (state === 'completed') {
              console.log('Download successfully')
              if (this.window) {
                this.window.webContents.send('download-complete', {
                  filename: fileName,
                  path: filePath
                })
              }
            } else {
              console.log(`Download failed: ${state}`)
              if (this.window) {
                this.window.webContents.send('download-failed', {
                  filename: fileName,
                  error: state
                })
              }
            }
          })
        }
      }, 100)
    })

    // 内部使用的 IPC，不对外公开暴露给 UI 直接调用下载
    // 仅用于接收下载指令（如果需要的话，比如从其他模块触发）
    ipcMain.on('internal-download', (event: Event, url: string) => {
      if (this.window) {
        this.window.webContents.downloadURL(url)
      }
    })
  }
  
  download(url: string) {
    if (this.window) {
      this.window.webContents.downloadURL(url)
    }
  }
}

export const downloadManager = new DownloadManager()
