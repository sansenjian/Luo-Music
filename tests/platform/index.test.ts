import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IDisposable } from '@/base/common/lifecycle/disposable'
import { Platform } from '@/platform/common/types'

type MockPlatformService = {
  name: string
  minimizeWindow: ReturnType<typeof vi.fn>
  maximizeWindow: ReturnType<typeof vi.fn>
  closeWindow: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  sendPlayingState: ReturnType<typeof vi.fn>
  sendPlayModeChange: ReturnType<typeof vi.fn>
  getPlatform: ReturnType<typeof vi.fn>
  isElectron: ReturnType<typeof vi.fn>
  isMobile: ReturnType<typeof vi.fn>
  getName: ReturnType<typeof vi.fn>
  getCacheSize: ReturnType<typeof vi.fn>
  clearCache: ReturnType<typeof vi.fn>
  clearAllCache?: ReturnType<typeof vi.fn>
}

function createMockPlatformService(withClearAll = true): MockPlatformService {
  const service: MockPlatformService = {
    name: 'mock',
    minimizeWindow: vi.fn(),
    maximizeWindow: vi.fn(),
    closeWindow: vi.fn(),
    on: vi.fn((_channel: string, _callback: (data: unknown) => void): IDisposable => ({
      dispose: vi.fn()
    })),
    send: vi.fn(),
    sendPlayingState: vi.fn(),
    sendPlayModeChange: vi.fn(),
    getPlatform: vi.fn(() => Platform.Web),
    isElectron: vi.fn(() => false),
    isMobile: vi.fn(() => false),
    getName: vi.fn(() => 'mock'),
    getCacheSize: vi.fn().mockResolvedValue({ httpCache: 1, httpCacheFormatted: '1 B' }),
    clearCache: vi.fn().mockResolvedValue({ success: ['cache'], failed: [] })
  }

  if (withClearAll) {
    service.clearAllCache = vi.fn().mockResolvedValue({ success: ['all'], failed: [] })
  }

  return service
}

describe('platform index', () => {
  beforeEach(() => {
    vi.resetModules()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined
    })
  })

  it('wraps the registered platform service through the legacy default export', async () => {
    const service = createMockPlatformService()
    const platformModule = await import('@/platform')
    platformModule.PlatformServiceRegistry.clear()
    platformModule.PlatformServiceRegistry.register(service as never)
    const platform = platformModule.default
    const listener = vi.fn()

    platform.minimizeWindow()
    platform.maximizeWindow()
    platform.closeWindow()
    const unsubscribe = platform.on('message', listener)
    platform.send('message', { ok: true })
    platform.sendPlayingState(true)
    platform.sendPlayModeChange(2)

    expect(service.minimizeWindow).toHaveBeenCalled()
    expect(service.maximizeWindow).toHaveBeenCalled()
    expect(service.closeWindow).toHaveBeenCalled()
    expect(service.on).toHaveBeenCalledWith('message', listener)
    expect(service.send).toHaveBeenCalledWith('message', { ok: true })
    expect(service.sendPlayingState).toHaveBeenCalledWith(true)
    expect(service.sendPlayModeChange).toHaveBeenCalledWith(2)

    unsubscribe()
    expect((service.getPlatform as () => Platform)()).toBe(Platform.Web)
    expect(platform.isElectron()).toBe(false)
    expect(platform.isMobile()).toBe(false)
    expect(platform.getName()).toBe('mock')
    await expect(platform.getCacheSize()).resolves.toEqual({
      httpCache: 1,
      httpCacheFormatted: '1 B'
    })
    await expect(platform.clearCache({ all: true })).resolves.toEqual({
      success: ['cache'],
      failed: []
    })
    await expect(platform.clearAllCache()).resolves.toEqual({
      success: ['all'],
      failed: []
    })
  })

  it('falls back to clearCache when clearAllCache is unavailable', async () => {
    const service = createMockPlatformService(false)
    const platformModule = await import('@/platform')
    platformModule.PlatformServiceRegistry.clear()
    platformModule.PlatformServiceRegistry.register(service as never)
    const platform = platformModule.default

    await expect(platform.clearAllCache(true)).resolves.toEqual({
      success: ['cache'],
      failed: []
    })
    expect(service.clearCache).toHaveBeenCalledWith({
      cookies: true,
      sessionStorage: true,
      cache: true,
      serviceWorkers: true,
      shaderCache: true
    })

    await expect(platform.clearAllCache(false)).resolves.toEqual({
      success: ['cache'],
      failed: []
    })
    expect(service.clearCache).toHaveBeenCalledWith({ all: true })
  })

  it('initializes a web platform service when the registry is empty', async () => {
    const platformModule = await import('@/platform')
    platformModule.PlatformServiceRegistry.clear()
    const service = platformModule.getPlatformService()

    expect(service.getName()).toBe('web')
    expect(platformModule.isElectron).toBe(false)
  })
})
