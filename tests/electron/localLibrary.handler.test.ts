import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerInvokeMock = vi.hoisted(() => vi.fn())
const broadcastMock = vi.hoisted(() => vi.fn())
const showOpenDialogMock = vi.hoisted(() => vi.fn())
const getStateMock = vi.hoisted(() => vi.fn())
const addFolderMock = vi.hoisted(() => vi.fn())
const removeFolderMock = vi.hoisted(() => vi.fn())
const setFolderEnabledMock = vi.hoisted(() => vi.fn())
const scanMock = vi.hoisted(() => vi.fn())
const getTracksPageMock = vi.hoisted(() => vi.fn())
const getArtistsPageMock = vi.hoisted(() => vi.fn())
const getAlbumsPageMock = vi.hoisted(() => vi.fn())
const getCoverDataUrlMock = vi.hoisted(() => vi.fn())
const onUpdatedMock = vi.hoisted(() => vi.fn())
const onStatusChangeMock = vi.hoisted(() => vi.fn())
const getLocalLibraryServiceMock = vi.hoisted(() => vi.fn())

describe('localLibrary.handler', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    vi.doMock('../../electron/ipc/IpcService', () => ({
      ipcService: {
        registerInvoke: registerInvokeMock,
        broadcast: broadcastMock
      }
    }))

    vi.doMock('electron', () => ({
      dialog: {
        showOpenDialog: showOpenDialogMock
      }
    }))

    vi.doMock('../../electron/local-library/service', () => ({
      getLocalLibraryService: getLocalLibraryServiceMock.mockReturnValue({
        onUpdated: onUpdatedMock,
        onStatusChange: onStatusChangeMock,
        getState: getStateMock,
        addFolder: addFolderMock,
        removeFolder: removeFolderMock,
        setFolderEnabled: setFolderEnabledMock,
        scan: scanMock,
        getTracksPage: getTracksPageMock,
        getArtistsPage: getArtistsPageMock,
        getAlbumsPage: getAlbumsPageMock,
        getCoverDataUrl: getCoverDataUrlMock
      })
    }))
  })

  it('registers local library handlers and forwards local-library events', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    let updatedListener: ((state: unknown) => void) | null = null
    let statusListener: ((status: unknown) => void) | null = null

    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )
    onUpdatedMock.mockImplementation((listener: (state: unknown) => void) => {
      updatedListener = listener
      return vi.fn()
    })
    onStatusChangeMock.mockImplementation((listener: (status: unknown) => void) => {
      statusListener = listener
      return vi.fn()
    })

    const libraryState = {
      supported: true,
      folders: [],
      tracks: [],
      status: {
        phase: 'idle',
        scannedFolders: 0,
        scannedFiles: 0,
        discoveredTracks: 0,
        currentFolder: null,
        startedAt: null,
        finishedAt: null,
        message: 'ready'
      }
    }

    getStateMock.mockReturnValue(libraryState)
    addFolderMock.mockResolvedValue(libraryState)
    removeFolderMock.mockResolvedValue(libraryState)
    setFolderEnabledMock.mockResolvedValue(libraryState)
    scanMock.mockResolvedValue(libraryState)
    getTracksPageMock.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
      limit: 60
    })
    getArtistsPageMock.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
      limit: 60
    })
    getAlbumsPageMock.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
      limit: 60
    })
    getCoverDataUrlMock.mockResolvedValue('data:image/png;base64,ZmFrZQ==')
    showOpenDialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ['D:\\Music']
    })

    const { registerLocalLibraryHandlers } =
      await import('../../electron/ipc/handlers/localLibrary.handler')

    registerLocalLibraryHandlers({
      getWindow: vi.fn(() => ({ id: 1 }))
    } as never)

    await expect(invokeHandlers.get('local-library:get-state')?.()).resolves.toEqual(libraryState)
    await expect(invokeHandlers.get('local-library:pick-folder')?.()).resolves.toBe('D:\\Music')
    await expect(invokeHandlers.get('local-library:add-folder')?.('D:\\Music')).resolves.toEqual(
      libraryState
    )
    await expect(
      invokeHandlers.get('local-library:remove-folder')?.(`local-folder:${'a'.repeat(40)}`)
    ).resolves.toEqual(libraryState)
    await expect(
      invokeHandlers.get('local-library:set-folder-enabled')?.(
        `local-folder:${'a'.repeat(40)}`,
        false
      )
    ).resolves.toEqual(libraryState)
    await expect(invokeHandlers.get('local-library:scan')?.()).resolves.toEqual(libraryState)
    await expect(invokeHandlers.get('local-library:get-tracks')?.({ limit: 20 })).resolves.toEqual({
      items: [],
      nextCursor: null,
      total: 0,
      limit: 60
    })
    await expect(invokeHandlers.get('local-library:get-artists')?.()).resolves.toEqual({
      items: [],
      nextCursor: null,
      total: 0,
      limit: 60
    })
    await expect(invokeHandlers.get('local-library:get-albums')?.()).resolves.toEqual({
      items: [],
      nextCursor: null,
      total: 0,
      limit: 60
    })
    await expect(invokeHandlers.get('local-library:get-cover')?.('a'.repeat(40))).resolves.toBe(
      'data:image/png;base64,ZmFrZQ=='
    )

    updatedListener!(libraryState)
    statusListener!(libraryState.status)

    expect(addFolderMock).toHaveBeenCalledWith('D:\\Music')
    expect(removeFolderMock).toHaveBeenCalledWith(`local-folder:${'a'.repeat(40)}`)
    expect(setFolderEnabledMock).toHaveBeenCalledWith(`local-folder:${'a'.repeat(40)}`, false)
    expect(scanMock).toHaveBeenCalled()
    expect(getTracksPageMock).toHaveBeenCalledWith({ limit: 20 })
    expect(getArtistsPageMock).toHaveBeenCalledWith(undefined)
    expect(getAlbumsPageMock).toHaveBeenCalledWith(undefined)
    expect(getCoverDataUrlMock).toHaveBeenCalledWith('a'.repeat(40))
    expect(broadcastMock).toHaveBeenCalledWith('local-library:updated', libraryState)
    expect(broadcastMock).toHaveBeenCalledWith('local-library:scan-status', libraryState.status)
  })

  it('returns null when the folder picker is canceled', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )
    onUpdatedMock.mockReturnValue(vi.fn())
    onStatusChangeMock.mockReturnValue(vi.fn())
    showOpenDialogMock.mockResolvedValue({
      canceled: true,
      filePaths: []
    })

    const { registerLocalLibraryHandlers } =
      await import('../../electron/ipc/handlers/localLibrary.handler')
    registerLocalLibraryHandlers({
      getWindow: vi.fn(() => null)
    } as never)

    await expect(invokeHandlers.get('local-library:pick-folder')?.()).resolves.toBeNull()
  })

  it('rejects invalid folder, enablement, and cover arguments before reaching the service', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )
    onUpdatedMock.mockReturnValue(vi.fn())
    onStatusChangeMock.mockReturnValue(vi.fn())

    const { registerLocalLibraryHandlers } =
      await import('../../electron/ipc/handlers/localLibrary.handler')
    registerLocalLibraryHandlers({
      getWindow: vi.fn(() => null)
    } as never)

    await expect(invokeHandlers.get('local-library:add-folder')?.('Music')).rejects.toThrow(
      'Invalid folderPath'
    )
    await expect(
      invokeHandlers.get('local-library:set-folder-enabled')?.('folder-1', 'yes')
    ).rejects.toThrow('Invalid folderId')
    await expect(invokeHandlers.get('local-library:get-cover')?.('cover-1')).rejects.toThrow(
      'Invalid coverHash'
    )

    expect(addFolderMock).not.toHaveBeenCalled()
    expect(setFolderEnabledMock).not.toHaveBeenCalled()
    expect(getCoverDataUrlMock).not.toHaveBeenCalled()
  })
})
