import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import LyricFloat from '../../src/components/LyricFloat.vue'

const platformState = vi.hoisted(() => {
  const listeners = new Map<string, Set<(data: unknown) => void>>()

  return {
    listeners,
    platformMock: {
      isElectron: vi.fn(() => true),
      on: vi.fn((channel: string, callback: (data: unknown) => void) => {
        const channelListeners = listeners.get(channel) ?? new Set<(data: unknown) => void>()
        channelListeners.add(callback)
        listeners.set(channel, channelListeners)

        return () => {
          channelListeners.delete(callback)
        }
      })
    }
  }
})

const servicesState = vi.hoisted(() => {
  const serviceListeners = new Map<string, Set<(data: unknown) => void>>()

  return {
    serviceListeners,
    servicesMock: {
      window: {
        lockDesktopLyric: vi.fn(),
        close: vi.fn()
      },
      player: {
        play: vi.fn(),
        pause: vi.fn(),
        toggle: vi.fn(),
        skipToPrevious: vi.fn(),
        skipToNext: vi.fn()
      },
      invoke: vi.fn(),
      send: vi.fn(),
      on: vi.fn((channel: string, callback: (data: unknown) => void) => {
        const channelListeners = serviceListeners.get(channel) ?? new Set<(data: unknown) => void>()
        channelListeners.add(callback)
        serviceListeners.set(channel, channelListeners)

        return () => {
          channelListeners.delete(callback)
        }
      })
    }
  }
})

vi.mock('../../src/platform', () => ({
  default: platformState.platformMock
}))

beforeEach(() => {
  // @ts-expect-error - Mock window.services for testing
  global.window.services = servicesState.servicesMock
})

afterEach(() => {
  // @ts-expect-error - Clean up mock
  delete global.window.services
})

describe('LyricFloat', () => {
  const rafQueue: FrameRequestCallback[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    platformState.listeners.clear()
    servicesState.serviceListeners.clear()
    platformState.platformMock.on.mockClear()
    servicesState.servicesMock.window.lockDesktopLyric.mockClear()
    servicesState.servicesMock.player.play.mockClear()
    servicesState.servicesMock.player.pause.mockClear()
    servicesState.servicesMock.player.toggle.mockClear()
    servicesState.servicesMock.invoke.mockClear()
    servicesState.servicesMock.send.mockClear()
    rafQueue.length = 0

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      rafQueue.push(callback)
      return rafQueue.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders lyric updates from IPC through the shared lyric state', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()

    const lyricListeners = platformState.listeners.get('lyric-time-update')
    expect(lyricListeners).toBeDefined()

    lyricListeners?.forEach(listener => {
      listener({
        text: 'Main Line',
        trans: 'Translated Line',
        roma: 'Roma Line'
      })
    })
    await nextTick()

    expect(wrapper.find('.lrc-main').text()).toBe('Main Line')
    expect(wrapper.find('.lrc-sub').text()).toBe('Translated Line')
  })

  it('falls back to roma lyric when translated lyric is empty', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()

    const lyricListeners = platformState.listeners.get('lyric-time-update')
    lyricListeners?.forEach(listener => {
      listener({
        text: 'Main Line',
        trans: '',
        roma: 'Roma Line'
      })
    })
    await nextTick()

    expect(wrapper.find('.lrc-sub').text()).toBe('Roma Line')
  })

  it('requires a deliberate click after unlock activation instead of unlocking on hover', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()

    // Simulate lock state update via desktop-lyric-lock-state channel (window.services.on)
    const lockListeners = servicesState.serviceListeners.get('desktop-lyric-lock-state')
    expect(lockListeners).toBeDefined()
    lockListeners?.forEach(listener => {
      listener({ locked: true })
    })
    await nextTick()

    const unlockButton = wrapper.find('.unlock-btn')
    expect(unlockButton.exists()).toBe(true)

    // Trigger mouseenter to start unlock activation timer
    await unlockButton.trigger('mouseenter')

    // Should not unlock immediately (timer hasn't fired)
    expect(servicesState.servicesMock.window.lockDesktopLyric).not.toHaveBeenCalled()

    // First click should not unlock (timer hasn't fired yet)
    await unlockButton.trigger('click')
    expect(servicesState.servicesMock.window.lockDesktopLyric).not.toHaveBeenCalled()

    // Advance timers past hover activation delay (120ms)
    vi.advanceTimersByTime(120)
    await nextTick()

    // Advance time for guard delay (need to use Date.now mock)
    vi.setSystemTime(Date.now() + 200)

    // Now click should trigger unlock
    await unlockButton.trigger('click')

    // Should have been called with false (unlock)
    expect(servicesState.servicesMock.window.lockDesktopLyric).toHaveBeenCalledWith(false)
  })

  it('updates play button title based on lyric IPC playing state', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()

    const lyricListeners = platformState.listeners.get('lyric-time-update')
    lyricListeners?.forEach(listener => {
      listener({
        text: 'Main Line',
        playing: true
      })
    })
    await nextTick()

    expect(wrapper.find('button[title="Pause"]').exists()).toBe(true)

    lyricListeners?.forEach(listener => {
      listener({
        text: 'Main Line',
        playing: false
      })
    })
    await nextTick()

    expect(wrapper.find('button[title="Play"]').exists()).toBe(true)
  })

  it('sends explicit pause/play commands from play button based on current state', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()

    const lyricListeners = platformState.listeners.get('lyric-time-update')
    lyricListeners?.forEach(listener => {
      listener({
        text: 'Main Line',
        playing: true
      })
    })
    await nextTick()

    await wrapper.find('button[title="Pause"]').trigger('click')
    expect(servicesState.servicesMock.player.pause).toHaveBeenCalledTimes(1)
    expect(servicesState.servicesMock.player.play).toHaveBeenCalledTimes(0)

    lyricListeners?.forEach(listener => {
      listener({
        text: 'Main Line',
        playing: false
      })
    })
    await nextTick()

    await wrapper.find('button[title="Play"]').trigger('click')
    expect(servicesState.servicesMock.player.play).toHaveBeenCalledTimes(1)
  })

  it('batches drag move IPC messages into one frame', async () => {
    const wrapper = mount(LyricFloat)
    await nextTick()

    await wrapper.find('.lyric-window').trigger('mousedown', {
      screenX: 100,
      screenY: 200
    })

    window.dispatchEvent(new MouseEvent('mousemove', { screenX: 110, screenY: 205 }))
    window.dispatchEvent(new MouseEvent('mousemove', { screenX: 120, screenY: 220 }))

    expect(servicesState.servicesMock.send).not.toHaveBeenCalled()
    expect(rafQueue).toHaveLength(1)

    rafQueue[0](0)
    await nextTick()

    expect(servicesState.servicesMock.send).toHaveBeenCalledTimes(1)
    expect(servicesState.servicesMock.send).toHaveBeenCalledWith('desktop-lyric-move', {
      x: 20,
      y: 20
    })

    window.dispatchEvent(new MouseEvent('mouseup'))
  })
})
