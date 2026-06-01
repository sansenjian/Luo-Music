import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App.vue'
import { usePlayerStore } from '@/store/playerStore'
import { createMockSong } from './utils/test-utils'

const routeState = vi.hoisted(() => ({
  path: '/',
  name: 'Home' as string | undefined
}))

const useSmtcExtensionMock = vi.hoisted(() => vi.fn())
const storageGetJSONMock = vi.hoisted(() => vi.fn<(key: string) => unknown | null>(() => null))
const storageGetItemMock = vi.hoisted(() => vi.fn<(key: string) => string | null>(() => null))
const storageSetJSONMock = vi.hoisted(() => vi.fn<(key: string, value: unknown) => void>())
const platformSendMock = vi.hoisted(() => vi.fn<(channel: string, payload: unknown) => void>())
const platformSendPlayingStateMock = vi.hoisted(() => vi.fn<(playing: boolean) => void>())
const platformSendPlayModeChangeMock = vi.hoisted(() => vi.fn<(mode: number) => void>())
const platformOnMock = vi.hoisted(() =>
  vi.fn<(channel: string, callback: (payload: unknown) => void) => () => void>(() => () => {})
)
const windowChromeStateMock = vi.hoisted(() => ({
  isWindowFullScreen: false,
  isWindowMaximized: false,
  isWindowRounded: false
}))

vi.mock('vue-router', () => ({
  useRoute: () => routeState
}))

vi.mock('@/composables/useCommandContext', () => ({
  useCommandContext: vi.fn()
}))

vi.mock('@/extensions/smtc/useSmtcExtension', () => ({
  DESKTOP_LYRIC_ROUTE_PATH: '/desktop-lyric',
  useSmtcExtension: useSmtcExtensionMock
}))

vi.mock('@/composables/useProjectUi', () => ({
  useProjectUi: () => ({
    ensureAvailableRenderStyle: vi.fn()
  })
}))

vi.mock('@/composables/useWindowChromeState', () => ({
  useWindowChromeState: () => windowChromeStateMock
}))

vi.mock('@/services', () => ({
  services: {
    platform: () => ({
      isElectron: () => true,
      send: platformSendMock,
      sendPlayingState: platformSendPlayingStateMock,
      sendPlayModeChange: platformSendPlayModeChangeMock,
      on: platformOnMock
    }),
    storage: () => ({
      getJSON: storageGetJSONMock,
      getItem: storageGetItemMock,
      setJSON: storageSetJSONMock
    })
  }
}))

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        Analytics: true,
        RouterView: true
      }
    }
  })
}

describe('App extension wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.path = '/'
    routeState.name = 'Home'
    window.location.hash = '#/'
    windowChromeStateMock.isWindowFullScreen = false
    windowChromeStateMock.isWindowMaximized = false
    windowChromeStateMock.isWindowRounded = false
  })

  it('starts first-party SMTC extension wiring during app setup', () => {
    mountApp()

    expect(useSmtcExtensionMock).toHaveBeenCalledTimes(1)
  })

  it('syncs the restored player snapshot from the primary Electron window setup', () => {
    const restoredSong = createMockSong({ id: 8, name: 'Restored Startup Song' })
    const playerStore = usePlayerStore()
    playerStore.songList = [restoredSong]
    playerStore.currentIndex = 0
    playerStore.currentSong = restoredSong
    playerStore.progress = 32
    playerStore.duration = 180

    mountApp()

    expect(platformSendMock).toHaveBeenCalledWith(
      'player:sync-state',
      expect.objectContaining({
        isPlaying: false,
        currentSong: expect.objectContaining({
          id: 8,
          name: 'Restored Startup Song'
        }),
        progress: 32,
        duration: 180,
        playlist: [
          expect.objectContaining({
            id: 8,
            name: 'Restored Startup Song'
          })
        ]
      })
    )
  })

  it('does not render the resize frame in the desktop lyric window', () => {
    routeState.path = '/desktop-lyric'
    routeState.name = 'DesktopLyric'
    window.location.hash = '#/desktop-lyric'

    const wrapper = mountApp()

    expect(wrapper.find('.window-resize-frame').exists()).toBe(false)
  })

  it('marks the client app window as rounded while the Electron window is normal', () => {
    windowChromeStateMock.isWindowRounded = true

    const wrapper = mountApp()

    expect(wrapper.find('[data-ui="app-window"]').classes()).toContain('window-rounded')
    expect(wrapper.find('[data-ui="app-window"]').classes()).not.toContain('window-maximized')
    expect(wrapper.find('[data-ui="app-window"]').classes()).not.toContain('window-fullscreen')
  })

  it('keeps the desktop lyric route outside the client window chrome shell', () => {
    routeState.path = '/desktop-lyric'
    routeState.name = 'DesktopLyric'

    const wrapper = mountApp()

    expect(wrapper.find('[data-ui="app-window"]').exists()).toBe(false)
    expect(platformSendMock).not.toHaveBeenCalledWith('player:sync-state', expect.anything())
  })

  it('keeps safe persisted queue fields while normalizing Electron player storage', () => {
    storageGetJSONMock.mockReturnValueOnce({
      volume: 0.6,
      playMode: 1,
      lyricType: ['original', 'roma'],
      isPlayerDocked: true,
      songList: [createMockSong({ id: 7, name: 'Startup Song', url: 'https://song.test/7.mp3' })],
      currentIndex: 0,
      progress: 32,
      duration: 180
    })

    mountApp()

    expect(storageSetJSONMock).toHaveBeenCalledWith(
      'player',
      expect.objectContaining({
        songList: [
          expect.objectContaining({
            id: 7,
            name: 'Startup Song'
          })
        ],
        currentIndex: 0,
        progress: 32,
        duration: 180
      })
    )
    const normalizedState = storageSetJSONMock.mock.calls[0]?.[1] as {
      songList: Array<{ url?: string }>
    }
    expect(normalizedState.songList[0]?.url).toBeUndefined()
    expect(storageSetJSONMock.mock.invocationCallOrder[0]).toBeLessThan(
      platformSendMock.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    )
  })
})
