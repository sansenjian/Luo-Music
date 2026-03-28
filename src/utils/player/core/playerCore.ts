import { VOLUME, AUDIO_CONFIG } from '../constants'

export enum PlayerState {
  IDLE = 'idle',
  LOADING = 'loading',
  PLAYING = 'playing',
  PAUSED = 'paused',
  ERROR = 'error'
}

type AudioEventMap = {
  timeupdate: Event
  loadedmetadata: Event
  ended: Event
  play: Event
  pause: Event
  error: Event
  playbackError: unknown
  canplay: Event
  waiting: Event
  playing: Event
  ratechange: Event
  loadstart: Event
  seek: number
  statechange: PlayerState
  volumechange: number
  mutechange: boolean
  loopchange: boolean
}

type EventCallback<K extends keyof AudioEventMap> = (data: AudioEventMap[K]) => void

// 使用联合类型替代 any，提高类型安全性
// 允许 unknown 数据传入回调，但在 emit 时保持类型安全
type SafeCallback = (data: unknown) => void

export class PlayerCore {
  private audio: HTMLAudioElement
  private audioContext: AudioContext | null = null
  private source: MediaElementAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private gainNode: GainNode | null = null

  public state: PlayerState = PlayerState.IDLE
  private callbacks: Map<string, Set<SafeCallback>> = new Map()
  private _boundHandlers: Map<string, EventListener> = new Map()
  private _isDestroyed = false
  private _playRequestId = 0
  private _cancelPendingPlay: (() => void) | null = null

  constructor() {
    this.audio = new Audio()
    this._initEvents()
    this._setupCrossOrigin()
    this._initVolume()
  }

  /**
   * 检查实例是否已被销毁
   * 在调用任何公共方法前应该检查此状态
   */
  private _checkDestroyed(): boolean {
    if (this._isDestroyed) {
      console.warn('[PlayerCore] Method called after destroy()')
      return true
    }
    return false
  }

  private _setupCrossOrigin() {
    // 始终设置 crossOrigin，这对网易云音乐等需要跨域的音频源是必需的
    // Electron 环境下也需要设置，因为音频可能来自不同域名
    this.audio.crossOrigin = AUDIO_CONFIG.CROSS_ORIGIN
    console.log('[PlayerCore] CrossOrigin set to:', AUDIO_CONFIG.CROSS_ORIGIN)
  }

  private _initVolume() {
    this.audio.volume = VOLUME.DEFAULT
  }

