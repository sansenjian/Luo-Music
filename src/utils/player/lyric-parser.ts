/**
 * Legacy lyric compatibility helpers.
 *
 * NOTE:
 * 新代码请优先使用 `src/utils/player/core/lyric.ts` 中的 `LyricParser/LyricEngine`。
 * 该文件仅保留旧 API 以兼容历史调用方。
 */

import { LyricParser, parseLyricTimestamp } from './core/lyric'

// 歌词提前显示的偏移量（秒）
export const LYRIC_OFFSET = 0.3
const PURE_MUSIC_HINT = '纯音乐，请欣赏'

export interface LyricLine {
  time: number
  lyric: string
  tlyric: string
  rlyric: string
}

/**
 * Convert a lyric timestamp string into a number of seconds.
 *
 * @param timeStr - Timestamp string (e.g. "00:05.50", "01:05.500")
 * @returns The timestamp expressed in seconds
 */
export function formatLyricTime(timeStr: string): number {
  return parseLyricTimestamp(timeStr)
}

/**
 * Determines whether the given lyric text indicates pure music ('纯音乐').
 *
 * @param text - The lyric line or metadata text to examine
 * @returns `true` if `text` contains '纯音乐', `false` otherwise
 */
function shouldTreatAsPureMusic(text: string): boolean {
  return text.includes('纯音乐')
}

/**
 * Detects whether a lyric line is a metadata line indicating lyricist or composer.
 *
 * @param text - The lyric line text to inspect
 * @returns `true` if `text` contains '作词' or '作曲', `false` otherwise.
 */
function shouldDropMetaLine(text: string): boolean {
  return text.includes('作词') || text.includes('作曲')
}

/**
 * Parse lyric text into an array of legacy-formatted lyric lines.
 *
 * When `lrcText` indicates pure music, returns a single entry at time 0 with `PURE_MUSIC_HINT`.
 *
 * @param lrcText - Original lyric text (may be null)
 * @param tlyricText - Translated lyric text (may be null)
 * @param rlyricText - Romanized lyric text (may be null)
 * @returns An array of `LyricLine` objects, each with `time`, `lyric`, `tlyric`, and `rlyric` fields
 */
export function parseLyric(
  lrcText: string | null,
  tlyricText: string | null = null,
  rlyricText: string | null = null
): LyricLine[] {
  if (!lrcText) {
    return []
  }

  if (shouldTreatAsPureMusic(lrcText)) {
    return [{ time: 0, lyric: PURE_MUSIC_HINT, tlyric: '', rlyric: '' }]
  }

  return LyricParser.parse(lrcText, tlyricText || '', rlyricText || '')
    .map(item => ({
      time: item.time,
      lyric: item.text,
      tlyric: item.trans || '',
      rlyric: item.roma || ''
    }))
    .filter(item => !shouldDropMetaLine(item.lyric))
}

/**
 * Determine the index of the lyric line that should be highlighted for the given playback time.
 *
 * @param lyrics - Array of `LyricLine` entries sorted by `time` in ascending order
 * @param currentTime - Current playback time in seconds
 * @param offset - Lead time in seconds to advance the highlight (defaults to `LYRIC_OFFSET`)
 * @returns The index of the last lyric whose `time` is less than or equal to `currentTime + offset`, or `-1` if no such line exists
 */
export function findCurrentLyricIndex(
  lyrics: LyricLine[],
  currentTime: number,
  offset: number = LYRIC_OFFSET
): number {
  if (!lyrics || lyrics.length === 0) {
    return -1
  }

  const time = currentTime + offset
  let left = 0
  let right = lyrics.length - 1
  let index = -1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    if (lyrics[mid].time <= time) {
      index = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  return index
}
