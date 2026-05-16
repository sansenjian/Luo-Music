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

/**
 * Parse a lyric timestamp string (minutes:seconds with an optional fractional part) into a seconds value.
 *
 * @param timeStr - Timestamp in the form `mm:ss`, optionally followed by a fractional part using `.` as a decimal fraction (e.g., `01:23.45`) or `:` as milliseconds-like fraction (e.g., `01:23:450`)
 * @returns The total time in seconds represented by `timeStr`; returns `0` if `timeStr` does not match the expected format
 */
export function parseLyricTimestamp(timeStr: string): number {
  const match = timeStr.trim().match(/^(\d+):(\d+)(?:([.:])(\d+))?$/)
  if (!match) {
    return 0
  }

  const minutes = Number.parseInt(match[1], 10)
  const seconds = Number.parseInt(match[2], 10)
  const separator = match[3]
  const fractionRaw = match[4]

  let fraction = 0
  if (fractionRaw) {
    if (separator === '.') {
      fraction = Number.parseFloat(`0.${fractionRaw}`)
    } else {
      fraction = Number.parseInt(fractionRaw, 10) / 1000
    }
  }

  return minutes * 60 + seconds + fraction
}

export class LyricParser {
  private static readonly MERGE_TOLERANCE_MS = 80
  private static readonly FALLBACK_MERGE_TOLERANCE_MS = 500
  private static readonly INFO_TAG_PATTERN =
    /^\[(?:ar|al|ti|by|re|ve|length|tool|encoding|kana|language|id):/i
  private static readonly OFFSET_TAG_PATTERN = /^\[offset:([+-]?\d+)\]$/i
  private static readonly TIMED_WORD_PATTERN = /<(\d+:\d+(?:[.:]\d+)?)(?:,(\d+))?>([^<]*)/g

  private static parseTime(timeStr: string): number {
    return parseLyricTimestamp(timeStr)
  }

  private static normalizeLine(rawLine: string): string {
    return rawLine.replace(/^\uFEFF/, '').trim()
  }

  private static stripInlineMetadata(content: string): string {
    const parts: string[] = []
    let cursor = 0

    while (cursor < content.length) {
      const openIndex = content.indexOf('[', cursor)
      if (openIndex === -1) {
        parts.push(content.slice(cursor))
        break
      }

      if (openIndex > cursor) {
        parts.push(content.slice(cursor, openIndex))
      }

      const closeIndex = content.indexOf(']', openIndex + 1)
      if (closeIndex === -1) {
        parts.push(content.slice(openIndex))
        break
      }

      const tagBody = content.slice(openIndex + 1, closeIndex)
      if (tagBody.includes('[')) {
        parts.push(content[openIndex])
        cursor = openIndex + 1
        continue
      }

      if (!LyricParser.isInlineMetadataBody(tagBody)) {
        parts.push(content.slice(openIndex, closeIndex + 1))
      }

      cursor = closeIndex + 1
    }

    return parts.join('').trim()
  }

  private static isInlineMetadataBody(tagBody: string): boolean {
    return tagBody.indexOf(':') > 0
  }

  private static parseTimedWords(content: string): { text: string; words?: LyricWord[] } {
    const words: LyricWord[] = []
    let plainText = ''

    for (const match of content.matchAll(LyricParser.TIMED_WORD_PATTERN)) {
      const time = LyricParser.parseTime(match[1])
      const duration = match[2] ? Number.parseInt(match[2], 10) / 1000 : 0
      const text = match[3] ?? ''
      if (!text) {
        continue
      }

      words.push({ time, duration, text })
      plainText += text
    }

    if (words.length === 0) {
      return { text: content.trim() }
    }

    return {
      text: plainText.trim(),
      words
    }
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

  private static getAuxiliaryField(line: LyricLine, type: 'trans' | 'roma'): string {
    return type === 'trans' ? line.trans : line.roma
  }

  private static findNearestTextKey(
    linesMap: Map<number, LyricLine>,
    key: number,
    type: 'trans' | 'roma',
    toleranceMs: number
  ): number | null {
    let matchedKey: number | null = null
    let smallestDiff = Number.POSITIVE_INFINITY
    let matchedHasTargetField = true

    for (const [candidateKey, candidateLine] of linesMap.entries()) {
      if (!candidateLine.text) {
        continue
      }

      const diff = Math.abs(candidateKey - key)
      if (diff > toleranceMs) {
        continue
      }

      const candidateHasTargetField = Boolean(LyricParser.getAuxiliaryField(candidateLine, type))

      if (
        matchedKey === null ||
        (matchedHasTargetField && !candidateHasTargetField) ||
        (matchedHasTargetField === candidateHasTargetField &&
          (diff < smallestDiff || (diff === smallestDiff && candidateKey < matchedKey)))
      ) {
        matchedKey = candidateKey
        smallestDiff = diff
        matchedHasTargetField = candidateHasTargetField
      }
    }

    return matchedKey
  }

  private static findSequentialTextKey(
    linesMap: Map<number, LyricLine>,
    type: 'trans' | 'roma',
    lastMatchedKey: number | null
  ): number | null {
    const textKeys = Array.from(linesMap.entries())
      .filter(([, line]) => Boolean(line.text))
      .map(([key]) => key)
      .sort((left, right) => left - right)

    const nextKey = textKeys.find(candidateKey => {
      if (lastMatchedKey !== null && candidateKey <= lastMatchedKey) {
        return false
      }

      const candidateLine = linesMap.get(candidateKey)
      return candidateLine ? !LyricParser.getAuxiliaryField(candidateLine, type) : false
    })

    return nextKey ?? null
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

    const nearbyMatch = LyricParser.findNearestTextKey(
      linesMap,
      key,
      type,
      LyricParser.MERGE_TOLERANCE_MS
    )
    if (nearbyMatch !== null) {
      return nearbyMatch
    }

    return LyricParser.findNearestTextKey(
      linesMap,
      key,
      type,
      LyricParser.FALLBACK_MERGE_TOLERANCE_MS
    )
  }

  static parse(lrc: string, tlyric?: string, rlyric?: string): LyricLine[] {
    if (!lrc) return []

    const linesMap = new Map<number, LyricLine>()

    let offsetMs = 0

    const parseContent = (text: string, type: 'text' | 'trans' | 'roma') => {
      if (!text || typeof text !== 'string') return

      let lastMatchedTextKey: number | null = null

      const lines = text.split('\n')
      lines.forEach(rawLine => {
        const line = LyricParser.normalizeLine(rawLine)
        if (!line || LyricParser.INFO_TAG_PATTERN.test(line)) {
          return
        }

        const offsetMatch = line.match(LyricParser.OFFSET_TAG_PATTERN)
        if (offsetMatch && type === 'text') {
          offsetMs = Number.parseInt(offsetMatch[1], 10)
          return
        }

        // Match all timestamps: [mm:ss.xx]
        // Some lines have multiple: [00:01.00][00:03.00]Text
        const timeMatches = [...line.matchAll(/\[(\d+:\d+(?:[.:]\d+)?)\]/g)]
        if (timeMatches.length > 0) {
          const rawContent = line.replace(/\[\d+:\d+(?:[.:]\d+)?\]/g, '').trim()
          const parsedContent =
            type === 'text'
              ? LyricParser.parseTimedWords(LyricParser.stripInlineMetadata(rawContent))
              : { text: LyricParser.stripInlineMetadata(rawContent) }
          const content = parsedContent.text
          if (!content) {
            return
          }

          timeMatches.forEach(match => {
            const timeStr = match[1]
            const time = LyricParser.parseTime(timeStr) || 0
            const rawKey = Math.max(0, Math.round(time * 1000 + offsetMs))
            const matchedKey = LyricParser.findMatchingKey(linesMap, rawKey, type)
            const sequentialKey =
              matchedKey === null && type !== 'text'
                ? LyricParser.findSequentialTextKey(linesMap, type, lastMatchedTextKey)
                : null
            const key = matchedKey ?? sequentialKey ?? rawKey

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
              if (parsedContent.words) {
                const shiftedWords = parsedContent.words.map(word => ({
                  ...word,
                  time: Math.max(0, word.time + offsetMs / 1000)
                }))
                entry.words = [...(entry.words ?? []), ...shiftedWords]
              }
            } else if (type === 'trans') {
              entry.trans = LyricParser.mergeField(entry.trans, content)
            } else if (type === 'roma') {
              entry.roma = LyricParser.mergeField(entry.roma, content)
            }

            if (entry.text) {
              lastMatchedTextKey = key
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
