import { describe, expect, it } from 'vitest'

import { LyricEngine, LyricParser, parseLyricTimestamp } from '@/utils/player/core/lyric'

describe('parseLyricTimestamp', () => {
  it('supports minute-second, dotted fractional, and colon millisecond formats', () => {
    expect(parseLyricTimestamp('01:05')).toBe(65)
    expect(parseLyricTimestamp('01:05.50')).toBeCloseTo(65.5)
    expect(parseLyricTimestamp('01:05:500')).toBeCloseTo(65.5)
    expect(parseLyricTimestamp('01:05:50')).toBeCloseTo(65.05)
    expect(parseLyricTimestamp('bad')).toBe(0)
  })
})

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
      { time: 62.05, text: 'Line one', trans: '', roma: '' },
      { time: 63.25, text: 'Line two', trans: '', roma: '' }
    ])
  })

  it('merges nearby translated and romanized timestamps into the original line', () => {
    const lyrics = LyricParser.parse(
      '[00:01.00]Hello\n[00:02.00]World',
      '[00:01.04]你好\n[00:02.07]世界',
      '[00:01.06]ni hao'
    )

    expect(lyrics).toEqual([
      { time: 1, text: 'Hello', trans: '你好', roma: 'ni hao' },
      { time: 2, text: 'World', trans: '世界', roma: '' }
    ])
  })

  it('merges netease-style romanized lyrics with moderate timestamp drift into the same block', () => {
    const lyrics = LyricParser.parse(
      '[00:01.00]ほら 見失わないように',
      '[00:01.00]来 别再走丢了',
      '[00:01.35]hora mi u shi na wa na i yo u ni'
    )

    expect(lyrics).toEqual([
      {
        time: 1,
        text: 'ほら 見失わないように',
        trans: '来 别再走丢了',
        roma: 'hora mi u shi na wa na i yo u ni'
      }
    ])
  })

  it('falls back to sequential original-line matching when later romanized timestamps drift too far', () => {
    const lyrics = LyricParser.parse(
      '[00:01.00]きみと辿り着けるさ\n[00:05.00]心には会いたい誰かがいて',
      '[00:01.00]我定会与你共同抵达\n[00:05.00]心中还有一道渴望相见的身影',
      '[00:01.20]ki mi to ta do ri tsu ke ru sa\n[00:07.40]ko ko ro ni wa a i ta i da re ka ga i te'
    )

    expect(lyrics).toEqual([
      {
        time: 1,
        text: 'きみと辿り着けるさ',
        trans: '我定会与你共同抵达',
        roma: 'ki mi to ta do ri tsu ke ru sa'
      },
      {
        time: 5,
        text: '心には会いたい誰かがいて',
        trans: '心中还有一道渴望相见的身影',
        roma: 'ko ko ro ni wa a i ta i da re ka ga i te'
      }
    ])
  })

  it('appends same-timestamp content instead of overwriting it', () => {
    const lyrics = LyricParser.parse(
      '[00:01.00]Line A\n[00:01.00]Line B',
      '[00:01.00]译文 A\n[00:01.00]译文 B',
      '[00:01.00]roma A'
    )

    expect(lyrics).toEqual([
      {
        time: 1,
        text: 'Line A\nLine B',
        trans: '译文 A\n译文 B',
        roma: 'roma A'
      }
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
