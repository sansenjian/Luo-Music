/**
 * Enhanced Lyric Core
 * Supports standard LRC and enhanced word-level LRC
 */

export interface LyricWord {
  time: number
  duration: number
  text: string
}

export interface LyricLine {
  time: number
  text: string
  trans: string
  roma: string
  words?: LyricWord[] // For enhanced lyrics
}

export class LyricParser {
  private static readonly MERGE_TOLERANCE_MS = 80

  private static parseTime(timeStr: string): number {
    // Format: mm:ss.xx or mm:ss:xx
    const normalized = timeStr.replace(/:(\d+)$/, '.$1')
    const parts = normalized.match(/(\d+):(\d+)(?:\.(\d+))?/)

    if (!parts) return 0

    const min = parseInt(parts[1], 10)
    const sec = parseInt(parts[2], 10)
    const msStr = parts[3] || '0'
    const ms = parseFloat(`0.${msStr}`)

    return min * 60 + sec + ms
  }

  private static mergeField(current: string, next: string): string {
    if (!next) {
      return current
    }

    if (!current) {
      return next
    }

    const existingLines = new Set(current.split('\n'))
    const nextLines = next.split('\n').filter(line => !existingLines.has(line))

    return nextLines.length > 0 ? `${current}\n${nextLines.join('\n')}` : current
  }

  private static findMatchingKey(
    linesMap: Map<number, LyricLine>,
    key: number,
    type: 'text' | 'trans' | 'roma'
  ): number | null {
    if (linesMap.has(key)) {
      return key
    }

    if (type === 'text') {
      return null
    }

    let matchedKey: number | null = null
    let smallestDiff = Number.POSITIVE_INFINITY

    for (const [candidateKey, candidateLine] of linesMap.entries()) {
      if (!candidateLine.text) {
        continue
      }

      const diff = Math.abs(candidateKey - key)
      if (
        diff <= LyricParser.MERGE_TOLERANCE_MS &&
        (diff < smallestDiff ||
          (diff === smallestDiff && matchedKey !== null && candidateKey < matchedKey))
      ) {
        matchedKey = candidateKey
        smallestDiff = diff
      }
    }

    return matchedKey
  }

  static parse(lrc: string, tlyric?: string, rlyric?: string): LyricLine[] {
    if (!lrc) return []

    const linesMap = new Map<number, LyricLine>()

    const parseContent = (text: string, type: 'text' | 'trans' | 'roma') => {
      if (!text || typeof text !== 'string') return

      const lines = text.split('\n')
      lines.forEach(line => {
        // Match all timestamps: [mm:ss.xx]
        // Some lines have multiple: [00:01.00][00:03.00]Text
        const timeMatches = [...line.matchAll(/\[(\d+:\d+(?:[.:]\d+)?)\]/g)]
        if (timeMatches.length > 0) {
          const content = line.replace(/\[\d+:\d+(?:[.:]\d+)?\]/g, '').trim()
          if (!content) {
            return
          }

          timeMatches.forEach(match => {
            const timeStr = match[1]
            const time = LyricParser.parseTime(timeStr) || 0
            const rawKey = Math.round(time * 1000)
            const matchedKey = LyricParser.findMatchingKey(linesMap, rawKey, type)
            const key = matchedKey ?? rawKey

            if (!linesMap.has(key)) {
              linesMap.set(key, {
                time: key / 1000,
                text: '',
                trans: '',
                roma: ''
              })
            }

            const entry = linesMap.get(key)!
            if (type === 'text') {
              entry.text = LyricParser.mergeField(entry.text, content)
            } else if (type === 'trans') {
              entry.trans = LyricParser.mergeField(entry.trans, content)
            } else if (type === 'roma') {
              entry.roma = LyricParser.mergeField(entry.roma, content)
            }
          })
        }
      })
    }

    parseContent(lrc, 'text')
    parseContent(tlyric || '', 'trans')
    parseContent(rlyric || '', 'roma')

    return Array.from(linesMap.values())
      .filter(l => l.text || l.trans || l.roma) // Filter empty entries
      .sort((a, b) => a.time - b.time)
  }
}

export class LyricEngine {
  private lyrics: LyricLine[] = []
  private currentIndex: number = -1
  private offset: number = 0

  constructor(lyrics: LyricLine[] = [], offset: number = 0) {
    this.lyrics = lyrics
    this.offset = offset
  }

  setLyrics(lyrics: LyricLine[]) {
    this.lyrics = lyrics
    this.currentIndex = -1
  }

  /**
   * Update current time and return active line index
   * Uses binary search for efficiency
   */
  update(currentTime: number): number {
    if (!this.lyrics || this.lyrics.length === 0) return -1

    const time = currentTime + this.offset

    // Binary search
    let left = 0
    let right = this.lyrics.length - 1
    // We want to find the last line that starts <= time
    // If time < first line, index should be -1

    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      if (this.lyrics[mid].time <= time) {
        this.currentIndex = mid // Potential match
        left = mid + 1
      } else {
        right = mid - 1
      }
    }

    // Reset if time is before first line
    if (this.currentIndex >= 0 && this.lyrics[this.currentIndex].time > time) {
      this.currentIndex = -1
    }

    return this.currentIndex
  }

  getCurrentLine(): LyricLine | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.lyrics.length) {
      return this.lyrics[this.currentIndex]
    }
    return null
  }

  getNextLine(): LyricLine | null {
    if (this.currentIndex >= -1 && this.currentIndex < this.lyrics.length - 1) {
      return this.lyrics[this.currentIndex + 1]
    }
    return null
  }

  /**
   * Calculate progress of current line (0 to 1)
   * Based on next line time or duration if available
   */
  getProgress(currentTime: number): number {
    const current = this.getCurrentLine()
    if (!current) return 0

    const next = this.getNextLine()
    const startTime = current.time
    const endTime = next ? next.time : current.time + 5 // Fallback duration 5s

    const time = currentTime + this.offset
    const duration = endTime - startTime

    if (duration <= 0) return 1

    return Math.max(0, Math.min(1, (time - startTime) / duration))
  }
}
