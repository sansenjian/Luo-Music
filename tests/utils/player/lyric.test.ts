import { describe, expect, it } from 'vitest'

import { LyricEngine, LyricParser } from '@/utils/player/core/lyric'

describe('LyricParser', () => {
  it('returns empty array for empty lyrics', () => {
    expect(LyricParser.parse('')).toEqual([])
  })

  it('parses main, translated, and romanized lyrics and sorts them by time', () => {
    const lyrics = LyricParser.parse(
      '[00:02.00]World\n[00:01.00][00:03.00]Hello',
      '[00:01.00]你好\n[00:02.00]世界',
      '[00:03.00]ni hao'
    )

    expect(lyrics).toEqual([
      { time: 1, text: 'Hello', trans: '你好', roma: '' },
      { time: 2, text: 'World', trans: '世界', roma: '' },
      { time: 3, text: 'Hello', trans: '', roma: 'ni hao' }
    ])
  })

  it('supports colon-separated millisecond syntax and ignores empty lines', () => {
    const lyrics = LyricParser.parse('[01:02:50]Line one\n[bad]ignored\n[01:03.25]Line two')

    expect(lyrics).toEqual([
      { time: 62.5, text: 'Line one', trans: '', roma: '' },
      { time: 63.25, text: 'Line two', trans: '', roma: '' }
    ])
  })
})

describe('LyricEngine', () => {
  const lyrics = [
    { time: 1, text: 'Line 1', trans: '', roma: '' },
    { time: 3, text: 'Line 2', trans: '', roma: '' },
    { time: 7, text: 'Line 3', trans: '', roma: '' }
  ]

  it('tracks current and next line with binary search updates', () => {
    const engine = new LyricEngine(lyrics)

    expect(engine.update(0.5)).toBe(-1)
    expect(engine.getCurrentLine()).toBeNull()
    expect(engine.getNextLine()).toEqual(lyrics[0])

    expect(engine.update(3.2)).toBe(1)
    expect(engine.getCurrentLine()).toEqual(lyrics[1])
    expect(engine.getNextLine()).toEqual(lyrics[2])
  })

  it('calculates current line progress and supports offsets', () => {
    const engine = new LyricEngine(lyrics, 1)

    engine.update(2.5)
    expect(engine.getCurrentLine()).toEqual(lyrics[1])
    expect(engine.getProgress(2.5)).toBeCloseTo(0.125)
  })

  it('falls back to a 5 second duration for the last line', () => {
    const engine = new LyricEngine(lyrics)

    engine.update(7.5)
    expect(engine.getCurrentLine()).toEqual(lyrics[2])
    expect(engine.getNextLine()).toBeNull()
    expect(engine.getProgress(9.5)).toBeCloseTo(0.5)
  })

  it('resets current index when lyrics are replaced', () => {
    const engine = new LyricEngine(lyrics)
    engine.update(3.1)

    engine.setLyrics([{ time: 5, text: 'New line', trans: '', roma: '' }])

    expect(engine.getCurrentLine()).toBeNull()
    expect(engine.update(5.1)).toBe(0)
  })
})
