import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CONTEXT_KEYS } from '@/core/context/contextKeys'
import { COMMANDS } from '@/core/commands/commands'
import { createCommandService } from '@/services/commandService'
import { createContextKeyService } from '@/services/contextKeyService'
import { registerService, resetServices } from '@/services/registry'
import type { PlatformService } from '@/services/platformService'
import { IContextKeyService, IPlatformService } from '@/services/types'
import { usePlayerStore } from '@/store/playerStore'

const platformServiceMock = vi.hoisted(() => ({
  isElectron: vi.fn(() => true),
  isMobile: vi.fn(() => false),
  minimizeWindow: vi.fn(),
  maximizeWindow: vi.fn(),
  closeWindow: vi.fn(),
  toggleDesktopLyric: vi.fn().mockResolvedValue(undefined),
  send: vi.fn(),
  supportsSendChannel: vi.fn(() => true),
  sendPlayingState: vi.fn(),
  sendPlayModeChange: vi.fn(),
  on: vi.fn(() => () => {}),
  getCacheSize: vi.fn().mockResolvedValue({}),
  clearCache: vi.fn().mockResolvedValue({})
}))

describe('commandService', () => {
  beforeEach(() => {
    resetServices()
    registerService(IContextKeyService, createContextKeyService)
    registerService(IPlatformService, () => platformServiceMock as PlatformService)
    platformServiceMock.isElectron.mockReturnValue(true)
    platformServiceMock.toggleDesktopLyric.mockClear()
    platformServiceMock.send.mockClear()
  })

  it('executes built-in player commands through the store', async () => {
    const context = createContextKeyService()
    const commandService = createCommandService({
      contextKeyService: context,
      platformService: platformServiceMock as unknown as PlatformService,
      getPlayerStore: usePlayerStore
    })
    const playerStore = usePlayerStore()

    context.setContext(CONTEXT_KEYS.PLAYER_HAS_CURRENT_SONG, true)
    context.setContext(CONTEXT_KEYS.PLAYER_HAS_PLAYLIST, true)
    context.setContext(CONTEXT_KEYS.PLAYER_CAN_SEEK, true)

    playerStore.setVolume(0.5)

    await commandService.execute(COMMANDS.PLAYER_VOLUME_UP)
    expect(playerStore.volume).toBeCloseTo(0.6)

    await commandService.execute(COMMANDS.PLAYER_VOLUME_DOWN, { step: 0.2 })
    expect(playerStore.volume).toBeCloseTo(0.4)

    expect(playerStore.isPlayerDocked).toBe(true)
    await commandService.execute(COMMANDS.PLAYER_TOGGLE_PLAYER_DOCKED)
    expect(playerStore.isPlayerDocked).toBe(false)
  })

  it('supports explicit dependency injection without registry lookups', async () => {
    const context = createContextKeyService()
    const commandService = createCommandService({
      contextKeyService: context,
      platformService: platformServiceMock as unknown as PlatformService,
      getPlayerStore: usePlayerStore
    })

    expect(commandService.canExecute(COMMANDS.PLAYER_TOGGLE_PLAY)).toBe(false)
    context.setContext(CONTEXT_KEYS.PLAYER_HAS_CURRENT_SONG, true)
    expect(commandService.canExecute(COMMANDS.PLAYER_TOGGLE_PLAY)).toBe(true)
  })

  it('supports registering and disposing custom commands', async () => {
    const commandService = createCommandService()
    const handler = vi.fn()

    const dispose = commandService.register('test.custom', handler)

    expect(commandService.has('test.custom')).toBe(true)
    await commandService.execute('test.custom', { ok: true })
    expect(handler).toHaveBeenCalledWith({ ok: true })

    dispose()
    expect(commandService.has('test.custom')).toBe(false)
  })

  it('evaluates enablement rules before executing commands', async () => {
    const context = createContextKeyService()
    resetServices()
    registerService(IContextKeyService, () => context)

    const commandService = createCommandService()

    expect(commandService.canExecute(COMMANDS.PLAYER_TOGGLE_PLAY)).toBe(false)

    context.setContext(CONTEXT_KEYS.PLAYER_HAS_CURRENT_SONG, true)
    expect(commandService.canExecute(COMMANDS.PLAYER_TOGGLE_PLAY)).toBe(true)

    context.setContext(CONTEXT_KEYS.PLAYER_HAS_CURRENT_SONG, false)
    await expect(commandService.execute(COMMANDS.PLAYER_TOGGLE_PLAY)).rejects.toThrow(
      'currently disabled'
    )
  })

  it('keeps the latest duplicate registration active and exposes command metadata', async () => {
    const context = createContextKeyService()
    resetServices()
    registerService(IContextKeyService, () => context)

    const commandService = createCommandService()
    const firstHandler = vi.fn()
    const secondHandler = vi.fn()

    const disposeFirst = commandService.register('test.duplicate', firstHandler)
    const disposeSecond = commandService.register('test.duplicate', secondHandler, {
      enablement: 'custom.enabled'
    })

    disposeFirst()

    expect(commandService.get('test.duplicate')).toEqual({
      id: 'test.duplicate',
      enablement: 'custom.enabled'
    })
    expect(commandService.list()).toContain('test.duplicate')

    context.setContext('custom.enabled', true)
    await commandService.execute('test.duplicate')

    expect(firstHandler).not.toHaveBeenCalled()
    expect(secondHandler).toHaveBeenCalledTimes(1)

    disposeSecond()
    expect(commandService.get('test.duplicate')).toBeUndefined()
  })

  it('fires enablement events and stops after listener disposal', () => {
    const context = createContextKeyService()
    resetServices()
    registerService(IContextKeyService, () => context)

    const commandService = createCommandService()
    const listener = vi.fn()
    const subscription = commandService.onDidChangeCommandEnablement(listener)

    const dispose = commandService.register('test.event', vi.fn())
    context.setContext(CONTEXT_KEYS.PLAYER_HAS_CURRENT_SONG, true)
    dispose()

    expect(listener).toHaveBeenCalledWith({ id: 'test.event' })
    expect(listener).toHaveBeenCalledWith({})

    const callCount = listener.mock.calls.length
    subscription.dispose()
    context.setContext(CONTEXT_KEYS.PLAYER_HAS_CURRENT_SONG, false)

    expect(listener).toHaveBeenCalledTimes(callCount)
  })

  it('handles desktop lyric and seek commands across branch conditions', async () => {
    const context = createContextKeyService()
    resetServices()
    registerService(IContextKeyService, () => context)
    // 清除之前测试中可能调用的 send mock
    platformServiceMock.send.mockClear()

    const commandService = createCommandService()
    const playerStore = usePlayerStore()

    context.setContext(CONTEXT_KEYS.PLAYER_CAN_SEEK, true)
    context.setContext('platform.isElectron', true)

    playerStore.duration = 10
    playerStore.progress = 8

    await commandService.execute(COMMANDS.PLAYER_SEEK_FORWARD)
    expect(playerStore.progress).toBe(10)

    await commandService.execute(COMMANDS.PLAYER_SEEK_BACK, { seconds: 20 })
    expect(playerStore.progress).toBe(0)

    platformServiceMock.isElectron.mockReturnValue(false)
    platformServiceMock.toggleDesktopLyric.mockClear()
    platformServiceMock.send.mockClear()
    await commandService.execute(COMMANDS.DESKTOP_LYRIC_TOGGLE)
    expect(platformServiceMock.toggleDesktopLyric).toHaveBeenCalledTimes(1)
    expect(platformServiceMock.send).not.toHaveBeenCalled()

    platformServiceMock.isElectron.mockReturnValue(true)
    platformServiceMock.send.mockClear()
    await commandService.execute(COMMANDS.DESKTOP_LYRIC_TOGGLE)
    expect(platformServiceMock.toggleDesktopLyric).toHaveBeenCalledTimes(2)
    expect(platformServiceMock.send).not.toHaveBeenCalled()
  })

  it('throws when executing a missing command', async () => {
    const commandService = createCommandService()

    await expect(commandService.execute('missing.command')).rejects.toThrow('not registered')
  })
})
