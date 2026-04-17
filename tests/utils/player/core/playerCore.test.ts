import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PlayerCore, PlayerState } from '@/utils/player/core/playerCore'
import { VOLUME, AUDIO_CONFIG } from '@/utils/player/constants/volume'

type MockAudioElement = Omit<
  HTMLAudioElement,
  'readyState' | 'paused' | 'ended' | 'duration' | 'buffered'
> & {
  readyState: number
  paused: boolean
  ended: boolean
  duration: number
  buffered: TimeRanges
  trigger: (event: string, payload: Event) => void
}

type PlayerCoreTestInternals = {
  audio: MockAudioElement
  audioContext: MockAudioContext | null
  analyser: MockAnalyserNode | null
  gainNode: MockGainNode | null
  source: MockMediaElementSourceNode | null
  callbacks: Map<string, Set<(value: unknown) => void>>
  _boundHandlers: Map<string, EventListener>
  _setState: (state: PlayerState) => void
}

function getInternals(instance: PlayerCore): PlayerCoreTestInternals {
  return instance as unknown as PlayerCoreTestInternals
}

// Mock AudioContext
class MockAnalyserNode {
  fftSize = 2048
  frequencyBinCount = 1024
  getByteFrequencyData(): void {}
  getByteTimeDomainData(): void {}
  connect(): void {}
}

class MockGainNode {
  gain = { value: 1 }
  connect(): void {}
}

class MockMediaElementSourceNode {
  connect(): void {}
}

class MockAudioContext {
  state = 'suspended'
  destination = {}
  private _analyser: MockAnalyserNode | null = null
  private _gainNode: MockGainNode | null = null

  createAnalyser(): MockAnalyserNode {
    this._analyser = new MockAnalyserNode()
    return this._analyser
  }

  createGain(): MockGainNode {
    this._gainNode = new MockGainNode()
    return this._gainNode
  }

  createMediaElementSource(): MockMediaElementSourceNode {
    const source = new MockMediaElementSourceNode()
    return source
  }

  connect(): void {}

  resume(): Promise<void> {
    this.state = 'running'
    return Promise.resolve()
  }

  close(): Promise<void> {
    return Promise.resolve()
  }
}

