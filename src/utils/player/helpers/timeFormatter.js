export class TimeFormatter {
    formatTime(seconds) {
        if (!seconds || isNaN(seconds) || seconds < 0) {
            return '00:00'
        }
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    formatTimeDetailed(seconds) {
        if (!seconds || isNaN(seconds) || seconds < 0) {
            return '00:00.00'
        }
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        const ms = Math.floor((seconds % 1) * 100)
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
    }

    parseTimeToSeconds(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return 0
        const match = timeStr.match(/(\d+):(\d+)(?:[.:](\d+))?/)
        if (!match) return 0
        const mins = parseInt(match[1], 10)
        const secs = parseInt(match[2], 10)
        const ms = match[3] ? parseInt(match[3].padEnd(3, '0').substring(0, 3), 10) / 1000 : 0
        return mins * 60 + secs + ms
    }

    formatTimeWithHours(seconds) {
        if (!seconds || isNaN(seconds) || seconds < 0) {
            return '00:00:00'
        }
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        const secs = Math.floor(seconds % 60)
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
}

export const timeFormatter = new TimeFormatter()

export function formatTime(seconds) {
    return timeFormatter.formatTime(seconds)
}

export function formatTimeDetailed(seconds) {
    return timeFormatter.formatTimeDetailed(seconds)
}

export function parseTimeToSeconds(timeStr) {
    return timeFormatter.parseTimeToSeconds(timeStr)
}

export function formatTimeWithHours(seconds) {
    return timeFormatter.formatTimeWithHours(seconds)
}
