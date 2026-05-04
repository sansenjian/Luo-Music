import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App.vue'

const routeState = vi.hoisted(() => ({
  path: '/',
  name: 'Home' as string | undefined
}))

const useSmtcExtensionMock = vi.hoisted(() => vi.fn())
const storageGetJSONMock = vi.hoisted(() => vi.fn(() => null))
const storageGetItemMock = vi.hoisted(() => vi.fn(() => null))
const storageSetJSONMock = vi.hoisted(() => vi.fn())
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
      isElectron: () => true
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
  })
})
