import { describe, it, expect } from 'vitest'
import { formatTime, formatTimeDetailed, parseTimeToSeconds, formatTimeWithHours } from '../../src/utils/player/helpers/timeFormatter'

describe('TimeFormatter', () => {
  describe('formatTime', () => {
    it('应该正确格式化秒数为 MM:SS 格式', () => {
      expect(formatTime(0)).toBe('00:00')
      expect(formatTime(5)).toBe('00:05')
      expect(formatTime(60)).toBe('01:00')
      expect(formatTime(65)).toBe('01:05')
      expect(formatTime(123)).toBe('02:03')
      expect(formatTime(3599)).toBe('59:59')
    })

    it('应该处理边界值', () => {
      expect(formatTime(null)).toBe('00:00')
      expect(formatTime(undefined)).toBe('00:00')
      expect(formatTime(NaN)).toBe('00:00')
      expect(formatTime(-1)).toBe('00:00')
      expect(formatTime('')).toBe('00:00')
    })

    it('应该正确处理大数值', () => {
      expect(formatTime(3600)).toBe('60:00')
      expect(formatTime(3661)).toBe('61:01')
    })
  })

  describe('formatTimeDetailed', () => {
    it('应该正确格式化为 MM:SS.ms 格式', () => {
      expect(formatTimeDetailed(0)).toBe('00:00.00')
      expect(formatTimeDetailed(5.5)).toBe('00:05.50')
      expect(formatTimeDetailed(60.123)).toBe('01:00.12')
      expect(formatTimeDetailed(65.999)).toBe('01:05.99')
    })

    it('应该处理边界值', () => {
      expect(formatTimeDetailed(null)).toBe('00:00.00')
      expect(formatTimeDetailed(undefined)).toBe('00:00.00')
      expect(formatTimeDetailed(NaN)).toBe('00:00.00')
      expect(formatTimeDetailed(-1)).toBe('00:00.00')
    })
  })

  describe('parseTimeToSeconds', () => {
    it('应该正确解析 MM:SS 格式', () => {
      expect(parseTimeToSeconds('00:00')).toBe(0)
      expect(parseTimeToSeconds('00:05')).toBe(5)
      expect(parseTimeToSeconds('01:00')).toBe(60)
      expect(parseTimeToSeconds('01:05')).toBe(65)
      expect(parseTimeToSeconds('10:30')).toBe(630)
    })

    it('应该正确解析 MM:SS.ms 格式', () => {
      expect(parseTimeToSeconds('00:00.00')).toBe(0)
      expect(parseTimeToSeconds('00:05.50')).toBe(5.5)
      expect(parseTimeToSeconds('01:00.123')).toBe(60.123)
    })

    it('应该处理无效输入', () => {
      expect(parseTimeToSeconds('')).toBe(0)
      expect(parseTimeToSeconds(null)).toBe(0)
      expect(parseTimeToSeconds(undefined)).toBe(0)
      expect(parseTimeToSeconds('invalid')).toBe(0)
      expect(parseTimeToSeconds('abc')).toBe(0)
    })
  })

  describe('formatTimeWithHours', () => {
    it('应该正确格式化为 HH:MM:SS 格式', () => {
      expect(formatTimeWithHours(0)).toBe('00:00:00')
      expect(formatTimeWithHours(5)).toBe('00:00:05')
      expect(formatTimeWithHours(60)).toBe('00:01:00')
      expect(formatTimeWithHours(3600)).toBe('01:00:00')
      expect(formatTimeWithHours(3661)).toBe('01:01:01')
      expect(formatTimeWithHours(86399)).toBe('23:59:59')
    })

    it('应该处理边界值', () => {
      expect(formatTimeWithHours(null)).toBe('00:00:00')
      expect(formatTimeWithHours(undefined)).toBe('00:00:00')
      expect(formatTimeWithHours(NaN)).toBe('00:00:00')
      expect(formatTimeWithHours(-1)).toBe('00:00:00')
    })
  })
})
