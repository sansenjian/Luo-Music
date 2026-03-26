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
 * 格式化歌词时间戳为秒数
 * @param timeStr - 时间戳字符串，如 "00:05.50" 或 "01:05.500"
 * @returns 秒数
 */
export function formatLyricTime(timeStr: string): number {
  return parseLyricTimestamp(timeStr)
}

function shouldTreatAsPureMusic(text: string): boolean {
  return text.includes('纯音乐')
}

function shouldDropMetaLine(text: string): boolean {
  return text.includes('作词') || text.includes('作曲')
}

/**
 * 解析歌词（兼容旧字段：lyric/tlyric/rlyric）
 * @param lrcText - 原文歌词
 * @param tlyricText - 翻译歌词
 * @param rlyricText - 罗马音歌词
 * @returns 解析后的歌词数组
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
 * 查找当前应该高亮的歌词索引
 * @param lyrics - 歌词数组
 * @param currentTime - 当前播放时间（秒）
 * @param offset - 提前量（秒），默认 LYRIC_OFFSET
 * @returns 歌词索引
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
