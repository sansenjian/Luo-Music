import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { CONTEXT_KEYS } from '../../src/core/context/contextKeys'
import { COMMANDS } from '../../src/core/commands/commands'
import { createCommandService } from '../../src/services/commandService'
import { createContextKeyService } from '../../src/services/contextKeyService'
import { registerService, resetServices } from '../../src/services/registry'
import { IContextKeyService } from '../../src/services/types'
import { usePlayerStore } from '../../src/store/playerStore'

vi.mock('../../src/platform', () => ({
  default: {
    isElectron: vi.fn(() => true),
    send: vi.fn()
  }
}))

describe('commandService', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetServices()
    registerService(IContextKeyService, createContextKeyService)
  })

  it('executes built-in player commands through the store', async () => {
    const context = createContextKeyService()
    resetServices()
    registerService(IContextKeyService, () => context)
    const commandService = createCommandService()
    const playerStore = usePlayerStore()

    context.setContext(CONTEXT_KEYS.PLAYER_HAS_CURRENT_SONG, true)
    context.setContext(CONTEXT_KEYS.PLAYER_HAS_PLAYLIST, true)
    context.setContext(CONTEXT_KEYS.PLAYER_CAN_SEEK, true)

    playerStore.setVolume(0.5)

    await commandService.execute(COMMANDS.PLAYER_VOLUME_UP)
    expect(playerStore.volume).toBeCloseTo(0.6)

    await commandService.execute(COMMANDS.PLAYER_VOLUME_DOWN, { step: 0.2 })
    expect(playerStore.volume).toBeCloseTo(0.4)

    expect(playerStore.isCompact).toBe(false)
    await commandService.execute(COMMANDS.PLAYER_TOGGLE_COMPACT_MODE)
    expect(playerStore.isCompact).toBe(true)
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
})
