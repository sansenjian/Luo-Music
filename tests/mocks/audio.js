// 模拟 HTMLAudioElement
export class MockAudio {
  constructor() {
    this.currentTime = 0
    this.duration = 0
    this.volume = 1
    this.paused = true
    this.ended = false
    this.src = ''
    this.readyState = 0
    this._listeners = new Map()
  }

  play() {
    this.paused = false
    this._emit('play')
    return Promise.resolve()
  }

  pause() {
    this.paused = true
    this._emit('pause')
  }

  load() {
    this.readyState = 2
    this._emit('canplay')
    this._emit('loadedmetadata')
  }

  addEventListener(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event).add(callback)
  }

  removeEventListener(event, callback) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(callback)
    }
  }

  _emit(event, data) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).forEach(cb => cb(data))
    }
  }

  // 模拟时间更新
  _updateTime(time) {
    this.currentTime = time
    this._emit('timeupdate')
  }

  // 模拟播放结束
  _end() {
    this.ended = true
    this.paused = true
    this._emit('ended')
  }
}

// 全局模拟 Audio
global.Audio = MockAudio
