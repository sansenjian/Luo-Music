import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ElectronAdapter } from '@/platform/core/electron'
import { PlatformAdapter } from '@/platform/core/adapter'
import { WebAdapter } from '@/platform/core/web'

describe('platform core adapters', () => {
  const originalInnerWidth = window.innerWidth
  const originalStorage = navigator.storage
  const originalUserAgent = navigator.userAgent

  beforeEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth
    })
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: originalStorage
    })
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent
    })
  })

  it('provides safe defaults in the base adapter', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const adapter = new PlatformAdapter()

    adapter.minimizeWindow()
    adapter.maximizeWindow()
    adapter.closeWindow()
    adapter.send('event', 1)
    const unsubscribe = adapter.on('event', () => {})

    expect(warn).toHaveBeenCalled()
    expect(typeof unsubscribe).toBe('function')
    await expect(adapter.getCacheSize()).resolves.toEqual({
      httpCache: 0,
      httpCacheFormatted: '0 B'
    })
    await expect(adapter.clearCache()).resolves.toEqual({ success: [], failed: [] })
    expect(adapter.isElectron()).toBe(false)
  })

  it('detects mobile devices in the base adapter', () => {
    const adapter = new PlatformAdapter()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 375
    })

    expect(adapter.isMobile()).toBe(true)
  })

  it('also detects mobile user agents and rejects desktop environments', () => {
    const adapter = new PlatformAdapter()

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1440
    })
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
    })
    expect(adapter.isMobile()).toBe(true)

    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    })
    expect(adapter.isMobile()).toBe(false)
  })

  it('uses navigator storage estimates in the web adapter', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: vi.fn().mockResolvedValue({ usage: 2048 })
      }
    })

    const adapter = new WebAdapter()

    await expect(adapter.getCacheSize()).resolves.toEqual({
      httpCache: 2048,
      httpCacheFormatted: '2 KB'
    })
    expect(adapter.isElectron()).toBe(false)
  })

  it('falls back to base cache size when browser storage estimate is unavailable', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: undefined
    })

    const adapter = new WebAdapter()
    await expect(adapter.getCacheSize()).resolves.toEqual({
      httpCache: 0,
      httpCacheFormatted: '0 B'
    })
  })

  it('returns a noop listener and formats empty storage usage in the web adapter', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: vi.fn().mockResolvedValue({})
      }
    })

    const adapter = new WebAdapter()
    const unsubscribe = adapter.on('channel', () => {})

    expect(typeof unsubscribe).toBe('function')
    await expect(adapter.getCacheSize()).resolves.toEqual({
      httpCache: 0,
      httpCacheFormatted: '0 B'
    })
    expect(
      (
        adapter as unknown as {
          formatBytes: (bytes: number, decimals?: number) => string
        }
      ).formatBytes(1536, -1)
    ).toBe('2 KB')
  })

  it('proxies electron api calls and falls back when preload api is missing', async () => {
    const on = vi.fn((_channel: string, _callback: (data: unknown) => void) => () => {})
    const send = vi.fn()
    const getCacheSize = vi.fn().mockResolvedValue({ httpCache: 11, httpCacheFormatted: '11 B' })
    const clearCache = vi.fn().mockResolvedValue({ success: ['cache'], failed: [] })
    const clearAllCache = vi.fn().mockResolvedValue({ success: ['all'], failed: [] })
    const minimizeWindow = vi.fn()
    const maximizeWindow = vi.fn()
    const closeWindow = vi.fn()
    const sendPlayingState = vi.fn()
    const sendPlayModeChange = vi.fn()

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        on,
        send,
        getCacheSize,
        clearCache,
        clearAllCache,
        minimizeWindow,
        maximizeWindow,
        closeWindow,
        sendPlayingState,
        sendPlayModeChange
      }
    })

    const adapter = new ElectronAdapter()
    adapter.minimizeWindow()
    adapter.maximizeWindow()
    adapter.closeWindow()
    adapter.send('channel', { ok: true })
    adapter.sendPlayingState(true)
    adapter.sendPlayModeChange(2)

    expect(minimizeWindow).toHaveBeenCalled()
    expect(maximizeWindow).toHaveBeenCalled()
    expect(closeWindow).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('channel', { ok: true })
    expect(sendPlayingState).toHaveBeenCalledWith(true)
    expect(sendPlayModeChange).toHaveBeenCalledWith(2)
    await expect(adapter.getCacheSize()).resolves.toEqual({
      httpCache: 11,
      httpCacheFormatted: '11 B'
    })
    await expect(adapter.clearCache({ all: true })).resolves.toEqual({
      success: ['cache'],
      failed: []
    })
    await expect(adapter.clearAllCache(true)).resolves.toEqual({
      success: ['all'],
      failed: []
    })
    expect(adapter.isElectron()).toBe(true)

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fallback = new ElectronAdapter()
    const unsubscribe = fallback.on('channel', () => {})

    await expect(fallback.getCacheSize()).resolves.toEqual({
      httpCache: 0,
      httpCacheFormatted: '0 B'
    })
    await expect(fallback.clearCache({ all: true })).resolves.toEqual({
      success: [],
      failed: []
    })
    await expect(fallback.clearAllCache()).resolves.toEqual({
      success: [],
      failed: []
    })
    expect(typeof unsubscribe).toBe('function')
    expect(error).toHaveBeenCalled()
  })

  it('returns a noop listener when preload exists without an on handler', () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        send: vi.fn()
      }
    })

    const adapter = new ElectronAdapter()
    const unsubscribe = adapter.on('channel', () => {})

    expect(typeof unsubscribe).toBe('function')
  })
})
