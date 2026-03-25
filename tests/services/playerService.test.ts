import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('playerService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    // @ts-expect-error test cleanup
    delete window.services
  })

  it('prefers window.services.player methods when available', async () => {
    const play = vi.fn().mockResolvedValue(undefined)
    const pause = vi.fn().mockResolvedValue(undefined)
    const skipToPrevious = vi.fn().mockResolvedValue(undefined)
    const skipToNext = vi.fn().mockResolvedValue(undefined)
    const invoke = vi.fn()

    Object.defineProperty(window, 'services', {
      configurable: true,
      value: {
        player: {
          play,
          pause,
          skipToPrevious,
          skipToNext
        },
        invoke
      }
    })

    const { createPlayerService } = await import('@/services/playerService')
    const service = createPlayerService()

    await service.play()
    await service.pause()
    await service.skipToPrevious()
    await service.skipToNext()

    expect(play).toHaveBeenCalledTimes(1)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(skipToPrevious).toHaveBeenCalledTimes(1)
    expect(skipToNext).toHaveBeenCalledTimes(1)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('falls back to invoke channels when direct player methods are unavailable', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(window, 'services', {
      configurable: true,
      value: {
        player: {},
        invoke
      }
    })

    const { createPlayerService } = await import('@/services/playerService')
    const service = createPlayerService()

    await service.play()
    await service.pause()
    await service.toggle()
    await service.skipToPrevious()
    await service.skipToNext()

    expect(invoke).toHaveBeenNthCalledWith(1, 'player:play')
    expect(invoke).toHaveBeenNthCalledWith(2, 'player:pause')
    expect(invoke).toHaveBeenNthCalledWith(3, 'player:toggle')
    expect(invoke).toHaveBeenNthCalledWith(4, 'player:skip-to-previous')
    expect(invoke).toHaveBeenNthCalledWith(5, 'player:skip-to-next')
  })
})
