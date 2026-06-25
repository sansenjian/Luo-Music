import { describe, it, expect } from 'vitest'
import { mapToolCallToCommand } from '@/extensions/ai-dialogue/commandMapper'
import { COMMANDS } from '@/core/commands/commands'

describe('commandMapper', () => {
  it('maps player_playPause', () => {
    const result = mapToolCallToCommand({
      id: '1',
      function: { name: 'player_playPause', arguments: {} }
    })
    expect(result).toEqual({ commandId: COMMANDS.PLAYER_TOGGLE_PLAY })
  })

  it('maps player_next', () => {
    const result = mapToolCallToCommand({
      id: '2',
      function: { name: 'player_next', arguments: {} }
    })
    expect(result).toEqual({ commandId: COMMANDS.PLAYER_PLAY_NEXT })
  })

  it('maps player_prev', () => {
    const result = mapToolCallToCommand({
      id: '3',
      function: { name: 'player_prev', arguments: {} }
    })
    expect(result).toEqual({ commandId: COMMANDS.PLAYER_PLAY_PREV })
  })

  it('maps player_setVolume', () => {
    const result = mapToolCallToCommand({
      id: '4',
      function: { name: 'player_setVolume', arguments: { volume: 0.5 } }
    })
    expect(result).toEqual({ commandId: COMMANDS.PLAYER_SET_VOLUME, payload: { volume: 0.5 } })
  })

  it('returns null for invalid player_setVolume', () => {
    const result = mapToolCallToCommand({
      id: '5',
      function: { name: 'player_setVolume', arguments: { volume: 'half' } }
    })
    expect(result).toBeNull()
  })

  it('maps player_setMute', () => {
    const result = mapToolCallToCommand({
      id: '6',
      function: { name: 'player_setMute', arguments: { muted: true } }
    })
    expect(result).toEqual({ commandId: COMMANDS.PLAYER_SET_MUTE, payload: { muted: true } })
  })

  it('maps player_setPlayMode', () => {
    const result = mapToolCallToCommand({
      id: '7',
      function: { name: 'player_setPlayMode', arguments: { mode: 'random' } }
    })
    expect(result).toEqual({ commandId: COMMANDS.PLAYER_SET_PLAY_MODE, payload: { mode: 1 } })
  })

  it('maps player_searchAndPlay', () => {
    const result = mapToolCallToCommand({
      id: '8',
      function: { name: 'player_searchAndPlay', arguments: { query: '晴天 周杰伦' } }
    })
    expect(result).toEqual({
      commandId: COMMANDS.PLAYER_SEARCH_AND_PLAY,
      payload: { query: '晴天 周杰伦' }
    })
  })

  it('returns null for unknown tool', () => {
    const result = mapToolCallToCommand({
      id: '9',
      function: { name: 'player_unknown', arguments: {} }
    })
    expect(result).toBeNull()
  })
})
