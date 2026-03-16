export class TimeFormatter {
  formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds) || seconds < 0) {
      return '00:00'
    }
    const totalSeconds = Math.floor(seconds)
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  formatTimeDetailed(seconds: number): string {
    if (!seconds || isNaN(seconds) || seconds < 0) {
      return '00:00.00'
    }
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  parseTimeToSeconds(timeStr: string): number {
    if (!timeStr || typeof timeStr !== 'string') return 0
    const match = timeStr.match(/(\d+):(\d+)(?:[.:](\d+))?/)
    if (!match) return 0

    const mins = parseInt(match[1], 10)
    const secs = parseInt(match[2], 10)

    let ms = 0
    if (match[3]) {
      // Normalize ms to seconds fraction (e.g. .5 -> 0.5, .50 -> 0.5, .500 -> 0.5)
      // Actually regex captures digits. "5" -> 500ms? "05" -> 50ms?
      // Usually lrc format is .xx (hundredths) or .xxx (thousandths)
      // Logic from original code: padEnd(3, '0').substring(0,3) / 1000
      // e.g. "5" -> "500" -> 0.5
      // e.g. "05" -> "050" -> 0.05
      const msStr = match[3]
      // If length is 2 (common), it's hundredths. e.g. .50 = 500ms
      // If length is 3, it's thousandths.
      // If length is 1, usually means tenths? e.g. .5 = 500ms

      // Original logic implementation:
      // match[3] is the captured string part after . or :
      // parseInt(match[3].padEnd(3, '0').substring(0, 3), 10) / 1000
      // Example: "5" -> "500" -> 500/1000 = 0.5
      // Example: "05" -> "050" -> 50/1000 = 0.05
      // Example: "123" -> "123" -> 123/1000 = 0.123

      const paddedMs = msStr.padEnd(3, '0').substring(0, 3)
      ms = parseInt(paddedMs, 10) / 1000
    }

    return mins * 60 + secs + ms
  }

  formatTimeWithHours(seconds: number): string {
    if (!seconds || isNaN(seconds) || seconds < 0) {
      return '00:00:00'
    }
    const totalSeconds = Math.floor(seconds)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
}

export const timeFormatter = new TimeFormatter()

export function formatTime(seconds: number): string {
  return timeFormatter.formatTime(seconds)
}

export function formatTimeDetailed(seconds: number): string {
  return timeFormatter.formatTimeDetailed(seconds)
}

export function parseTimeToSeconds(timeStr: string): number {
  return timeFormatter.parseTimeToSeconds(timeStr)
}

export function formatTimeWithHours(seconds: number): string {
  return timeFormatter.formatTimeWithHours(seconds)
}
