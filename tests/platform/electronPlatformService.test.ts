import { afterEach, describe, expect, it, vi } from 'vitest'

import { ElectronPlatformService } from '@/platform/electron/electronPlatformService'

describe('ElectronPlatformService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined
    })
    Object.defineProperty(window, 'services', {
      configurable: true,
      value: undefined
    })
  })

  it('uses legacy electronAPI bridge when available', async () => {
    const unsubscribe = vi.fn()
    const api = {
      minimizeWindow: vi.fn(),
      maximizeWindow: vi.fn(),
      closeWindow: vi.fn(),
      on: vi.fn(() => unsubscribe),
      send: vi.fn(),
      supportsSendChannel: vi.fn((channel: string) => channel !== 'unknown-send-channel'),
      sendPlayingState: vi.fn(),
      sendPlayModeChange: vi.fn(),
      getCacheSize: vi.fn().mockResolvedValue({ httpCache: 1, httpCacheFormatted: '1 B' }),
      clearCache: vi.fn().mockResolvedValue({ success: ['cache'], failed: [] }),
      clearAllCache: vi.fn().mockResolvedValue({ success: ['all'], failed: [] })
    }

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: api
    })

    const service = new ElectronPlatformService()

    service.minimizeWindow()
    service.maximizeWindow()
    service.closeWindow()
    service.send('lyric-time-update', { text: 'line' })
    expect(service.supportsSendChannel('lyric-time-update')).toBe(true)
    expect(service.supportsSendChannel('unknown-send-channel')).toBe(false)
    service.sendPlayingState(true)
    service.sendPlayModeChange(2)
    const disposable = service.on('lyric-time-update', vi.fn())
    disposable.dispose()

    await expect(service.getCacheSize()).resolves.toEqual({
      httpCache: 1,
      httpCacheFormatted: '1 B'
    })
    await expect(service.clearCache({ cache: true })).resolves.toEqual({
      success: ['cache'],
      failed: []
    })
    await expect(service.clearAllCache(true)).resolves.toEqual({
      success: ['all'],
      failed: []
    })

    expect(api.minimizeWindow).toHaveBeenCalledTimes(1)
    expect(api.maximizeWindow).toHaveBeenCalledTimes(1)
    expect(api.closeWindow).toHaveBeenCalledTimes(1)
    expect(api.send).toHaveBeenCalledWith('lyric-time-update', { text: 'line' })
    expect(api.sendPlayingState).toHaveBeenCalledWith(true)
    expect(api.sendPlayModeChange).toHaveBeenCalledWith(2)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('falls back to services bridge when electronAPI is missing', async () => {
    const unsubscribe = vi.fn()
    const services = {
      send: vi.fn(),
      supportsSendChannel: vi.fn((channel: string) => channel === 'lyric-time-update'),
      on: vi.fn((_channel: string, listener: (...args: unknown[]) => void) => {
        listener({ text: 'line' })
        return unsubscribe
      }),
      invoke: vi
        .fn()
        .mockResolvedValueOnce({ httpCache: 2, httpCacheFormatted: '2 B' })
        .mockResolvedValueOnce({ success: ['cache'], failed: [] })
        .mockResolvedValueOnce({ success: ['all'], failed: [] }),
      window: {
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        close: vi.fn()
      }
    }

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined
    })
    Object.defineProperty(window, 'services', {
      configurable: true,
      value: services
    })

    const service = new ElectronPlatformService()
    const callback = vi.fn()

    service.minimizeWindow()
    service.maximizeWindow()
    service.closeWindow()
    service.send('lyric-time-update', { text: 'line' })
    expect(service.supportsSendChannel('lyric-time-update')).toBe(true)
    expect(service.supportsSendChannel('desktop-lyric-ready')).toBe(false)
    service.sendPlayingState(true)
    service.sendPlayModeChange(3)
    const disposable = service.on('lyric-time-update', callback)

    await expect(service.getCacheSize()).resolves.toEqual({
      httpCache: 2,
      httpCacheFormatted: '2 B'
    })
    await expect(service.clearCache({ cache: true })).resolves.toEqual({
      success: ['cache'],
      failed: []
    })
    await expect(service.clearAllCache(false)).resolves.toEqual({
      success: ['all'],
      failed: []
    })

    expect(services.window.minimize).toHaveBeenCalledTimes(1)
    expect(services.window.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(services.window.close).toHaveBeenCalledTimes(1)
    expect(services.send).toHaveBeenCalledWith('lyric-time-update', { text: 'line' })
    expect(services.send).toHaveBeenCalledWith('music-playing-check', true)
    expect(services.send).toHaveBeenCalledWith('music-playmode-tray-change', 3)
    expect(callback).toHaveBeenCalledWith({ text: 'line' })

    disposable.dispose()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
