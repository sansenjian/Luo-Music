import { describe, expect, it } from 'vitest'

import { resolveLyricDisplayLine } from '@/utils/player/lyric-display'

describe('resolveLyricDisplayLine', () => {
  it('shows all enabled lyric layers in the workspace and desktop order', () => {
    const line = resolveLyricDisplayLine(
      {
        text: 'きみと辿り着けるさ',
        trans: '我定会与你共同抵达',
        roma: 'ki mi to ta do ri tsu ke ru sa'
      },
      {
        showOriginal: true,
        showTrans: true,
        showRoma: true
      }
    )

    expect(line).toEqual({
      original: 'きみと辿り着けるさ',
      trans: '我定会与你共同抵达',
      roma: 'ki mi to ta do ri tsu ke ru sa',
      showOriginal: true,
      showTrans: true,
      showRoma: true
    })
  })

  it('hides romanized lyrics when roma display is disabled', () => {
    const line = resolveLyricDisplayLine(
      {
        text: '星降る海',
        trans: '',
        roma: 'ho shi fu ru u mi'
      },
      {
        showOriginal: true,
        showTrans: true,
        showRoma: false
      }
    )

    expect(line.showOriginal).toBe(true)
    expect(line.showTrans).toBe(false)
    expect(line.showRoma).toBe(false)
    expect(line.original).toBe('星降る海')
    expect(line.trans).toBe('')
    expect(line.roma).toBe('')
  })

  it('falls back to original text when every optional lyric layer is hidden', () => {
    const line = resolveLyricDisplayLine(
      {
        text: 'Line 2',
        trans: 'Translated 2',
        roma: 'Roma 2'
      },
      {
        showOriginal: false,
        showTrans: false,
        showRoma: false
      }
    )

    expect(line.showOriginal).toBe(true)
    expect(line.original).toBe('Line 2')
    expect(line.showTrans).toBe(false)
    expect(line.showRoma).toBe(false)
  })
})
