class AudioManager {
  constructor() {
    this.audio = new Audio()
    this.callbacks = {}
    this._initEvents()
  }

  _initEvents() {
    const events = ['timeupdate', 'loadedmetadata', 'ended', 'play', 'pause', 'error']
    events.forEach(event => {
      this.audio.addEventListener(event, (e) => {
        if (this.callbacks[event]) {
          this.callbacks[event](e)
        }
      })
    })
  }

  on(event, callback) {
    // Allow multiple callbacks per event? For now, simple override is fine based on current usage.
    // Ideally, this should support multiple listeners.
    this.callbacks[event] = callback
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
