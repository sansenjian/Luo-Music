import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerInvokeMock = vi.hoisted(() => vi.fn())
const setSmtcEnabledFromRendererMock = vi.hoisted(() => vi.fn())
const getCurrentPlayerStateSnapshotMock = vi.hoisted(() => vi.fn())

describe('smtc.handler', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    setSmtcEnabledFromRendererMock.mockReturnValue({ restartRequired: false })
    getCurrentPlayerStateSnapshotMock.mockReturnValue({
      currentSong: {
        id: 'song-1',
        name: 'Song 1',
        platform: 'netease'
      }
    })
    vi.doMock('../../electron/ipc/IpcService', () => ({
      ipcService: {
        registerInvoke: registerInvokeMock
      }
    }))
    vi.doMock('../../electron/main/smtc', () => ({
      setSmtcEnabledFromRenderer: setSmtcEnabledFromRendererMock
    }))
    vi.doMock('../../electron/main/playerStateSnapshot', () => ({
      getCurrentPlayerStateSnapshot: getCurrentPlayerStateSnapshotMock
    }))
  })

  it('syncs the cached player state immediately after enabling native SMTC', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )
    const nativeService = {
      getStatus: vi.fn(),
      setEnabled: vi.fn().mockResolvedValue({
        enabled: true,
        backend: 'native',
        nativeAvailable: true,
        helperRunning: true,
        restartRequired: false
      }),
      syncPlayerState: vi.fn()
    }

    const { registerSmtcHandlers } = await import('../../electron/ipc/handlers/smtc.handler')

    registerSmtcHandlers(nativeService)
    await invokeHandlers.get('smtc:set-enabled')?.(true)

    expect(nativeService.setEnabled).toHaveBeenCalledWith(true, false)
    expect(nativeService.syncPlayerState).toHaveBeenCalledWith(
      getCurrentPlayerStateSnapshotMock.mock.results[0]?.value
    )
  })
})