describe('PlayerCore', () => {
  let player: PlayerCore

  beforeEach(() => {
    // Mock window.AudioContext
    vi.stubGlobal('AudioContext', MockAudioContext)
    vi.stubGlobal('webkitAudioContext', MockAudioContext)
    player = new PlayerCore()
  })

  afterEach(() => {
    player.destroy()
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with correct default state', () => {
      expect(player.state).toBe(PlayerState.IDLE)
      expect(player.paused).toBe(true)
      expect(player.currentTime).toBe(0)
      expect(player.duration).toBe(100) // Mock default
      expect(player.src).toBe('')
    })

    it('should initialize with default volume', () => {
      expect(player.getVolume()).toBe(VOLUME.DEFAULT)
    })

    it('should initialize audio element without a forced crossOrigin value', () => {
      expect(player.src).toBe('')
      const { audio } = getInternals(player)
      expect(audio.crossOrigin).toBe('')
    })

    it('should initialize audio context on first play', async () => {
      await player.play('test.mp3')
      // AudioContext should be initialized
      expect(window.AudioContext).toBeDefined()
    })
  })

  describe('playback control', () => {
    it('should play audio with URL', async () => {
      const playSpy = vi.spyOn(player, 'play')
      await player.play('test.mp3')
      expect(playSpy).toHaveBeenCalledWith('test.mp3')
    })

    it('should not reload same URL if already loaded', async () => {
      await player.play('test.mp3')
      const { audio } = getInternals(player)
      audio.src = 'test.mp3'
      audio.readyState = 4
      audio.paused = false

      await player.play('test.mp3')
      // Should not reload if same URL and already playing
      expect(audio.src).toBe('test.mp3')
    })

    it('should continue playback when switching to a new URL while the previous song is playing', async () => {
      const { audio } = getInternals(player)
      audio.src = 'https://song.test/old.mp3'
      audio.readyState = 4
      audio.paused = false
      audio.play = vi.fn().mockResolvedValue(undefined)

      await player.play('https://song.test/new.mp3')

      expect(audio.src).toBe('https://song.test/new.mp3')
      expect(audio.play).toHaveBeenCalledTimes(1)
    })

    it('should reset currentTime when replaying ended audio', async () => {
      await player.play('test.mp3')
      const { audio } = getInternals(player)
      audio.ended = true

      await player.play('test.mp3')
      expect(audio.currentTime).toBe(0)
    })

    it('should pause audio', () => {
      player.pause()
      const { audio } = getInternals(player)
      expect(audio.paused).toBe(true)
    })

    it('should toggle playback state', async () => {
      const { audio } = getInternals(player)
      audio.paused = true
      audio.readyState = 4

      await player.toggle()
      expect(audio.paused).toBe(false)

      // Manually pause for testing toggle with paused state
      player.pause()
      expect(audio.paused).toBe(true)
    })

    it('should handle play error', async () => {
      const { audio } = getInternals(player)
      audio.play = vi.fn().mockRejectedValue(new Error('Play failed'))
      audio.readyState = 4

      await expect(player.play('test.mp3')).rejects.toThrow('Play failed')
    })

    it('should ignore AbortError during rapid switching', async () => {
      const { audio } = getInternals(player)
      audio.readyState = 4
      audio.play = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))

      // Should not throw
      await player.play('test.mp3')
      // Test passes if no error is thrown
    })

    it('should wait for canplay if not ready', async () => {
      const { audio } = getInternals(player)
      audio.readyState = 0
      audio.src = ''

      let canplayHandler: (() => void) | undefined
      const originalAddEventListener = audio.addEventListener.bind(audio)
      audio.addEventListener = vi.fn((event: string, handler: () => void) => {
        if (event === 'canplay') {
          canplayHandler = handler
        }
        originalAddEventListener(event, handler)
      })

      // Mock play to return resolved promise
      audio.play = vi.fn().mockResolvedValue(undefined)

      const playPromise = player.play('test.mp3')

      // Wait a bit for the promise setup
      await new Promise(resolve => setTimeout(resolve, 10))

      // Trigger canplay
      if (canplayHandler) {
        canplayHandler()
      }

      await expect(playPromise).resolves.toBeUndefined()
    })

    it('should let a newer play request replace an older request that is still waiting for canplay', async () => {
      const { audio } = getInternals(player)
      audio.readyState = 0
      audio.play = vi.fn().mockResolvedValue(undefined)
      audio.load = vi.fn()

      const firstPlayPromise = player.play('https://song.test/old.mp3')
      const secondPlayPromise = player.play('https://song.test/new.mp3')

      audio.readyState = 4
      audio.trigger('canplay', new Event('canplay'))

      await expect(firstPlayPromise).resolves.toBeUndefined()
      await expect(secondPlayPromise).resolves.toBeUndefined()
      expect(audio.src).toBe('https://song.test/new.mp3')
      expect(audio.play).toHaveBeenCalledTimes(1)
    })

    it('should resume suspended AudioContext', async () => {
      await player.play('test.mp3')
      const { audioContext } = getInternals(player)
      expect(audioContext?.state).toBe('running')
    })
  })

  describe('volume control', () => {
    it('should set volume', () => {
      player.setVolume(0.8)
      expect(player.getVolume()).toBe(0.8)
    })

    it('should clamp volume to MAX', () => {
      player.setVolume(1.5)
      expect(player.getVolume()).toBe(VOLUME.MAX)
    })

    it('should clamp volume to MIN', () => {
      player.setVolume(-0.5)
      expect(player.getVolume()).toBe(VOLUME.MIN)
    })

    it('should emit volumechange event', () => {
      const callback = vi.fn()
      player.on('volumechange', callback)

      player.setVolume(0.5)
      expect(callback).toHaveBeenCalledWith(0.5)
    })

    it('should set muted state', () => {
      player.setMuted(true)
      expect(player.getMuted()).toBe(true)

      player.setMuted(false)
      expect(player.getMuted()).toBe(false)
    })

    it('should emit mutechange event', () => {
      const callback = vi.fn()
      player.on('mutechange', callback)

      player.setMuted(true)
      expect(callback).toHaveBeenCalledWith(true)
    })

    it('should return default volume after destroy', () => {
      player.destroy()
      expect(player.getVolume()).toBe(0)
    })

    it('should return default muted state after destroy', () => {
      player.destroy()
      expect(player.getMuted()).toBe(false)
    })
  })

  describe('seek control', () => {
    it('should seek to valid time', () => {
      const callback = vi.fn()
      player.on('seek', callback)

      player.seek(50)
      const { audio } = getInternals(player)
      expect(audio.currentTime).toBe(50)
      expect(callback).toHaveBeenCalledWith(50)
    })

    it('should clamp seek time to 0', () => {
      player.seek(-10)
      const { audio } = getInternals(player)
      expect(audio.currentTime).toBe(0)
    })

    it('should clamp seek time to duration', () => {
      player.seek(150)
      const { audio } = getInternals(player)
      expect(audio.currentTime).toBe(100) // duration
    })

    it('should not seek if duration is not set', () => {
      const { audio } = getInternals(player)
      audio.duration = NaN

      player.seek(50)
      expect(audio.currentTime).toBe(0)
    })

    it('should not seek after destroy', () => {
      player.destroy()
      const { audio } = getInternals(player)
      const initialTime = audio.currentTime

      player.seek(50)
      expect(audio.currentTime).toBe(initialTime)
    })
  })

  describe('playback rate', () => {
    it('should set playback rate', () => {
      player.setPlaybackRate(1.5)
      expect(player.getPlaybackRate()).toBe(1.5)
    })

    it('should not set invalid playback rate', () => {
      player.setPlaybackRate(0)
      expect(player.getPlaybackRate()).toBe(1)

      player.setPlaybackRate(-1)
      expect(player.getPlaybackRate()).toBe(1)
    })

    it('should return default playback rate after destroy', () => {
      player.destroy()
      expect(player.getPlaybackRate()).toBe(1)
    })

    it('should emit ratechange event when playback rate changes', async () => {
      const callback = vi.fn()
      player.on('ratechange', callback)

      player.setPlaybackRate(2)
      // ratechange is emitted by the audio element mock
      expect(callback).toHaveBeenCalled()
    })
  })

  describe('loop control', () => {
    it('should set loop', () => {
      player.setLoop(true)
      expect(player.getLoop()).toBe(true)
    })

    it('should emit loopchange event', () => {
      const callback = vi.fn()
      player.on('loopchange', callback)

      player.setLoop(true)
      expect(callback).toHaveBeenCalledWith(true)
    })

    it('should return default loop state after destroy', () => {
      player.destroy()
      expect(player.getLoop()).toBe(false)
    })
  })

  describe('event system', () => {
    it('should register event listener with on()', () => {
      const callback = vi.fn()
      player.on('timeupdate', callback)

      player.emit('timeupdate', new Event('timeupdate'))
      expect(callback).toHaveBeenCalledWith(expect.any(Event))
    })

    it('should remove event listener with off()', () => {
      const callback = vi.fn()
      player.on('timeupdate', callback)

      player.off('timeupdate', callback)
      player.emit('timeupdate', new Event('timeupdate'))
      expect(callback).not.toHaveBeenCalled()
    })

    it('should remove all listeners for an event when callback not provided', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      player.on('timeupdate', callback1)
      player.on('timeupdate', callback2)

      player.off('timeupdate')
      player.emit('timeupdate', new Event('timeupdate'))
      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).not.toHaveBeenCalled()
    })

    it('should return unsubscribe function from on()', () => {
      const callback = vi.fn()
      const unsubscribe = player.on('timeupdate', callback)

      unsubscribe()
      player.emit('timeupdate', new Event('timeupdate'))
      expect(callback).not.toHaveBeenCalled()
    })

    it('should handle loadedmetadata event', () => {
      const callback = vi.fn()
      player.on('loadedmetadata', callback)

      player.emit('loadedmetadata', new Event('loadedmetadata'))
      expect(callback).toHaveBeenCalled()
    })

    it('should handle ended event and change state to PAUSED', () => {
      player.state = PlayerState.PLAYING
      const { audio } = getInternals(player)
      audio.trigger('ended', new Event('ended'))
      expect(player.state).toBe(PlayerState.PAUSED)
    })

    it('should handle error event and change state to ERROR', () => {
      player.state = PlayerState.PLAYING
      const { audio } = getInternals(player)
      audio.trigger('error', new Event('error'))
      expect(player.state).toBe(PlayerState.ERROR)
    })

    it('should handle waiting event and change state to LOADING', () => {
      player.state = PlayerState.PLAYING
      const { audio } = getInternals(player)
      audio.trigger('waiting', new Event('waiting'))
      expect(player.state).toBe(PlayerState.LOADING)
    })

    it('should handle playing event and change state to PLAYING', () => {
      player.state = PlayerState.PAUSED
      const { audio } = getInternals(player)
      audio.trigger('playing', new Event('playing'))
      expect(player.state).toBe(PlayerState.PLAYING)
    })

    it('should handle pause event and change state to PAUSED', () => {
      player.state = PlayerState.PLAYING
      const { audio } = getInternals(player)
      audio.trigger('pause', new Event('pause'))
      expect(player.state).toBe(PlayerState.PAUSED)
    })
  })

  describe('getters', () => {
    it('should return current time', () => {
      const { audio } = getInternals(player)
      audio.currentTime = 25.5
      expect(player.currentTime).toBe(25.5)
    })

    it('should return duration', () => {
      const { audio } = getInternals(player)
      audio.duration = 180
      expect(player.duration).toBe(180)
    })

    it('should normalize infinite duration to 0', () => {
      const { audio } = getInternals(player)
      audio.duration = Infinity
      expect(player.duration).toBe(0)
    })

    it('should return paused state', () => {
      const { audio } = getInternals(player)
      audio.paused = false
      expect(player.paused).toBe(false)
    })

    it('should return ended state', () => {
      const { audio } = getInternals(player)
      audio.ended = true
      expect(player.ended).toBe(true)
    })

    it('should return src', () => {
      const { audio } = getInternals(player)
      audio.src = 'test.mp3'
      expect(player.src).toBe('test.mp3')
    })

    it('should return 0 for currentTime after destroy', () => {
      player.destroy()
      expect(player.currentTime).toBe(0)
    })

    it('should return 0 for duration after destroy', () => {
      player.destroy()
      expect(player.duration).toBe(0)
    })

    it('should return true for paused after destroy', () => {
      player.destroy()
      expect(player.paused).toBe(true)
    })

    it('should return true for ended after destroy', () => {
      player.destroy()
      expect(player.ended).toBe(true)
    })

    it('should return empty string for src after destroy', () => {
      player.destroy()
      expect(player.src).toBe('')
    })
  })

  describe('buffered', () => {
    it('should return buffered TimeRanges', () => {
      const { audio } = getInternals(player)
      const mockBuffered = {
        length: 1,
        start: (index: number) => (index === 0 ? 0 : 0),
        end: (index: number) => (index === 0 ? 50 : 0)
      } as TimeRanges
      audio.buffered = mockBuffered
      expect(player.buffered).toBe(mockBuffered)
    })

    it('should return empty TimeRanges after destroy', () => {
      player.destroy()
      expect(player.buffered.length).toBe(0)
    })

    it('should calculate bufferedPercent', () => {
      const { audio } = getInternals(player)
      audio.duration = 100
      audio.buffered = {
        length: 1,
        start: () => 0,
        end: () => 50
      } as TimeRanges
      expect(player.bufferedPercent).toBe(0.5)
    })

    it('should return 0 for bufferedPercent if no buffered data', () => {
      const { audio } = getInternals(player)
      audio.duration = 100
      audio.buffered = { length: 0 } as TimeRanges
      expect(player.bufferedPercent).toBe(0)
    })

    it('should return 0 for bufferedPercent after destroy', () => {
      player.destroy()
      expect(player.bufferedPercent).toBe(0)
    })
  })

  describe('AudioContext and visualization', () => {
    it('should create AudioContext on first play', async () => {
      await player.play('test.mp3')
      const { audioContext } = getInternals(player)
      expect(audioContext).toBeDefined()
    })

    it('should create analyser node', async () => {
      await player.play('test.mp3')
      const { analyser } = getInternals(player)
      expect(analyser).toBeDefined()
      expect(analyser?.fftSize).toBe(2048)
    })

    it('should create gain node', async () => {
      await player.play('test.mp3')
      const { gainNode } = getInternals(player)
      expect(gainNode).toBeDefined()
    })

    it('should get analyser data', async () => {
      await player.play('test.mp3')
      const array = new Uint8Array(1024)
      const result = player.getAnalyserData(array)
      expect(result).toBe(array)
    })

    it('should create new array for analyser data if not provided', async () => {
      await player.play('test.mp3')
      const result = player.getAnalyserData()
      expect(result).toBeInstanceOf(Uint8Array)
    })

    it('should get waveform data', async () => {
      await player.play('test.mp3')
      const array = new Uint8Array(1024)
      const result = player.getWaveformData(array)
      expect(result).toBe(array)
    })

    it('should return frequencyBinCount', async () => {
      await player.play('test.mp3')
      expect(player.frequencyBinCount).toBe(1024)
    })

    it('should return null for analyser data if destroyed', async () => {
      await player.play('test.mp3')
      player.destroy()
      expect(player.getAnalyserData()).toBeNull()
    })

    it('should return null for waveform data if destroyed', async () => {
      await player.play('test.mp3')
      player.destroy()
      expect(player.getWaveformData()).toBeNull()
    })

    it('should return 0 for frequencyBinCount if no analyser', () => {
      expect(player.frequencyBinCount).toBe(0)
    })
  })

  describe('destroy', () => {
    it('should cleanup AudioContext', async () => {
      await player.play('test.mp3')
      const { audioContext } = getInternals(player)
      const closeSpy = vi.spyOn(audioContext!, 'close')

      player.destroy()
      expect(closeSpy).toHaveBeenCalled()
      expect(getInternals(player).audioContext).toBeNull()
    })

    it('should clear all event listeners', () => {
      const callback = vi.fn()
      player.on('timeupdate', callback)

      player.destroy()
      player.emit('timeupdate', new Event('timeupdate'))
      expect(callback).not.toHaveBeenCalled()
    })

    it('should clear callbacks map', () => {
      player.on('timeupdate', vi.fn())
      player.destroy()
      expect(getInternals(player).callbacks.size).toBe(0)
    })

    it('should clear bound handlers', () => {
      player.destroy()
      expect(getInternals(player)._boundHandlers.size).toBe(0)
    })

    it('should pause audio on destroy', () => {
      const { audio } = getInternals(player)
      audio.paused = false

      player.destroy()
      expect(audio.paused).toBe(true)
    })

    it('should remove src attribute on destroy', () => {
      const { audio } = getInternals(player)
      audio.src = 'test.mp3'

      player.destroy()
      expect(audio.src).toBe('')
    })

    it('should set audio context to null', async () => {
      await player.play('test.mp3')
      player.destroy()
      expect(getInternals(player).audioContext).toBeNull()
    })

    it('should set analyser to null', async () => {
      await player.play('test.mp3')
      player.destroy()
      expect(getInternals(player).analyser).toBeNull()
    })

    it('should set gainNode to null', async () => {
      await player.play('test.mp3')
      player.destroy()
      expect(getInternals(player).gainNode).toBeNull()
    })

    it('should set source to null', async () => {
      await player.play('test.mp3')
      player.destroy()
      expect(getInternals(player).source).toBeNull()
    })

    it('should prevent multiple destroy calls', () => {
      const { audio } = getInternals(player)
      const spy = vi.spyOn(audio, 'pause')
      player.destroy()
      player.destroy()
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('should prevent method calls after destroy', () => {
      player.destroy()

      void player.play('test.mp3')
      void player.pause()
      void player.toggle()
      void player.seek(10)
      void player.setVolume(0.5)
      void player.setMuted(true)
      void player.setLoop(true)
      void player.setPlaybackRate(1.5)

      // All should return without error but do nothing
      expect(player.state).toBe(PlayerState.IDLE)
    })
  })

  describe('cross-origin setup', () => {
    it('should use crossOrigin for remote media URLs', async () => {
      const { audio } = getInternals(player)
      audio.readyState = 4
      audio.play = vi.fn().mockResolvedValue(undefined)

      await player.play('https://song.test/remote.mp3')

      expect(audio.crossOrigin).toBe(AUDIO_CONFIG.CROSS_ORIGIN)
    })

    it('should clear crossOrigin for local file media URLs', async () => {
      const { audio } = getInternals(player)
      audio.readyState = 4
      audio.play = vi.fn().mockResolvedValue(undefined)

      await player.play('file:///D:/Music/local-song.mp3')

      expect(audio.crossOrigin).toBe('')
    })
  })

  describe('state management', () => {
    it('should not emit statechange if state is same', () => {
      const callback = vi.fn()
      player.on('statechange', callback)

      player.state = PlayerState.IDLE
      getInternals(player)._setState(PlayerState.IDLE)

      expect(callback).not.toHaveBeenCalled()
    })

    it('should emit statechange when state changes', () => {
      const callback = vi.fn()
      player.on('statechange', callback)

      player.state = PlayerState.IDLE
      getInternals(player)._setState(PlayerState.PLAYING)

      expect(callback).toHaveBeenCalledWith(PlayerState.PLAYING)
      expect(player.state).toBe(PlayerState.PLAYING)
    })
  })

  describe('PlayerState enum', () => {
    it('should have correct state values', () => {
      expect(PlayerState.IDLE).toBe('idle')
      expect(PlayerState.LOADING).toBe('loading')
      expect(PlayerState.PLAYING).toBe('playing')
      expect(PlayerState.PAUSED).toBe('paused')
      expect(PlayerState.ERROR).toBe('error')
    })
  })
})
