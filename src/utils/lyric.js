/**
 * 歌词解析工具
 * 参考 Hydrogen Music 的歌词解析逻辑
 */

// 歌词提前显示的偏移量（秒）
export const LYRIC_OFFSET = 0.3

const regNewLine = /\n/
// 匹配时间标签，支持多种格式：
// [00:00] [00:00.00] [00:00.000] [00:00:00] [00:00:000]
// 也支持分钟数超过两位的情况，如 [100:00]
const regTime = /\[\d+:\d+(?:[.:]\d+)?\]/

/**
 * 格式化歌词时间戳为秒数
 * @param {string} timeStr - 时间戳字符串，如 "00:05.50" 或 "01:05.500"
 * @returns {number} 秒数
 */
export function formatLyricTime(timeStr) {
  // Use regex to capture minutes, seconds, and optional milliseconds
  // Supports format: MM:SS.ms, MM:SS:ms, or MM:SS
  // Capturing groups:
  // 1. Minutes (\d+)
  // 2. Seconds (\d+)
  // 3. Milliseconds (\d*) (optional)
  
  // First, normalize colon-based milliseconds to dot-based: MM:SS:ms -> MM:SS.ms
  const normalizedTimeStr = timeStr.replace(/^(\d+:\d+):(\d+)$/, '$1.$2');
  
  const regex = /^(\d+):(\d+)(?:\.(\d+))?$/;
  const match = normalizedTimeStr.match(regex);

  if (!match) {
    // Regex expects \d{2}:\d{2}.\d{2,3} but sometimes minutes > 99
    // or parts are missing.
    // Try simpler split
    const parts = normalizedTimeStr.split(':');
    if (parts.length >= 2) {
        const min = parseInt(parts[0], 10);
        const secParts = parts[1].split('.');
        const sec = parseInt(secParts[0], 10);
        let ms = 0;
        if (secParts.length > 1) {
            ms = parseFloat(`0.${secParts[1]}`);
        }
        return min * 60 + sec + ms;
    }
    return 0;
  }

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  
  // Normalize milliseconds to seconds (e.g., "50" -> 0.5, "500" -> 0.5, "05" -> 0.05)
  let milliseconds = 0;
  if (match[3]) {
    const msLen = match[3].length;
    if (msLen === 2) {
      milliseconds = parseInt(match[3], 10) / 100;
    } else if (msLen === 3) {
      milliseconds = parseInt(match[3], 10) / 1000;
    } else {
       // Fallback for other lengths, treat as fraction
       milliseconds = parseFloat(`0.${match[3]}`);
    }
  }

  return minutes * 60 + seconds + milliseconds;
}

/**
 * 解析歌词到 Map，时间戳作为 key
 * @param {string} text - 歌词文本
 * @returns {Map} 时间戳(毫秒) -> 歌词内容数组的 Map
 */
function parseLyricToMap(text) {
  const map = new Map()
  if (!text) return map
  
  text.split(regNewLine).forEach(line => {
    const match = line.match(regTime)
    if (!match) return
    
    const time = formatLyricTime(match[0].slice(1, -1))
    const content = line.replace(regTime, '').trim()
    if (content) {
      // 使用整数毫秒作为 key，避免浮点数精度问题
      const timeKey = Math.round(time * 1000)
      // 保留相同时间戳下的所有行，避免覆盖
      const existing = map.get(timeKey)
      if (existing) {
        existing.push(content)
      } else {
        map.set(timeKey, [content])
      }
    }
  })
  return map
}

/**
 * 解析歌词
 * @param {string} lrcText - 原文歌词
 * @param {string} tlyricText - 翻译歌词
 * @param {string} rlyricText - 罗马音歌词
 * @returns {Array} 解析后的歌词数组
 */
export function parseLyric(lrcText, tlyricText = null, rlyricText = null) {
  if (!lrcText) return []

  // 检查是否是纯音乐 - 在解析前检查，避免继续处理
  if (lrcText.includes('纯音乐')) {
    return [{
      time: 0,
      lyric: "纯音乐，请欣赏",
      tlyric: '',
      rlyric: ''
    }]
  }

  // 使用 Map 解析所有歌词，提高匹配效率
  const originalMap = parseLyricToMap(lrcText)
  const transMap = parseLyricToMap(tlyricText)
  const romaMap = parseLyricToMap(rlyricText)

  const lyricArr = []
  
  originalMap.forEach((lyricList, timeKey) => {
    const time = timeKey / 1000
    
    // 合并相同时间戳的多行歌词
    const lyric = lyricList.join('\n')
    
    // 跳过作词作曲信息
    if (lyric.includes('作词') || lyric.includes('作曲')) {
      return
    }
    
    // 获取翻译和罗马音（取第一行）
    const transList = transMap.get(timeKey)
    const romaList = romaMap.get(timeKey)
    
    lyricArr.push({
      time,
      lyric,
      tlyric: transList ? transList.join('\n') : '',
      rlyric: romaList ? romaList.join('\n') : ''
    })
  })

  // 按时间排序
  return lyricArr.sort((a, b) => a.time - b.time)
}

/**
 * 查找当前应该高亮的歌词索引
 * @param {Array} lyrics - 歌词数组
 * @param {number} currentTime - 当前播放时间（秒）
 * @param {number} offset - 提前量（秒），默认 LYRIC_OFFSET
 * @returns {number} 歌词索引
 */
export function findCurrentLyricIndex(lyrics, currentTime, offset = LYRIC_OFFSET) {
  if (!lyrics || lyrics.length === 0) return -1

  const time = currentTime + offset
  const length = lyrics.length

  // Binary search for better performance
  let left = 0
  let right = length - 1
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
