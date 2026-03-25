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
  crossOrigin: string = ''
  muted: boolean = false
  loop: boolean = false
  private _playbackRate: number = 1
  private _events: EventMap = {}
  buffered: TimeRanges = { length: 0 } as TimeRanges

  // Mock attributes
  private _attributes: Record<string, string> = {}

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

  setAttribute(name: string, value: string): void {
    this._attributes[name] = value
    if (name === 'crossOrigin') {
      this.crossOrigin = value
    }
  }

  removeAttribute(name: string): void {
    delete this._attributes[name]
    if (name === 'src') {
      this.src = ''
    }
  }

  getAttribute(name: string): string | null {
    return this._attributes[name] || null
  }

  // Helper to trigger events (private for internal use)
  private _trigger(event: string, data?: unknown): void {
    if (this._events[event]) {
      this._events[event].forEach(handler => handler(data))
    }
  }

  // Public method for testing
  trigger(event: string, data?: unknown): void {
    this._trigger(event, data)
  }
}
