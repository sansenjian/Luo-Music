import { beforeEach, describe, expect, it, vi } from 'vitest'

const appWhenReady = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const appGetPath = vi.hoisted(() => vi.fn(() => '/downloads'))
const ipcMainOn = vi.hoisted(() => vi.fn())
const ipcMainRemoveListener = vi.hoisted(() => vi.fn())
const sessionOn = vi.hoisted(() => vi.fn())
const sessionRemoveListener = vi.hoisted(() => vi.fn())
const existsSync = vi.hoisted(() => vi.fn(() => true))
const mkdirSync = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: {
    whenReady: appWhenReady,
    getPath: appGetPath
  },
  ipcMain: {
    on: ipcMainOn,
    removeListener: ipcMainRemoveListener
  },
  session: {
    defaultSession: {
      on: sessionOn,
      removeListener: sessionRemoveListener
    }
  }
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync,
    mkdirSync
  }
}))

vi.mock('node:path', () => ({
  default: {
    join: (...segments: string[]) => segments.join('/')
  }
}))

describe('electron/DownloadManager', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('registers listeners only once and removes them on dispose', async () => {
    const { DownloadManager } = await import('../../electron/DownloadManager')
    const manager = new DownloadManager()

    await Promise.resolve()
    await Promise.resolve()

    manager.init()
    manager.init()

    expect(sessionOn).toHaveBeenCalledTimes(1)
    expect(ipcMainOn).toHaveBeenCalledTimes(1)

    manager.dispose()

    expect(sessionRemoveListener).toHaveBeenCalledTimes(1)
    expect(ipcMainRemoveListener).toHaveBeenCalledTimes(1)
  })
})
