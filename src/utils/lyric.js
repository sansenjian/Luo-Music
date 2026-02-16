/**
 * 歌词解析工具
 * 参考 Hydrogen Music 的歌词解析逻辑
 */

const regNewLine = /\n/
// 优化正则，支持 [00:00] [00:00.00] [00:00.000] 等格式
// 之前的正则 /\[\d{2}:\d{2}.\d{2,3}\]/ 太严格，会导致很多歌词解析失败
const regTime = /\[\d+:\d+(?:\.\d+)?\]/

/**
 * 格式化歌词时间戳为秒数
 * @param {string} timeStr - 时间戳字符串，如 "00:05.50" 或 "01:05.500"
 * @returns {number} 秒数
 */
export function formatLyricTime(timeStr) {
  // Use regex to capture minutes, seconds, and optional milliseconds
  // Supports format: MM:SS.ms or MM:SS
  // Capturing groups:
  // 1. Minutes (\d+)
  // 2. Seconds (\d+)
  // 3. Milliseconds (\d*) (optional)
  const regex = /^(\d+):(\d+)(?:\.(\d+))?$/;
  const match = timeStr.match(regex);

  if (!match) {
    // console.warn(`Invalid lyric time format: ${timeStr}`);
    // Regex expects \d{2}:\d{2}.\d{2,3} but sometimes minutes > 99
    // or parts are missing.
    // Try simpler split
    const parts = timeStr.split(':');
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
  const millisecondsStr = match[3] || '0';
  
  // Normalize milliseconds to seconds (e.g., "50" -> 0.5, "500" -> 0.5, "05" -> 0.05)
  // If original was .50, match[3] is "50". 
  // Standard LRC format usually implies 2 digits = 1/100s, 3 digits = 1/1000s.
  // But simply dividing by 10^length is safer for generic float representation?
  // Actually, standard is usually:
  // [mm:ss.xx] -> xx is hundredths of a second.
  // [mm:ss.xxx] -> xxx is thousandths.
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
 * 解析歌词
 * @param {string} lrcText - 原文歌词
 * @param {string} tlyricText - 翻译歌词
 * @param {string} rlyricText - 罗马音歌词
 * @returns {Array} 解析后的歌词数组
 */
export function parseLyric(lrcText, tlyricText = null, rlyricText = null) {
  if (!lrcText) return []

  const arr = lrcText.split(regNewLine)
  const tarr = tlyricText ? tlyricText.split(regNewLine) : null
  const rarr = rlyricText ? rlyricText.split(regNewLine) : null

  const lyricArr = []

  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === '') continue

    const obj = {}
    const lyctime = arr[i].match(regTime)

    if (!lyctime) continue

    // 提取原文歌词
    obj.lyric = arr[i].split(']')[1]?.trim() || ''
    if (!obj.lyric) continue

    // 检查是否是纯音乐
    if (obj.lyric.indexOf('纯音乐') !== -1) {
      return [{
        lyric: "纯音乐，请欣赏",
        time: 0
      }]
    }

    // 跳过作词作曲信息
    if (obj.lyric.indexOf('作词') !== -1 || obj.lyric.indexOf('作曲') !== -1) {
      continue
    }

    // 匹配翻译歌词
    if (tarr) {
      for (let j = 0; j < tarr.length; j++) {
        if (tarr[j] === '') continue
        if (tarr[j].indexOf(lyctime[0].substring(0, lyctime[0].length - 1)) !== -1) {
          obj.tlyric = tarr[j].split(']')[1]?.trim() || ''
          if (!obj.tlyric) {
            tarr.splice(j, 1)
            j--
            continue
          }
          tarr.splice(j, 1)
          break
        }
      }
    }

    // 匹配罗马音歌词
    if (rarr) {
      for (let k = 0; k < rarr.length; k++) {
        if (rarr[k] === '') continue
        if (rarr[k].indexOf(lyctime[0].substring(0, lyctime[0].length - 1)) !== -1) {
          obj.rlyric = rarr[k].split(']')[1]?.trim() || ''
          if (!obj.rlyric) {
            rarr.splice(k, 1)
            k--
            continue
          }
          rarr.splice(k, 1)
          break
        }
      }
    }

    // 格式化时间
    // match: [ "[00:05.50]", "00:05.50" ] if regex is simple
    // But regTime /\[\d{2}:\d{2}.\d{2,3}\]/ matches the bracketed part
    const timeContent = lyctime[0].slice(1, lyctime[0].length - 1); // remove [ ]
    obj.time = formatLyricTime(timeContent)

    lyricArr.push(obj)
  }

  // 按时间排序
  return lyricArr.sort((a, b) => a.time - b.time)
}

/**
 * 查找当前应该高亮的歌词索引
 * @param {Array} lyrics - 歌词数组
 * @param {number} currentTime - 当前播放时间（秒）
 * @param {number} offset - 提前量（秒），默认 0.2
 * @returns {number} 歌词索引
 */
export function findCurrentLyricIndex(lyrics, currentTime, offset = 0.2) {
  if (!lyrics || lyrics.length === 0) return -1

  const time = currentTime + offset
  const length = lyrics.length - 1

  for (let i = 0; i < lyrics.length; i++) {
    if (i !== length) {
      if (time < lyrics[i + 1].time) {
        return i
      }
    } else {
      if (time > lyrics[i].time) {
        return i
      }
    }
  }

  return -1
}
