/**
 * Enhanced Lyric Core
 * Supports standard LRC and enhanced word-level LRC
 */

// Time format regex: [mm:ss.xx] or <mm:ss.xx>
const TIME_REGEX = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g
const WORD_TIME_REGEX = /<(\d{2}):(\d{2})(?:\.(\d{2,3}))?>/g

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

  static parse(lrc: string, tlyric?: string, rlyric?: string): LyricLine[] {
    if (!lrc) return []

    // Use Map to merge by time (integer ms key)
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
          
          timeMatches.forEach(match => {
            const timeStr = match[1]
            // Fix: ensure parseTime returns number
            const time = LyricParser.parseTime(timeStr) || 0
            const key = Math.round(time * 1000)
            
            if (!linesMap.has(key)) {
              linesMap.set(key, {
                time,
                text: '',
                trans: '',
                roma: ''
              })
            }
            
            const entry = linesMap.get(key)!
            if (type === 'text') entry.text = content
            else if (type === 'trans') entry.trans = content
            else if (type === 'roma') entry.roma = content
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
    const endTime = next ? next.time : (current.time + 5) // Fallback duration 5s
    
    const time = currentTime + this.offset
    const duration = endTime - startTime
    
    if (duration <= 0) return 1
    
    return Math.max(0, Math.min(1, (time - startTime) / duration))
  }
}
