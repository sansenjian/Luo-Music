import { afterEach, describe, expect, it, vi } from 'vitest'

import { Disposable } from '@/base/common/lifecycle/disposable'
import {
  PlatformServiceBase,
  detectElectron,
  detectMobile,
  formatBytes,
  PlatformServiceRegistry
} from '@/platform/common/platformService'
import { Platform } from '@/platform/common/types'

class TestPlatformService extends PlatformServiceBase {
  readonly name = 'test'

  constructor(
    private readonly electron = false,
    private readonly mobile = false
  ) {
    super()
  }

  override isElectron(): boolean {
    return this.electron
  }

  override isMobile(): boolean {
    return this.mobile
  }
}

const originalElectronApiDescriptor = Object.getOwnPropertyDescriptor(window, 'electronAPI')
const originalServicesDescriptor = Object.getOwnPropertyDescriptor(window, 'services')
const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent')

function restoreDescriptor(
  target: object,
  key: 'electronAPI' | 'services' | 'userAgent',
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor)
    return
  }

  delete (target as Record<string, unknown>)[key]
}

describe('platform/common/platformService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    restoreDescriptor(window, 'electronAPI', originalElectronApiDescriptor)
    restoreDescriptor(window, 'services', originalServicesDescriptor)
    restoreDescriptor(window.navigator, 'userAgent', originalUserAgentDescriptor)
    delete globalThis.__LUO_APP_RUNTIME__
    PlatformServiceRegistry.clear()
  })

  describe('formatBytes', () => {
    it('returns zero bytes for empty values', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(NaN)).toBe('0 B')
    })

    it('clamps negative decimals and formats large units', () => {
      expect(formatBytes(1536, -1)).toBe('2 KB')
      expect(formatBytes(1024 ** 4)).toBe('1 TB')
    })
  })

  describe('detectMobile', () => {
    it('returns false without a window object', () => {
      vi.stubGlobal('window', undefined)
      expect(detectMobile()).toBe(false)
    })

    it('detects small screens', () => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 768
      })

      expect(detectMobile()).toBe(true)
    })

    it('detects mobile user agents on wide screens', () => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1440
      })
      Object.defineProperty(window.navigator, 'userAgent', {
        configurable: true,
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
      })

      expect(detectMobile()).toBe(true)
    })

    it('returns false for desktop user agents on wide screens', () => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1440
      })
      Object.defineProperty(window.navigator, 'userAgent', {
        configurable: true,
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      })

      expect(detectMobile()).toBe(false)
    })
  })

  describe('detectElectron', () => {
    it('returns false when the runtime global is undefined', () => {
      delete globalThis.__LUO_APP_RUNTIME__
      expect(detectElectron()).toBe(false)
    })

    it('returns false for the web runtime', () => {
      globalThis.__LUO_APP_RUNTIME__ = 'web'
      expect(detectElectron()).toBe(false)
    })

    it('returns true for the electron runtime', () => {
      globalThis.__LUO_APP_RUNTIME__ = 'electron'
      expect(detectElectron()).toBe(true)
    })

    it('does not treat preload globals as electron when runtime is web', () => {
      globalThis.__LUO_APP_RUNTIME__ = 'web'
      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: {} as unknown
      })
      Object.defineProperty(window, 'services', {
        configurable: true,
        value: {} as unknown
      })

      expect(detectElectron()).toBe(false)
    })

    it('does not treat the user agent as electron when runtime is web', () => {
      globalThis.__LUO_APP_RUNTIME__ = 'web'
      Object.defineProperty(window.navigator, 'userAgent', {
        configurable: true,
        value: 'Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Electron/40.0.0 Safari/537.36'
      })

      expect(detectElectron()).toBe(false)
    })
  })

  describe('PlatformServiceBase', () => {
    it('prefers electron over mobile when resolving platform', () => {
      expect(new TestPlatformService(true, true).getPlatform()).toBe(Platform.Electron)
      expect(new TestPlatformService(false, true).getPlatform()).toBe(Platform.Mobile)
      expect(new TestPlatformService(false, false).getPlatform()).toBe(Platform.Web)
    })

    it('returns the service name', () => {
      expect(new TestPlatformService().getName()).toBe('test')
    })

    it('warns for unsupported window and ipc actions', () => {
      const service = new TestPlatformService()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const handler = vi.fn()

      service.minimizeWindow()
      service.maximizeWindow()
      service.closeWindow()
      const disposable = service.on('music-control', handler)
      service.send('music-control', { playing: true })
      service.sendPlayingState(true)
      service.sendPlayModeChange(2)

      expect(disposable).toBe(Disposable.none)
      expect(warnSpy).toHaveBeenCalledTimes(5)
      expect(warnSpy).toHaveBeenNthCalledWith(1, '[PlatformService] minimizeWindow not implemented')
      expect(warnSpy).toHaveBeenNthCalledWith(2, '[PlatformService] maximizeWindow not implemented')
      expect(warnSpy).toHaveBeenNthCalledWith(3, '[PlatformService] closeWindow not implemented')
      expect(warnSpy).toHaveBeenNthCalledWith(4, '[PlatformService] on not implemented')
      expect(warnSpy).toHaveBeenNthCalledWith(5, '[PlatformService] send not implemented')
    })

    it('returns empty cache results by default', async () => {
      const service = new TestPlatformService()

      await expect(service.getCacheSize()).resolves.toEqual({
        httpCache: 0,
        httpCacheFormatted: '0 B'
      })
      await expect(service.clearCache({})).resolves.toEqual({
        success: [],
        failed: []
      })
      await expect(service.clearAllCache()).resolves.toEqual({
        success: [],
        failed: []
      })
    })
  })

  describe('PlatformServiceRegistry', () => {
    it('tracks registration lifecycle', () => {
      expect(PlatformServiceRegistry.hasInstance()).toBe(false)

      const service = new TestPlatformService()
      PlatformServiceRegistry.register(service)

      expect(PlatformServiceRegistry.hasInstance()).toBe(true)
      expect(PlatformServiceRegistry.get()).toBe(service)

      PlatformServiceRegistry.clear()
      expect(PlatformServiceRegistry.hasInstance()).toBe(false)
    })
  })
})
