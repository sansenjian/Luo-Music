import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerInvokeMock = vi.hoisted(() => vi.fn())
const broadcastMock = vi.hoisted(() => vi.fn())
const storeData = vi.hoisted(() => new Map<string, unknown>())

vi.mock('../../electron/ipc/IpcService', () => ({
  ipcService: {
    registerInvoke: registerInvokeMock,
    broadcast: broadcastMock
  }
}))

vi.mock('electron-store', () => ({
  default: class ElectronStoreMock {
    get<T>(key: string, defaultValue?: T): T {
      return storeData.has(key) ? (storeData.get(key) as T) : (defaultValue as T)
    }

    set(key: string, value: unknown): void {
      storeData.set(key, value)
    }
  }
}))

describe('config.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeData.clear()
  })

  it('registers config handlers and persists config mutations', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )

    const { registerConfigHandlers } = await import('../../electron/ipc/handlers/config.handler')
    registerConfigHandlers()

    const getAll = invokeHandlers.get('config:get-all')
    const get = invokeHandlers.get('config:get')
    const set = invokeHandlers.get('config:set')
    const remove = invokeHandlers.get('config:delete')
    const reset = invokeHandlers.get('config:reset')

    await expect(getAll?.()).resolves.toMatchObject({
      theme: 'system',
      defaultVolume: 0.7,
      autoPlay: false
    })

    await set?.('theme', 'dark')
    await expect(get?.('theme')).resolves.toBe('dark')
    expect(broadcastMock).toHaveBeenCalledWith('config:changed', {
      key: 'theme',
      oldValue: 'system',
      newValue: 'dark'
    })

    await remove?.('theme')
    await expect(get?.('theme')).resolves.toBe('system')

    await set?.('autoPlay', true)
    await reset?.('autoPlay')
    await expect(get?.('autoPlay')).resolves.toBe(false)
  })

  it('should throw on unknown config key', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )

    const { registerConfigHandlers } = await import('../../electron/ipc/handlers/config.handler')
    registerConfigHandlers()

    const get = invokeHandlers.get('config:get')
    const set = invokeHandlers.get('config:set')

    await expect(get?.('unknown-key')).rejects.toThrow('Unknown config key')
    await expect(set?.('unknown-key', 'value')).rejects.toThrow('Unknown config key')
  })

  it('rejects invalid config values instead of persisting them', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )

    const { registerConfigHandlers } = await import('../../electron/ipc/handlers/config.handler')
    registerConfigHandlers()

    const get = invokeHandlers.get('config:get')
    const set = invokeHandlers.get('config:set')

    await expect(set?.('theme', 123)).rejects.toThrow('Invalid config value for theme')
    await expect(set?.('defaultVolume', 'loud')).rejects.toThrow(
      'Invalid config value for defaultVolume'
    )

    await expect(get?.('theme')).resolves.toBe('system')
    await expect(get?.('defaultVolume')).resolves.toBe(0.7)
  })

  it('should reset all config keys when called without key', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        invokeHandlers.set(channel, handler)
      }
    )

    const { registerConfigHandlers } = await import('../../electron/ipc/handlers/config.handler')
    registerConfigHandlers()

    const reset = invokeHandlers.get('config:reset')

    // First modify some config
    const set = invokeHandlers.get('config:set')
    await set?.('theme', 'dark')
    await set?.('autoPlay', true)
    await set?.('defaultVolume', 0.9)

    broadcastMock.mockClear()

    // Reset all
    await reset?.()

    const getAll = invokeHandlers.get('config:get-all')
    await expect(getAll?.()).resolves.toMatchObject({
      theme: 'system',
      defaultVolume: 0.7,
      autoPlay: false
    })

    // Should emit events for all config keys
    expect(broadcastMock).toHaveBeenCalled()
  })
})
