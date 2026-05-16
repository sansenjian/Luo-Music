import type { LyricLine } from '@shared/player/lyric'

export interface LyricDisplayVisibility {
  showOriginal: boolean
  showTrans: boolean
  showRoma: boolean
}

export interface ResolvedLyricDisplayLine {
  time: number
  original: string
  trans: string
  roma: string
  showOriginal: boolean
  showTrans: boolean
  showRoma: boolean
}

type LyricLineLike = Pick<LyricLine, 'text' | 'trans' | 'roma'> & { time?: number }

export function resolveLyricDisplayLine(
  line: LyricLineLike | null | undefined,
  visibility: LyricDisplayVisibility,
  fallbackOriginal = ''
): ResolvedLyricDisplayLine {
  const roma = visibility.showRoma ? line?.roma || '' : ''
  const trans = visibility.showTrans ? line?.trans || '' : ''
  const originalText = line?.text || fallbackOriginal
  const shouldShowOriginal = visibility.showOriginal || (!trans && !roma && Boolean(originalText))

  return {
    time: line?.time ?? 0,
    original: shouldShowOriginal ? originalText : '',
    trans,
    roma,
    showOriginal: shouldShowOriginal && Boolean(originalText),
    showTrans: Boolean(trans),
    showRoma: Boolean(roma)
  }
}
