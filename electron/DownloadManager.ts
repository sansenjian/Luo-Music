import { app, BrowserWindow, ipcMain, session } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export class DownloadManager {
  private downloadPath: string
  private window: BrowserWindow | null = null

  constructor() {
    this.downloadPath = path.join(app.getPath('downloads'), 'LuoMusic')
    if (!fs.existsSync(this.downloadPath)) {
      fs.mkdirSync(this.downloadPath, { recursive: true })
    }
  }

  setWindow(win: BrowserWindow) {
    this.window = win
  }

  init() {
    // 监听下载事件
    session.defaultSession.on('will-download', (event, item, webContents) => {
      // 获取文件名
      const fileName = item.getFilename()
      const filePath = path.join(this.downloadPath, fileName)
      
      // 设置保存路径，不显示保存对话框
      item.setSavePath(filePath)
      
      item.on('updated', (event, state) => {
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
      
      item.once('done', (event, state) => {
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
    })

    // 内部使用的 IPC，不对外公开暴露给 UI 直接调用下载
    // 仅用于接收下载指令（如果需要的话，比如从其他模块触发）
    ipcMain.on('internal-download', (event, url) => {
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
