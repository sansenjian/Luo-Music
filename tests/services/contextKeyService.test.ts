import { describe, expect, it } from 'vitest'
import { createContextKeyService } from '@/services/contextKeyService'

describe('contextKeyService', () => {
  it('stores values and creates bound keys', () => {
    const service = createContextKeyService()
    const key = service.createKey<boolean>('player.hasPlaylist', false)

    expect(key.get()).toBe(false)

    key.set(true)
    expect(service.getContext('player.hasPlaylist')).toBe(true)

    key.reset()
    expect(key.get()).toBe(false)
  })

  it('evaluates boolean expressions with equality and grouping', () => {
    const service = createContextKeyService()
    service.setContext('platform.isElectron', true)
    service.setContext('player.hasCurrentSong', true)
    service.setContext('player.canSeek', false)
    service.setContext('player.mode', 'loop')

    expect(
      service.contextMatchesRules(
        'platform.isElectron && player.hasCurrentSong && (!player.canSeek || player.mode == "loop")'
      )
    ).toBe(true)

    expect(service.contextMatchesRules('player.mode != "single" && player.canSeek')).toBe(false)
  })
})
