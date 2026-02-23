import { parseLyric, findCurrentLyricIndex, formatLyricTime, LYRIC_OFFSET } from '../../lyric'

export class LyricProcessor {
    constructor() {
        this.lyrics = []
        this.currentLyricIndex = -1
        this.offset = LYRIC_OFFSET
    }

    setLyrics(lyrics) {
        this.lyrics = lyrics || []
        this.currentLyricIndex = -1
    }

    parseAndSet(lrcText, tlyricText = null, rlyricText = null) {
        this.lyrics = parseLyric(lrcText, tlyricText, rlyricText)
        this.currentLyricIndex = -1
        return this.lyrics
    }

    updateCurrentIndex(currentTime) {
        const newIndex = this.getCurrentLyricIndex(currentTime)
        if (newIndex !== this.currentLyricIndex) {
            this.currentLyricIndex = newIndex
            return { changed: true, index: newIndex }
        }
        return { changed: false, index: this.currentLyricIndex }
    }

    getCurrentLyricIndex(currentTime) {
        return findCurrentLyricIndex(this.lyrics, currentTime, this.offset)
    }

    getCurrentLyric() {
        if (this.currentLyricIndex >= 0 && this.currentLyricIndex < this.lyrics.length) {
            return this.lyrics[this.currentLyricIndex]
        }
        return null
    }

    getLyricAtIndex(index) {
        if (index >= 0 && index < this.lyrics.length) {
            return this.lyrics[index]
        }
        return null
    }

    setOffset(offset) {
        this.offset = offset
    }

    getOffset() {
        return this.offset
    }

    clear() {
        this.lyrics = []
        this.currentLyricIndex = -1
    }

    hasLyrics() {
        return this.lyrics.length > 0
    }

    getLyricCount() {
        return this.lyrics.length
    }

    getLyrics() {
        return this.lyrics
    }

    getPreviousLyric() {
        const prevIndex = this.currentLyricIndex - 1
        return this.getLyricAtIndex(prevIndex)
    }

    getNextLyric() {
        const nextIndex = this.currentLyricIndex + 1
        return this.getLyricAtIndex(nextIndex)
    }

    isLyricInRange(index) {
        return index >= 0 && index < this.lyrics.length
    }

    getLyricsInRange(startTime, endTime) {
        return this.lyrics.filter(lyric => 
            lyric.time >= startTime && lyric.time <= endTime
        )
    }

    static formatTime(timeStr) {
        return formatLyricTime(timeStr)
    }
}

export const lyricProcessor = new LyricProcessor()

export {
    parseLyric,
    findCurrentLyricIndex,
    formatLyricTime,
    LYRIC_OFFSET
}
