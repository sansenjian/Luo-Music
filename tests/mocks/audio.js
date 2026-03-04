export class MockAudio {
  constructor() {
    this.currentTime = 0
    this.duration = 100
    this.volume = 1
    this.paused = true
    this.ended = false
    this.src = ''
    this._playbackRate = 1
    this._events = {}
  }

  get playbackRate() {
    return this._playbackRate
  }

  set playbackRate(value) {
    this._playbackRate = value
    this._trigger('ratechange')
  }

  play() {
    this.paused = false
    this._trigger('play')
    return Promise.resolve()
  }

  pause() {
    this.paused = true
    this._trigger('pause')
  }

  load() {
    this._trigger('loadstart')
    // Simulate async loading
    setTimeout(() => {
        this.readyState = 4
        this._trigger('loadedmetadata')
        this._trigger('canplay')
    }, 0)
  }

  addEventListener(event, handler) {
    if (!this._events[event]) this._events[event] = []
    this._events[event].push(handler)
  }

  removeEventListener(event, handler) {
    if (this._events[event]) {
      this._events[event] = this._events[event].filter(h => h !== handler)
    }
  }

  // Helper to trigger events
  _trigger(event, data) {
    if (this._events[event]) {
      this._events[event].forEach(handler => handler(data))
    }
  }
}
