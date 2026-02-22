import { VOLUME, AUDIO_CONFIG } from '../constants'

class AudioManager {
    constructor() {
        this.audio = new Audio()
        this.callbacks = new Map()
        this._boundHandlers = new Map()
        this._initEvents()
        this._setupCrossOrigin()
        this._initVolume()
    }

    _setupCrossOrigin() {
        const isElectron = () => window.navigator.userAgent.indexOf('Electron') > -1
        if (!isElectron()) {
            this.audio.crossOrigin = AUDIO_CONFIG.CROSS_ORIGIN
        }
    }

    _initVolume() {
        this.audio.volume = VOLUME.DEFAULT
    }

    _initEvents() {
        const events = ['timeupdate', 'loadedmetadata', 'ended', 'play', 'pause', 'error', 'canplay', 'waiting', 'playing']
        events.forEach(event => {
            this._boundHandlers.set(event, (e) => {
                const callbacks = this.callbacks.get(event)
                if (callbacks) {
                    callbacks.forEach(cb => cb(e))
                }
            })
            this.audio.addEventListener(event, this._boundHandlers.get(event))
        })
    }

    on(event, callback) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, new Set())
        }
        this.callbacks.get(event).add(callback)
        return () => this.off(event, callback)
    }

    off(event, callback) {
        if (!callback) {
            this.callbacks.delete(event)
        } else if (this.callbacks.has(event)) {
            this.callbacks.get(event).delete(callback)
        }
    }

    emit(event, data) {
        const callbacks = this.callbacks.get(event)
        if (callbacks) {
            callbacks.forEach(cb => cb(data))
        }
    }

    destroy() {
        this._boundHandlers.forEach((handler, event) => {
            this.audio.removeEventListener(event, handler)
        })
        this._boundHandlers.clear()
        this.callbacks.clear()
        this.audio.pause()
        this.audio.src = ''
        this.audio.load()
    }

    async play(url) {
        try {
            // 如果正在播放，先暂停
            if (!this.audio.paused) {
                this.audio.pause()
            }
            
            if (url && this.audio.src !== url) {
                this.audio.src = url
                this.audio.load()
            }
            
            // 等待音频准备好再播放
            if (this.audio.readyState >= 2) {
                return await this.audio.play()
            } else {
                // 等待 canplay 事件
                return new Promise((resolve, reject) => {
                    const onCanPlay = () => {
                        this.audio.removeEventListener('canplay', onCanPlay)
                        this.audio.removeEventListener('error', onError)
                        this.audio.play().then(resolve).catch(reject)
                    }
                    const onError = (e) => {
                        this.audio.removeEventListener('canplay', onCanPlay)
                        this.audio.removeEventListener('error', onError)
                        reject(e)
                    }
                    this.audio.addEventListener('canplay', onCanPlay)
                    this.audio.addEventListener('error', onError)
                })
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                // 忽略由于快速切换导致的取消错误
                console.log('Play request was interrupted, ignoring...')
                return
            }
            throw error
        }
    }

    pause() {
        this.audio.pause()
    }

    toggle() {
        if (this.audio.paused) {
            return this.audio.play()
        } else {
            this.audio.pause()
        }
    }

    seek(time) {
        if (this.audio.duration && time >= 0 && time <= this.audio.duration) {
            this.audio.currentTime = time
            this.emit('seek', time)
        }
    }

    setVolume(volume) {
        const vol = Math.max(VOLUME.MIN, Math.min(VOLUME.MAX, volume))
        this.audio.volume = vol
        this.emit('volumechange', vol)
    }

    getVolume() {
        return this.audio.volume
    }

    setMuted(muted) {
        this.audio.muted = muted
        this.emit('mutechange', muted)
    }

    getMuted() {
        return this.audio.muted
    }

    setLoop(loop) {
        this.audio.loop = loop
        this.emit('loopchange', loop)
    }

    getLoop() {
        return this.audio.loop
    }

    get duration() {
        return this.audio.duration || 0
    }

    get currentTime() {
        return this.audio.currentTime || 0
    }

    get paused() {
        return this.audio.paused
    }

    get ended() {
        return this.audio.ended
    }

    get src() {
        return this.audio.src
    }

    get readyState() {
        return this.audio.readyState
    }

    get buffered() {
        return this.audio.buffered
    }

    get bufferedPercent() {
        if (!this.audio.duration) return 0
        const buffered = this.audio.buffered
        if (buffered.length === 0) return 0
        return buffered.end(buffered.length - 1) / this.audio.duration
    }
}

export const audioManager = new AudioManager()
export { AudioManager }
