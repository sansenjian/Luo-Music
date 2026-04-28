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

vi.mock('@/composables/useRenderStyle', () => ({
  useRenderStyle: vi.fn()
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
})
