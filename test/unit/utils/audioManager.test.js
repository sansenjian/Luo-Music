import { describe, it, expect, beforeEach } from 'vitest'
import { audioManager } from '../../../src/utils/audioManager'

describe('AudioManager', () => {
  beforeEach(() => {
    audioManager.destroy()
  })

  it('should have default state', () => {
    expect(audioManager.paused).toBe(true)
    expect(audioManager.currentTime).toBe(0)
    expect(audioManager.duration).toBe(0)
  })

  it('should set volume correctly', () => {
    audioManager.setVolume(0.5)
    expect(audioManager.audio.volume).toBe(0.5)
  })

  it('should clamp volume to valid range', () => {
    audioManager.setVolume(1.5)
    expect(audioManager.audio.volume).toBe(1)
    audioManager.setVolume(-0.5)
    expect(audioManager.audio.volume).toBe(0)
  })

  it('should register and unregister event callbacks', () => {
    const callback = () => {}
    audioManager.on('play', callback)
    expect(audioManager.callbacks.play).toBe(callback)
    audioManager.off('play', callback)
    expect(audioManager.callbacks.play).toBeUndefined()
  })

  it('should seek to correct time', () => {
    audioManager.seek(30)
    expect(audioManager.currentTime).toBe(30)
  })
})
