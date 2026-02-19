import { describe, it, expect } from 'vitest'
import { parseLyric, formatLyricTime, findCurrentLyricIndex } from '../../../src/utils/lyric'

describe('Lyric Utils', () => {
  describe('formatLyricTime', () => {
    it('should format MM:SS.ms correctly', () => {
      expect(formatLyricTime('01:30.50')).toBeCloseTo(90.5, 1)
      expect(formatLyricTime('00:05.00')).toBe(5)
      expect(formatLyricTime('02:00.000')).toBe(120)
    })

    it('should handle different millisecond formats', () => {
      expect(formatLyricTime('01:30.5')).toBeCloseTo(90.5, 1)
      expect(formatLyricTime('01:30.50')).toBeCloseTo(90.5, 1)
      expect(formatLyricTime('01:30.500')).toBe(90.5)
    })

    it('should handle colon as millisecond separator', () => {
      expect(formatLyricTime('01:30:50')).toBeCloseTo(90.5, 1)
      expect(formatLyricTime('00:05:00')).toBe(5)
      expect(formatLyricTime('00:00:79')).toBeCloseTo(0.79, 2)
    })

    it('should return 0 for invalid format', () => {
      expect(formatLyricTime('invalid')).toBe(0)
      expect(formatLyricTime('')).toBe(0)
    })
  })

  describe('parseLyric', () => {
    it('should parse simple lyrics', () => {
      const lrc = `[00:05.00]Line 1
[00:10.00]Line 2
[00:15.00]Line 3`
      const result = parseLyric(lrc)
      expect(result).toHaveLength(3)
      expect(result[0].time).toBe(5)
      expect(result[0].lyric).toBe('Line 1')
      expect(result[1].time).toBe(10)
      expect(result[2].time).toBe(15)
    })

    it('should parse lyrics with translation', () => {
      const lrc = `[00:05.00]Hello
[00:10.00]World`
      const tlyric = `[00:05.00]你好
[00:10.00]世界`
      const result = parseLyric(lrc, tlyric)
      expect(result[0].tlyric).toBe('你好')
      expect(result[1].tlyric).toBe('世界')
    })

    it('should return empty array for empty input', () => {
      expect(parseLyric('')).toEqual([])
      expect(parseLyric(null)).toEqual([])
    })

    it('should skip empty lines and metadata', () => {
      const lrc = `[00:05.00]Line 1

[00:10.00]Line 2
[00:15.00]作词: Test`
      const result = parseLyric(lrc)
      expect(result).toHaveLength(2)
    })

    it('should handle pure music marker', () => {
      const lrc = `[00:00.00]纯音乐，请欣赏`
      const result = parseLyric(lrc)
      expect(result).toHaveLength(1)
      expect(result[0].lyric).toBe('纯音乐，请欣赏')
    })
  })

  describe('findCurrentLyricIndex', () => {
    const lyrics = [
      { time: 0, lyric: 'Line 1' },
      { time: 5, lyric: 'Line 2' },
      { time: 10, lyric: 'Line 3' },
      { time: 15, lyric: 'Line 4' },
    ]

    it('should find correct index for given time', () => {
      expect(findCurrentLyricIndex(lyrics, 0)).toBe(0)
      expect(findCurrentLyricIndex(lyrics, 4)).toBe(0)
      expect(findCurrentLyricIndex(lyrics, 7)).toBe(1)
      expect(findCurrentLyricIndex(lyrics, 12)).toBe(2)
      expect(findCurrentLyricIndex(lyrics, 20)).toBe(3)
    })

    it('should return -1 for empty lyrics', () => {
      expect(findCurrentLyricIndex([], 10)).toBe(-1)
      expect(findCurrentLyricIndex(null, 10)).toBe(-1)
    })
  })
})
