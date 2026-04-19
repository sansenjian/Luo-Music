import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App.vue'

const routeState = vi.hoisted(() => ({
  path: '/',
  name: 'Home' as string | undefined
}))

const smtcEnabled = vi.hoisted(() => ({
  value: true
}))
const useMediaSessionMock = vi.hoisted(() => vi.fn())
const storageGetJSONMock = vi.hoisted(() => vi.fn(() => null))
const storageGetItemMock = vi.hoisted(() => vi.fn(() => null))
const storageSetJSONMock = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRoute: () => routeState
}))

vi.mock('@/composables/useCommandContext', () => ({
  useCommandContext: vi.fn()
}))

vi.mock('@/composables/useExperimentalFeatures', () => ({
  useExperimentalFeatures: () => ({
    smtcEnabled
  })
}))

vi.mock('@/composables/useMediaSession', () => ({
  useMediaSession: useMediaSessionMock
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

describe('App media session ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.path = '/'
    routeState.name = 'Home'
    smtcEnabled.value = true
    window.location.hash = '#/'
  })

  it('enables media session in the main window', () => {
    mountApp()

    expect(useMediaSessionMock).toHaveBeenCalledTimes(1)

    const options = useMediaSessionMock.mock.calls[0]?.[0] as {
      enabled: () => boolean
    }

    expect(options.enabled()).toBe(true)
  })

  it('disables media session in the desktop lyric window', () => {
    routeState.path = '/desktop-lyric'
    routeState.name = 'DesktopLyric'
    window.location.hash = '#/desktop-lyric'

    mountApp()

    const options = useMediaSessionMock.mock.calls[0]?.[0] as {
      enabled: () => boolean
    }

    expect(options.enabled()).toBe(false)
  })
})
