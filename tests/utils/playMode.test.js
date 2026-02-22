import { describe, it, expect } from 'vitest'
import { PLAY_MODE, PLAY_MODE_LABELS, PLAY_MODE_ICONS } from '../../src/utils/player/constants/playMode'

describe('PlayMode Constants', () => {
  describe('PLAY_MODE', () => {
    it('应该定义所有播放模式', () => {
      expect(PLAY_MODE.SEQUENTIAL).toBe(0)
      expect(PLAY_MODE.LIST_LOOP).toBe(1)
      expect(PLAY_MODE.SINGLE_LOOP).toBe(2)
      expect(PLAY_MODE.SHUFFLE).toBe(3)
    })

    it('应该有4种播放模式', () => {
      expect(Object.keys(PLAY_MODE).length).toBe(4)
    })

    it('播放模式值应该是连续的整数', () => {
      const values = Object.values(PLAY_MODE)
      expect(values).toEqual([0, 1, 2, 3])
    })
  })

  describe('PLAY_MODE_LABELS', () => {
    it('应该为每种模式定义标签', () => {
      expect(PLAY_MODE_LABELS[PLAY_MODE.SEQUENTIAL]).toBe('顺序播放')
      expect(PLAY_MODE_LABELS[PLAY_MODE.LIST_LOOP]).toBe('列表循环')
      expect(PLAY_MODE_LABELS[PLAY_MODE.SINGLE_LOOP]).toBe('单曲循环')
      expect(PLAY_MODE_LABELS[PLAY_MODE.SHUFFLE]).toBe('随机播放')
    })

    it('应该有4个标签', () => {
      expect(Object.keys(PLAY_MODE_LABELS).length).toBe(4)
    })
  })

  describe('PLAY_MODE_ICONS', () => {
    it('应该为每种模式定义图标', () => {
      expect(PLAY_MODE_ICONS[PLAY_MODE.SEQUENTIAL]).toBeDefined()
      expect(PLAY_MODE_ICONS[PLAY_MODE.LIST_LOOP]).toBeDefined()
      expect(PLAY_MODE_ICONS[PLAY_MODE.SINGLE_LOOP]).toBeDefined()
      expect(PLAY_MODE_ICONS[PLAY_MODE.SHUFFLE]).toBeDefined()
    })

    it('图标应该是字符串类型', () => {
      Object.values(PLAY_MODE_ICONS).forEach(icon => {
        expect(typeof icon).toBe('string')
        expect(icon.length).toBeGreaterThan(0)
      })
    })
  })

  describe('播放模式切换逻辑', () => {
    it('应该能正确循环切换播放模式', () => {
      const modeCount = Object.keys(PLAY_MODE).length
      
      // 模拟切换逻辑
      let currentMode = PLAY_MODE.SEQUENTIAL
      currentMode = (currentMode + 1) % modeCount
      expect(currentMode).toBe(PLAY_MODE.LIST_LOOP)
      
      currentMode = (currentMode + 1) % modeCount
      expect(currentMode).toBe(PLAY_MODE.SINGLE_LOOP)
      
      currentMode = (currentMode + 1) % modeCount
      expect(currentMode).toBe(PLAY_MODE.SHUFFLE)
      
      currentMode = (currentMode + 1) % modeCount
      expect(currentMode).toBe(PLAY_MODE.SEQUENTIAL)
    })
  })
})
