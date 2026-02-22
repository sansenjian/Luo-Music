export class ShuffleHelper {
    shuffle(arr, currentSongId, currentIndex, isPlayAll = false) {
        if (!arr || arr.length === 0) return []
        
        const _arr = [...arr]
        
        for (let i = _arr.length - 1; i > 0; i--) {
            const j = this.getRandomInt(0, i)
            const temp = _arr[i]
            _arr[i] = _arr[j]
            _arr[j] = temp
        }

        if (!isPlayAll && currentSongId !== null && currentIndex >= 0) {
            const currentSongIndex = _arr.findIndex(song => song.id === currentSongId)
            if (currentSongIndex !== -1) {
                const currentSong = _arr.splice(currentSongIndex, 1)[0]
                _arr.unshift(currentSong)
            }
        }

        return _arr
    }

    getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min)
    }

    generateShuffledIndices(length, currentIndex = -1) {
        const indices = Array.from({ length }, (_, i) => i)
        
        for (let i = indices.length - 1; i > 0; i--) {
            const j = this.getRandomInt(0, i)
            const temp = indices[i]
            indices[i] = indices[j]
            indices[j] = temp
        }

        if (currentIndex >= 0 && currentIndex < length) {
            const currentIdx = indices.indexOf(currentIndex)
            if (currentIdx !== -1) {
                indices.splice(currentIdx, 1)
                indices.unshift(currentIndex)
            }
        }

        return indices
    }

    getNextShuffledIndex(shuffledIndices, currentShuffleIndex) {
        if (!shuffledIndices || shuffledIndices.length === 0) return -1
        const nextIndex = currentShuffleIndex + 1
        return nextIndex >= shuffledIndices.length ? 0 : nextIndex
    }

    getPrevShuffledIndex(shuffledIndices, currentShuffleIndex) {
        if (!shuffledIndices || shuffledIndices.length === 0) return -1
        const prevIndex = currentShuffleIndex - 1
        return prevIndex < 0 ? shuffledIndices.length - 1 : prevIndex
    }
}

export const shuffleHelper = new ShuffleHelper()
