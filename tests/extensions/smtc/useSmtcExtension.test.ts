import { nextTick, reactive, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import {
  DESKTOP_LYRIC_ROUTE_PATH,
  isSmtcPrimaryWindow,
  useSmtcExtension
} from '@/extensions/smtc/useSmtcExtension'
import type { MediaSessionDeps } from '@/composables/useMediaSession'
import { mountComposable } from '../../helpers/mountComposable'

function mountSmtcExtension(options: {
  isElectron?: boolean
  smtcEnabled?: boolean
  routePath?: string
  locationHash?: string
}) {
  const smtcEnabled = ref(options.smtcEnabled ?? true)
  const route = reactive({ path: options.routePath ?? '/' })
  const registerMediaSession = vi.fn()
  const systemMediaSessionController = {
    setSystemMediaSessionEnabled: vi.fn()
  }

  const { wrapper } = mountComposable(() =>
    useSmtcExtension({
      route,
      experimentalFeatures: { smtcEnabled },
      platformService: { isElectron: () => options.isElectron ?? true },
      systemMediaSessionController,
      getLocationHash: () => options.locationHash ?? '#/',
      registerMediaSession
    })
  )

  return {
    wrapper,
    smtcEnabled,
    route,
    registerMediaSession,
    systemMediaSessionController
  }
}

function getRegisteredMediaSessionDeps(registerMediaSession: ReturnType<typeof vi.fn>) {
  return registerMediaSession.mock.calls[0]?.[0] as MediaSessionDeps
}

describe('useSmtcExtension', () => {
  it('registers media session ownership for the primary Electron window', () => {
    const { registerMediaSession, systemMediaSessionController } = mountSmtcExtension({
      smtcEnabled: true,
      routePath: '/',
      locationHash: '#/'
    })

    expect(registerMediaSession).toHaveBeenCalledTimes(1)

    const mediaSessionDeps = getRegisteredMediaSessionDeps(registerMediaSession)
    expect(mediaSessionDeps.enabled?.()).toBe(true)
    expect(mediaSessionDeps.systemMediaSessionController).toBe(systemMediaSessionController)
  })

  it('keeps media session disabled in the desktop lyric route', () => {
    const { registerMediaSession } = mountSmtcExtension({
      routePath: DESKTOP_LYRIC_ROUTE_PATH,
      locationHash: '#/'
    })

    const mediaSessionDeps = getRegisteredMediaSessionDeps(registerMediaSession)
    expect(mediaSessionDeps.enabled?.()).toBe(false)
  })

  it('keeps media session disabled in the desktop lyric hash preload window', () => {
    const { registerMediaSession } = mountSmtcExtension({
      routePath: '/',
      locationHash: `#${DESKTOP_LYRIC_ROUTE_PATH}`
    })

    const mediaSessionDeps = getRegisteredMediaSessionDeps(registerMediaSession)
    expect(mediaSessionDeps.enabled?.()).toBe(false)
  })

  it('reacts to plugin enable state and route ownership changes', async () => {
    const { registerMediaSession, route, smtcEnabled } = mountSmtcExtension({
      smtcEnabled: false,
      routePath: '/'
    })
    const mediaSessionDeps = getRegisteredMediaSessionDeps(registerMediaSession)

    expect(mediaSessionDeps.enabled?.()).toBe(false)

    smtcEnabled.value = true
    await nextTick()
    expect(mediaSessionDeps.enabled?.()).toBe(true)

    route.path = DESKTOP_LYRIC_ROUTE_PATH
    await nextTick()
    expect(mediaSessionDeps.enabled?.()).toBe(false)
  })

  it('does not register SMTC media session outside Electron', () => {
    const { registerMediaSession } = mountSmtcExtension({
      isElectron: false
    })

    expect(registerMediaSession).not.toHaveBeenCalled()
  })
})

describe('isSmtcPrimaryWindow', () => {
  it('identifies only the main renderer as the SMTC owner', () => {
    expect(isSmtcPrimaryWindow('/', '#/')).toBe(true)
    expect(isSmtcPrimaryWindow(DESKTOP_LYRIC_ROUTE_PATH, '#/')).toBe(false)
    expect(isSmtcPrimaryWindow('/', `#${DESKTOP_LYRIC_ROUTE_PATH}`)).toBe(false)
  })
})
