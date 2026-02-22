import { describe, it, expect, beforeEach } from 'vitest'
import { lyricProcessor } from '../../src/utils/player/modules/lyricProcessor'

describe('LyricProcessor', () => {
  beforeEach(() => {
    lyricProcessor.clear()
  })

  describe('parseAndSet', () => {
    it('应该正确解析纯文本歌词', () => {
      const lrcText = `[00:00.00]第一行歌词
[00:05.00]第二行歌词
[00:10.00]第三行歌词`

      const result = lyricProcessor.parseAndSet(lrcText)

      expect(result).toHaveLength(3)
      expect(result[0].time).toBe(0)
      expect(result[0].lyric).toBe('第一行歌词')
      expect(result[1].time).toBe(5)
      expect(result[1].lyric).toBe('第二行歌词')
      expect(result[2].time).toBe(10)
      expect(result[2].lyric).toBe('第三行歌词')
    })

    it('应该正确解析带翻译的歌词', () => {
      const lrcText = `[00:00.00]原文第一行
[00:05.00]原文第二行`
      const tlyricText = `[00:00.00]Translation 1
[00:05.00]Translation 2`

      const result = lyricProcessor.parseAndSet(lrcText, tlyricText)

      expect(result).toHaveLength(2)
      expect(result[0].lyric).toBe('原文第一行')
      expect(result[0].tlyric).toBe('Translation 1')
      expect(result[1].lyric).toBe('原文第二行')
      expect(result[1].tlyric).toBe('Translation 2')
    })

    it('应该正确解析带罗马音的歌词', () => {
      const lrcText = `[00:00.00]原文
[00:05.00]原文2`
      const rlyricText = `[00:00.00]Roma 1
[00:05.00]Roma 2`

      const result = lyricProcessor.parseAndSet(lrcText, '', rlyricText)

      expect(result).toHaveLength(2)
      expect(result[0].rlyric).toBe('Roma 1')
      expect(result[1].rlyric).toBe('Roma 2')
    })

    it('应该处理空歌词', () => {
      const result = lyricProcessor.parseAndSet('')
      expect(result).toHaveLength(0)
    })

    it('应该跳过只有时间戳没有内容的行', () => {
      const lrcText = `[00:00.00]
[00:05.00]`

      const result = lyricProcessor.parseAndSet(lrcText)

      // 空内容的歌词行会被跳过
      expect(result).toHaveLength(0)
    })
  })

  describe('updateCurrentIndex', () => {
    beforeEach(() => {
      const lrcText = `[00:00.00]第一行
[00:05.00]第二行
[00:10.00]第三行
[00:15.00]第四行`
      lyricProcessor.parseAndSet(lrcText)
    })

    it('应该返回正确的歌词索引', () => {
      expect(lyricProcessor.updateCurrentIndex(0).index).toBe(0)
      expect(lyricProcessor.updateCurrentIndex(2).index).toBe(0)
      expect(lyricProcessor.updateCurrentIndex(5).index).toBe(1)
      expect(lyricProcessor.updateCurrentIndex(7).index).toBe(1)
      expect(lyricProcessor.updateCurrentIndex(10).index).toBe(2)
      expect(lyricProcessor.updateCurrentIndex(15).index).toBe(3)
    })

    it('应该在歌词变化时返回 changed: true', () => {
      // 第一次调用
      const result1 = lyricProcessor.updateCurrentIndex(0)
      expect(result1.changed).toBe(true)
      expect(result1.index).toBe(0)

      // 同一索引，不应该变化
      const result2 = lyricProcessor.updateCurrentIndex(2)
      expect(result2.changed).toBe(false)
      expect(result2.index).toBe(0)

      // 切换到下一个索引
      const result3 = lyricProcessor.updateCurrentIndex(5)
      expect(result3.changed).toBe(true)
      expect(result3.index).toBe(1)
    })

    it('应该处理超出范围的时间', () => {
      expect(lyricProcessor.updateCurrentIndex(-1).index).toBe(-1)
      expect(lyricProcessor.updateCurrentIndex(100).index).toBe(3)
    })
  })

  describe('clear', () => {
    it('应该清空歌词数据', () => {
      const lrcText = `[00:00.00]第一行
[00:05.00]第二行`
      lyricProcessor.parseAndSet(lrcText)

      expect(lyricProcessor.lyrics).toHaveLength(2)

      lyricProcessor.clear()

      expect(lyricProcessor.lyrics).toHaveLength(0)
      expect(lyricProcessor.currentLyricIndex).toBe(-1)
    })
  })

  describe('时间戳解析', () => {
    it('应该支持不同格式的时间戳', () => {
      const lrcText = `[00:00.00]格式1
[00:05.50]格式2
[01:30.25]格式3`

      const result = lyricProcessor.parseAndSet(lrcText)

      expect(result[0].time).toBe(0)
      expect(result[1].time).toBe(5.5)
      expect(result[2].time).toBe(90.25)
    })
  })
})
