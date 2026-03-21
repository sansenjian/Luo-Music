import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain, session } from 'electron'
import type { BrowserWindow as BrowserWindowType, DownloadItem, Event, WebContents } from 'electron'

export class DownloadManager {
  private downloadPath: string | null = null
  private window: BrowserWindowType | null = null
  private isInitialized = false
  private listenersRegistered = false

  private readonly willDownloadListener = (
    _event: Event,
    item: DownloadItem,
    _webContents: WebContents
  ): void => {
    void this.handleWillDownload(item)
  }

  private readonly internalDownloadListener = (_event: Event, url: string): void => {
    if (this.window) {
      this.window.webContents.downloadURL(url)
    }
  }

  constructor() {
    void this.initDownloadPath()
  }

  private async initDownloadPath(): Promise<void> {
    await app.whenReady()
    this.downloadPath = path.join(app.getPath('downloads'), 'LuoMusic')
    if (!fs.existsSync(this.downloadPath)) {
      fs.mkdirSync(this.downloadPath, { recursive: true })
    }
    this.isInitialized = true
  }

  private async waitForDownloadPath(): Promise<string> {
    while (!this.isInitialized || !this.downloadPath) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return this.downloadPath
  }

  private async handleWillDownload(item: DownloadItem): Promise<void> {
    const fileName = item.getFilename()
    const downloadPath = await this.waitForDownloadPath()
    const filePath = path.join(downloadPath, fileName)

    item.setSavePath(filePath)

    item.on('updated', (_event: Event, state: 'progressing' | 'interrupted') => {
      if (state === 'interrupted') {
        console.log('Download is interrupted but can be resumed')
        return
      }

      if (state === 'progressing') {
        if (item.isPaused()) {
          console.log('Download is paused')
          return
        }

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
    })

    item.once('done', (_event: Event, state: 'completed' | 'cancelled' | 'interrupted') => {
      if (state === 'completed') {
        console.log('Download successfully')
        if (this.window) {
          this.window.webContents.send('download-complete', {
            filename: fileName,
            path: filePath
          })
        }
        return
      }

      console.log(`Download failed: ${state}`)
      if (this.window) {
        this.window.webContents.send('download-failed', {
          filename: fileName,
          error: state
        })
      }
    })
  }

  setWindow(win: BrowserWindowType): void {
    this.window = win
  }

  init(): void {
    if (this.listenersRegistered) {
      return
    }

    session.defaultSession.on('will-download', this.willDownloadListener)
    ipcMain.on('internal-download', this.internalDownloadListener)
    this.listenersRegistered = true
  }

  dispose(): void {
    if (!this.listenersRegistered) {
      return
    }

    session.defaultSession.removeListener('will-download', this.willDownloadListener)
    ipcMain.removeListener('internal-download', this.internalDownloadListener)
    this.listenersRegistered = false
    this.window = null
  }

  download(url: string): void {
    if (this.window) {
      this.window.webContents.downloadURL(url)
    }
  }
}

export const downloadManager = new DownloadManager()
