import { describe, expect, it, vi } from 'vitest'

import { ShuffleHelper } from '@/utils/player/helpers/shuffleHelper'

describe('shuffleHelper', () => {
  it('returns an empty array when there are no songs to shuffle', () => {
    const helper = new ShuffleHelper()

    expect(helper.shuffle([], null, -1)).toEqual([])
  })

  it('keeps the current song at the front when not playing all songs', () => {
    const helper = new ShuffleHelper()
    const songs = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const random = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.8)

    const shuffled = helper.shuffle(songs, 2, 1)

    expect(shuffled[0].id).toBe(2)
    expect(shuffled).toHaveLength(3)
    expect(random).toHaveBeenCalled()
  })

  it('generates shuffled indices and preserves the current index at the front', () => {
    const helper = new ShuffleHelper()
    vi.spyOn(Math, 'random').mockReturnValue(0.4)

    const indices = helper.generateShuffledIndices(4, 2)

    expect(indices[0]).toBe(2)
    expect(new Set(indices)).toEqual(new Set([0, 1, 2, 3]))
  })

  it('navigates next and previous indices with wraparound', () => {
    const helper = new ShuffleHelper()

    expect(helper.getNextShuffledIndex([], 0)).toBe(-1)
    expect(helper.getPrevShuffledIndex([], 0)).toBe(-1)
    expect(helper.getNextShuffledIndex([3, 1, 2], 2)).toBe(0)
    expect(helper.getPrevShuffledIndex([3, 1, 2], 0)).toBe(2)
    expect(helper.getRandomInt(1, 1)).toBe(1)
  })
})
