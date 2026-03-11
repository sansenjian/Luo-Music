type EventHandler = (data?: unknown) => void
type EventMap = Record<string, EventHandler[]>

export class MockAudio {
  currentTime: number = 0
  duration: number = 100
  volume: number = 1
  paused: boolean = true
  ended: boolean = false
  src: string = ''
  readyState: number = 0
  private _playbackRate: number = 1
  private _events: EventMap = {}

  get playbackRate(): number {
    return this._playbackRate
  }

  set playbackRate(value: number) {
    this._playbackRate = value
    this._trigger('ratechange')
  }

  play(): Promise<void> {
    this.paused = false
    this._trigger('play')
    return Promise.resolve()
  }

  pause(): void {
    this.paused = true
    this._trigger('pause')
  }

  load(): void {
    this._trigger('loadstart')
    // Simulate async loading
    setTimeout(() => {
      this.readyState = 4
      this._trigger('loadedmetadata')
      this._trigger('canplay')
    }, 0)
  }

  addEventListener(event: string, handler: EventHandler): void {
    if (!this._events[event]) this._events[event] = []
    this._events[event].push(handler)
  }

  removeEventListener(event: string, handler: EventHandler): void {
    if (this._events[event]) {
      this._events[event] = this._events[event].filter(h => h !== handler)
    }
  }

  // Helper to trigger events
  private _trigger(event: string, data?: unknown): void {
    if (this._events[event]) {
      this._events[event].forEach(handler => handler(data))
    }
  }
}
