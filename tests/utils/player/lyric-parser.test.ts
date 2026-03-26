import { describe, expect, it } from 'vitest'

import {
  LYRIC_OFFSET,
  findCurrentLyricIndex,
  formatLyricTime,
  parseLyric
} from '@/utils/player/lyric-parser'

describe('legacy lyric-parser compatibility', () => {
  it('parses timestamp strings in dot and colon millisecond formats', () => {
    expect(formatLyricTime('01:02')).toBe(62)
    expect(formatLyricTime('01:02.50')).toBeCloseTo(62.5)
    expect(formatLyricTime('01:02:500')).toBeCloseTo(62.5)
    expect(formatLyricTime('01:02:50')).toBeCloseTo(62.05)
    expect(formatLyricTime('bad')).toBe(0)
  })

  it('returns pure-music hint line when lrc marks pure music', () => {
    expect(parseLyric('[00:00.00]纯音乐，请欣赏')).toEqual([
      {
        time: 0,
        lyric: '纯音乐，请欣赏',
        tlyric: '',
        rlyric: ''
      }
    ])
  })

  it('maps core parser fields to legacy lyric/tlyric/rlyric output', () => {
    const parsed = parseLyric(
      '[00:01.00]main line\n[00:02.00]next line',
      '[00:01.00]trans line',
      '[00:01.00]roma line'
    )

    expect(parsed).toEqual([
      {
        time: 1,
        lyric: 'main line',
        tlyric: 'trans line',
        rlyric: 'roma line'
      },
      {
        time: 2,
        lyric: 'next line',
        tlyric: '',
        rlyric: ''
      }
    ])
  })

  it('filters lyric meta lines containing composer or songwriter markers', () => {
    const parsed = parseLyric('[00:00.00]作词: someone\n[00:01.00]real line')
    expect(parsed).toEqual([
      {
        time: 1,
        lyric: 'real line',
        tlyric: '',
        rlyric: ''
      }
    ])
  })

  it('finds active lyric index with configured offset', () => {
    const lyrics = parseLyric('[00:01.00]L1\n[00:03.00]L2\n[00:05.00]L3')

    expect(findCurrentLyricIndex(lyrics, 0.6, LYRIC_OFFSET)).toBe(-1)
    expect(findCurrentLyricIndex(lyrics, 0.71, LYRIC_OFFSET)).toBe(0)
    expect(findCurrentLyricIndex(lyrics, 3.2, LYRIC_OFFSET)).toBe(1)
    expect(findCurrentLyricIndex(lyrics, 5.8, LYRIC_OFFSET)).toBe(2)
  })
})
