import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const platformMock = vi.hoisted(() => ({
  closeWindow: vi.fn(),
  isElectron: vi.fn(),
  isMobile: vi.fn(),
  maximizeWindow: vi.fn(),
  minimizeWindow: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  getCacheSize: vi.fn(),
  clearCache: vi.fn()
}))

const initializePlatformServiceMock = vi.hoisted(() => vi.fn())
const getPlatformServiceMock = vi.hoisted(() => vi.fn(() => platformMock))

vi.mock('../../src/platform', () => ({
  initializePlatformService: initializePlatformServiceMock,
  getPlatformService: getPlatformServiceMock
}))

describe('platformService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    platformMock.isElectron.mockReturnValue(true)
    platformMock.isMobile.mockReturnValue(false)
    platformMock.getCacheSize.mockResolvedValue({ httpCache: 10 })
    platformMock.clearCache.mockResolvedValue({ success: ['cache'], failed: [] })
    platformMock.on.mockImplementation((_channel: string, handler: (payload: unknown) => void) => ({
      dispose: () => handler('disposed')
    }))

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes the platform service and proxies basic methods', async () => {
    const { createPlatformService } = await import('@/services/platformService')
    const service = createPlatformService()

    expect(initializePlatformServiceMock).toHaveBeenCalled()
    expect(service.isElectron()).toBe(true)
    expect(service.isMobile()).toBe(false)

    service.minimizeWindow()
    service.maximizeWindow()
    service.closeWindow()
    expect(platformMock.minimizeWindow).toHaveBeenCalledTimes(1)
    expect(platformMock.maximizeWindow).toHaveBeenCalledTimes(1)
    expect(platformMock.closeWindow).toHaveBeenCalledTimes(1)

    service.send('demo', { ok: true })
    expect(platformMock.send).toHaveBeenCalledWith('demo', { ok: true })

    await expect(service.getCacheSize()).resolves.toEqual({ httpCache: 10 })
    await expect(service.clearCache({ all: true })).resolves.toEqual({
      success: ['cache'],
      failed: []
    })
  })

  it('wraps platform subscriptions into dispose callbacks', async () => {
    const handler = vi.fn()
    const { createPlatformService } = await import('@/services/platformService')
    const service = createPlatformService()

    const unsubscribe = service.on('message', handler)
    expect(platformMock.on).toHaveBeenCalledWith('message', handler)

    unsubscribe()
    expect(handler).toHaveBeenCalledWith('disposed')
  })

  it('gets service status from electronAPI when present', async () => {
    const getServiceStatus = vi.fn().mockResolvedValue({ status: 'running', port: 3200 })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { getServiceStatus }
    })

    const { createPlatformService } = await import('@/services/platformService')
    const service = createPlatformService()

    await expect(service.getServiceStatus?.('qq')).resolves.toEqual({
      status: 'running',
      port: 3200
    })
  })

  it('returns null when electronAPI service status is unavailable', async () => {
    const { createPlatformService } = await import('@/services/platformService')
    const service = createPlatformService()

    await expect(service.getServiceStatus?.('qq')).resolves.toBeNull()
  })
})