  private _initAudioContext() {
    if (!this.audioContext) {
      const AudioContext =
        window.AudioContext ||
        (window as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext
      this.audioContext = new AudioContext()

      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 2048 // Higher resolution for visualization

      this.gainNode = this.audioContext.createGain()
      this.gainNode.connect(this.audioContext.destination)

      // Connect audio element to source
      try {
        this.source = this.audioContext.createMediaElementSource(this.audio)
        this.source.connect(this.analyser)
        this.analyser.connect(this.gainNode)
      } catch (e) {
        console.warn('Failed to create MediaElementSource, visualization may not work:', e)
        // Fallback: connect directly if possible, or just let audio play (it plays by default if not connected?)
        // Actually if we create source, we redirect it. If it fails, audio element plays normally.
      }
    }
  }

  private _initEvents() {
    const events = [
      'timeupdate',
      'loadedmetadata',
      'ended',
      'play',
      'pause',
      'error',
      'canplay',
      'waiting',
      'playing',
      'ratechange',
      'loadstart'
    ]
    events.forEach(event => {
      const handler = (e: Event) => {
        // 防止在销毁后处理事件
        if (this._isDestroyed) {
          this.audio.removeEventListener(event, handler)
          return
        }
        this._handleEvent(event, e)
        this.emit(event as keyof AudioEventMap, e)
      }
      this._boundHandlers.set(event, handler)
      this.audio.addEventListener(event, handler)
    })
  }

  private _handleEvent(event: string, _e: Event) {
    switch (event) {
      case 'loadstart':
      case 'waiting':
        this._setState(PlayerState.LOADING)
        break
      case 'playing':
        this._setState(PlayerState.PLAYING)
        break
      case 'pause':
        this._setState(PlayerState.PAUSED)
        break
      case 'error':
        this._setState(PlayerState.ERROR)
        break
      case 'ended':
        this._setState(PlayerState.PAUSED) // Or IDLE? Usually PAUSED at end or waiting for next
        break
    }
  }

  private _setState(newState: PlayerState) {
    if (this.state !== newState) {
      this.state = newState
      this.emit('statechange', newState)
    }
  }

  public on<K extends keyof AudioEventMap>(event: K, callback: EventCallback<K>): () => void {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, new Set())
    }
    // 安全地将类型特定的回调转换为通用回调
    // 调用时会保证类型安全，因为 emit 使用相同的泛型 K
    const safeCallback = callback as SafeCallback
    this.callbacks.get(event)!.add(safeCallback)
    return () => this.off(event, callback)
  }

  public off<K extends keyof AudioEventMap>(event: K, callback?: EventCallback<K>) {
    if (!callback) {
      this.callbacks.delete(event)
    } else if (this.callbacks.has(event)) {
      const safeCallback = callback as SafeCallback
      this.callbacks.get(event)!.delete(safeCallback)
    }
  }

  public emit<K extends keyof AudioEventMap>(event: K, data: AudioEventMap[K]) {
    const callbacks = this.callbacks.get(event)
    if (callbacks) {
      // 类型断言：我们知道 data 是 AudioEventMap[K] 类型
      // 与注册的回调类型匹配
      callbacks.forEach(cb => cb(data))
    }
  }

  public async play(url?: string): Promise<void> {
    if (this._checkDestroyed()) {
      return
    }

    const requestId = ++this._playRequestId
    this._cancelPendingPlay?.()
    this._cancelPendingPlay = null

    // Initialize AudioContext on first user interaction (play)
    this._initAudioContext()

    // Resume AudioContext if suspended
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }

    if (requestId !== this._playRequestId) {
      return
    }

    try {
      const sourceChanged = Boolean(url && this.audio.src !== url)

      // If url provided and different, load it
      if (url && sourceChanged) {
        // [Leak Fix] Break connection with previous source to help GC
        // When switching songs, explicit load() is crucial.
        this.audio.src = url
        this.audio.load()
      } else if (url && this.audio.src === url && this.audio.ended) {
        // Replay if ended
        this.audio.currentTime = 0
      }

      // If we are already playing the same URL, do nothing or just ensure playing.
      // When the source just changed we must continue and start the new track.
      if (!sourceChanged && !this.audio.paused && this.audio.src === url) {
        return
      }

      // Wait for audio to be ready
      if (this.audio.readyState >= 2) {
        await this.audio.play()
      } else {
        return new Promise((resolve, reject) => {
          let isSettled = false

          const cleanup = () => {
            if (isSettled) return
            isSettled = true
            this.audio.removeEventListener('canplay', onCanPlay)
            this.audio.removeEventListener('error', onError)
            if (this._cancelPendingPlay === cancelPendingPlay) {
              this._cancelPendingPlay = null
            }
          }
          const onCanPlay = () => {
            if (isSettled) return

            if (requestId !== this._playRequestId) {
              cleanup()
              resolve()
              return
            }

            cleanup()
            this.audio.play().then(resolve).catch(reject)
          }
          const onError = (e: Event) => {
            if (isSettled) return

            cleanup()
            if (requestId !== this._playRequestId) {
              resolve()
              return
            }

            reject(e)
          }
          const cancelPendingPlay = () => {
            cleanup()
            resolve()
          }

          this._cancelPendingPlay = cancelPendingPlay

          this.audio.addEventListener('canplay', onCanPlay)
          this.audio.addEventListener('error', onError)
        })
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Ignore AbortError caused by rapid switching
        return
      }
      throw error
    }
  }

  public pause() {
    if (this._checkDestroyed()) {
      return
    }
    this.audio.pause()
  }

  public toggle() {
    if (this._checkDestroyed()) {
      return
    }
    if (this.audio.paused) {
      return this.play()
    } else {
      this.pause()
    }
  }

  public seek(time: number) {
    if (this._checkDestroyed()) {
      return
    }
    if (Number.isFinite(time) && this.audio.duration) {
      // Clamp time
      const t = Math.max(0, Math.min(time, this.audio.duration))
      this.audio.currentTime = t
      this.emit('seek', t)
    }
  }

  public setVolume(volume: number) {
    if (this._checkDestroyed()) {
      return
    }
    const vol = Math.max(VOLUME.MIN, Math.min(VOLUME.MAX, volume))
    this.audio.volume = vol
    // If we want to use GainNode for volume:
    // if (this.gainNode) this.gainNode.gain.value = vol
    // But audio.volume is simpler and works with MediaElementSource
    this.emit('volumechange', vol)
  }

  public getVolume() {
    return this._isDestroyed ? 0 : this.audio.volume
  }

  public setMuted(muted: boolean) {
    if (this._checkDestroyed()) {
      return
    }
    this.audio.muted = muted
    this.emit('mutechange', muted)
  }

  public getMuted() {
    return this._isDestroyed ? false : this.audio.muted
  }

  public setLoop(loop: boolean) {
    if (this._checkDestroyed()) {
      return
    }
    this.audio.loop = loop
    this.emit('loopchange', loop)
  }

  public getLoop() {
    return this._isDestroyed ? false : this.audio.loop
  }

  public setPlaybackRate(rate: number) {
    if (this._checkDestroyed()) {
      return
    }
    if (rate > 0) {
      this.audio.playbackRate = rate
    }
  }

  public getPlaybackRate() {
    return this._isDestroyed ? 1 : this.audio.playbackRate
  }

  // Visualization Data
  public getAnalyserData(array?: Uint8Array): Uint8Array | null {
    if (this._isDestroyed || !this.analyser) return null
    // User should provide Uint8Array of size analyser.frequencyBinCount
    if (!array) {
      array = new Uint8Array(this.analyser.frequencyBinCount)
    }
    this.analyser.getByteFrequencyData(array as Uint8Array<ArrayBuffer>)
    return array
  }

  public getWaveformData(array?: Uint8Array): Uint8Array | null {
    if (this._isDestroyed || !this.analyser) return null
    if (!array) {
      array = new Uint8Array(this.analyser.frequencyBinCount)
    }
    this.analyser.getByteTimeDomainData(array as Uint8Array<ArrayBuffer>)
    return array
  }

  public get frequencyBinCount() {
    return this.analyser ? this.analyser.frequencyBinCount : 0
  }

  // Getters
  public get duration() {
    return this._isDestroyed ? 0 : this.audio.duration || 0
  }

  public get currentTime() {
    return this._isDestroyed ? 0 : this.audio.currentTime || 0
  }

  public get paused() {
    return this._isDestroyed ? true : this.audio.paused
  }

  public get ended() {
    return this._isDestroyed ? true : this.audio.ended
  }

  public get src() {
    return this._isDestroyed ? '' : this.audio.src
  }

  public get buffered() {
    return this._isDestroyed ? ({ length: 0 } as TimeRanges) : this.audio.buffered
  }

  public get bufferedPercent() {
    if (this._isDestroyed || !this.audio.duration) return 0
    const buffered = this.audio.buffered
    if (buffered.length === 0) return 0
    return buffered.end(buffered.length - 1) / this.audio.duration
  }

  public destroy() {
    if (this._isDestroyed) {
      return // 防止重复销毁
    }
    this._isDestroyed = true

    // 移除所有事件监听器
    this._cancelPendingPlay?.()
    this._cancelPendingPlay = null
    this._boundHandlers.forEach((handler, event) => {
      this.audio.removeEventListener(event, handler)
    })
    this._boundHandlers.clear()
    this.callbacks.clear()

    // 停止音频播放
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()

    // 关闭 AudioContext
    if (this.audioContext) {
      void this.audioContext.close()
      this.audioContext = null
    }

    // 清空其他引用
    this.source = null
    this.analyser = null
    this.gainNode = null
  }
}

export const playerCore = new PlayerCore()
