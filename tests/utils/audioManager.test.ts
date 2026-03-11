import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PlayerCore as AudioManager } from '../../src/utils/player/core/playerCore'

describe('AudioManager', () => {
    let audioManager: AudioManager

    beforeEach(() => {
        audioManager = new AudioManager()
    })

    it('should set and get playback rate', () => {
        audioManager.setPlaybackRate(1.5)
        expect(audioManager.getPlaybackRate()).toBe(1.5)
    })

    it('should emit ratechange event', () => {
        const spy = vi.fn()
        audioManager.on('ratechange', spy)
        audioManager.setPlaybackRate(2.0)
        expect(spy).toHaveBeenCalled()
    })
})
