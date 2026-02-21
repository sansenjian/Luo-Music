class AudioManager {
  constructor() {
    this.audio = new Audio()
    this.callbacks = {}
    this._boundHandlers = {}
    this._initEvents()
    this._setupCrossOrigin()
  }

  _setupCrossOrigin() {
    const isElectron = () => window.navigator.userAgent.indexOf('Electron') > -1
    if (!isElectron()) {
      this.audio.crossOrigin = 'anonymous'
    }
  }

  _initEvents() {
    const events = ['timeupdate', 'loadedmetadata', 'ended', 'play', 'pause', 'error']
    events.forEach(event => {
      this._boundHandlers[event] = (e) => {
        if (this.callbacks[event]) {
          this.callbacks[event](e)
        }
      }
      this.audio.addEventListener(event, this._boundHandlers[event])
    })
  }

  on(event, callback) {
    this.callbacks[event] = callback
  }

  off(event) {
    delete this.callbacks[event]
  }

  destroy() {
    Object.keys(this._boundHandlers).forEach(event => {
      this.audio.removeEventListener(event, this._boundHandlers[event])
    })
    this._boundHandlers = {}
    this.callbacks = {}
    this.audio.pause()
    this.audio.src = ''
    this.audio.load()
  }

  play(url) {
    if (url) {
      this.audio.src = url
      this.audio.load()
    }
    return this.audio.play()
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
    this.audio.currentTime = time
  }

  setVolume(volume) {
    this.audio.volume = Math.max(0, Math.min(1, volume))
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
}

export const audioManager = new AudioManager()
