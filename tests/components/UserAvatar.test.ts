import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import UserAvatar from '@/components/UserAvatar.vue'
import type { PlatformAuthState } from '@/platform/music/authState'
import {
  getLoginCapablePlatformDescriptors,
  replaceRuntimePlatformDescriptors,
  resetRuntimePlatformDescriptors
} from '@/platform/music/descriptors'
import { useUserStore } from '@/store/userStore'
import type { PlatformDescriptor } from '@shared/types/platform'

const pushMock = vi.hoisted(() => vi.fn())
const logoutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const checkQQMusicLoginMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { cookie: '' } }))
const warnMock = vi.hoisted(() => vi.fn())
const platformServiceMock = vi.hoisted(() => ({
  isElectron: vi.fn(() => false)
}))
const pluginServiceMock = vi.hoisted(() => ({
  refreshPlatformDescriptors: vi.fn<() => Promise<PlatformDescriptor[]>>(),
  auth: {
    getState: vi.fn<(platformId: string) => Promise<PlatformAuthState>>(),
    importSession: vi.fn<(platformId: string, session: unknown) => Promise<PlatformAuthState>>()
  },
  onPlatformsChanged: vi.fn<() => () => void>()
}))
const musicServiceMock = vi.hoisted(() => ({
  getLoginCapablePlatformDescriptors: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock
  })
}))

vi.mock('@/api/user', () => ({
  logout: logoutMock
}))

vi.mock('@/api/qqmusic', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/qqmusic')>()
  return {
    ...actual,
    qqMusicApi: {
      ...actual.qqMusicApi,
      checkQQMusicLogin: checkQQMusicLoginMock
    }
  }
})

vi.mock('@/services', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      logger: () => ({
        createLogger: () => ({
          warn: warnMock
        })
      }),
      music: () => musicServiceMock,
      platform: () => platformServiceMock,
      plugins: () => pluginServiceMock
    }
  }
})

function createWrapper() {
  return mount(UserAvatar, {
    attachTo: document.body,
    global: {
      stubs: {
        LoginModal: {
          template: '<div class="login-modal-stub">login</div>'
        },
        QQLoginModal: {
          template: '<div class="qq-login-modal-stub">qq</div>'
        },
        PluginLoginModal: {
          template: '<div class="plugin-login-modal-stub">plugin</div>'
        }
      }
    }
  })
}

describe('UserAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    platformServiceMock.isElectron.mockReturnValue(true)
    checkQQMusicLoginMock.mockResolvedValue({ data: { cookie: '' } })
    pluginServiceMock.refreshPlatformDescriptors.mockResolvedValue([])
    pluginServiceMock.auth.getState.mockResolvedValue({
      platform: 'kugou',
      status: 'anonymous',
      message: '未登录',
      updatedAt: Date.now()
    })
    pluginServiceMock.auth.importSession.mockImplementation(platformId =>
      Promise.resolve({
        platform: platformId,
        status: 'authenticated',
        message: '登录会话已导入',
        updatedAt: Date.now()
      })
    )
    pluginServiceMock.onPlatformsChanged.mockReturnValue(() => {})
    resetRuntimePlatformDescriptors()
    musicServiceMock.getLoginCapablePlatformDescriptors.mockImplementation(() =>
      getLoginCapablePlatformDescriptors()
    )
    document.body.innerHTML = ''
  })

  it('opens the dropdown on avatar click and closes it on outside click', async () => {
    const wrapper = createWrapper()
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        avatarUrl: 'https://example.com/avatar.png',
        userId: 1
      },
      'cookie'
    )
    await nextTick()

    await wrapper.find('.user-trigger').trigger('click')
    expect(wrapper.find('.dropdown').exists()).toBe(true)
    expect(pushMock).not.toHaveBeenCalled()

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await nextTick()

    expect(wrapper.find('.dropdown').exists()).toBe(false)
  })

  it('navigates to Netease user center from the profile header', async () => {
    const wrapper = createWrapper()
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        avatarUrl: 'https://example.com/avatar.png',
        userId: 1
      },
      'cookie'
    )
    await nextTick()

    await wrapper.find('.user-trigger').trigger('click')
    await wrapper.find('.platform-profile-card').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      path: '/user',
      query: { platform: 'netease' }
    })
    expect(wrapper.find('.dropdown').exists()).toBe(false)
  })

  it('moves focus into the menu on open and restores it to the trigger on Escape', async () => {
    const wrapper = createWrapper()
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        avatarUrl: 'https://example.com/avatar.png',
        userId: 1
      },
      'cookie'
    )
    await nextTick()

    const triggerButton = wrapper.get('.user-trigger')
    ;(triggerButton.element as HTMLButtonElement).focus()

    await triggerButton.trigger('click')
    await nextTick()

    const profileCard = wrapper.get('.platform-profile-card')
    expect(document.activeElement).toBe(profileCard.element)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    await nextTick()

    expect(wrapper.find('.dropdown').exists()).toBe(false)
    expect(document.activeElement).toBe(triggerButton.element)
  })

  it('renders login entries from enabled auth-capable platform descriptors', async () => {
    replaceRuntimePlatformDescriptors([
      {
        id: 'netease',
        displayName: 'Netease Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: true,
          needsHydration: true,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: true,
          auth: {
            login: true,
            preferredMode: 'qr',
            modes: ['qr']
          }
        }
      },
      {
        id: 'qq',
        displayName: 'QQ Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false,
          auth: {
            login: true,
            preferredMode: 'qr',
            modes: ['qr']
          }
        }
      },
      {
        id: 'kugou',
        displayName: 'Kugou Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false,
          auth: {
            login: true,
            preferredMode: 'browser',
            modes: ['browser']
          }
        }
      },
      {
        id: 'disabled-auth',
        displayName: 'Disabled Auth',
        source: 'external',
        runtime: 'external-host',
        enabled: false,
        capabilities: {
          search: true,
          songUrl: false,
          songDetail: false,
          lyric: false,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: false,
          supportsUrlRefreshOnFailure: false,
          auth: {
            login: true
          }
        }
      },
      {
        id: 'search-only',
        displayName: 'Search Only',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: false,
          songDetail: false,
          lyric: false,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: false,
          supportsUrlRefreshOnFailure: false
        }
      }
    ])

    const wrapper = createWrapper()

    await wrapper.find('.user-trigger').trigger('click')
    await nextTick()

    const loginButtons = wrapper.findAll('.login-platform-btn')
    expect(loginButtons).toHaveLength(3)
    expect(wrapper.findAll('.platform-login-title').map(title => title.text())).toEqual([
      'Netease Music 未登录',
      'QQ Music 未登录',
      'Kugou Music 未登录'
    ])
    expect(wrapper.text()).not.toContain('Disabled Auth')
    expect(wrapper.text()).not.toContain('Search Only')
  })

  it('hides the Netease login row when the profile header already represents it', async () => {
    replaceRuntimePlatformDescriptors([
      {
        id: 'netease',
        displayName: 'Netease Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: true,
          needsHydration: true,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: true,
          auth: {
            login: true,
            preferredMode: 'qr',
            modes: ['qr']
          }
        }
      },
      {
        id: 'qq',
        displayName: 'QQ Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false,
          auth: {
            login: true,
            preferredMode: 'qr',
            modes: ['qr']
          }
        }
      }
    ])

    const wrapper = createWrapper()
    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'sansenjian',
        avatarUrl: 'https://example.com/avatar.png',
        userId: 7924157898
      },
      'cookie'
    )
    await nextTick()

    await wrapper.find('.user-trigger').trigger('click')
    await nextTick()

    expect(wrapper.find('.dropdown-header').text()).toContain('sansenjian')
    expect(wrapper.findAll('.platform-login-title').map(title => title.text())).toEqual([
      'QQ Music 未登录'
    ])
    expect(wrapper.text()).not.toContain('Netease Music 已登录')
  })

  it('opens QQ Music user center from the logged-in QQ row', async () => {
    replaceRuntimePlatformDescriptors([
      {
        id: 'qq',
        displayName: 'QQ Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false,
          auth: {
            login: true,
            preferredMode: 'qr',
            modes: ['qr']
          }
        }
      }
    ])

    const wrapper = createWrapper()
    const userStore = useUserStore()
    userStore.setQQCookie('qq-cookie')
    await nextTick()

    await wrapper.find('.user-trigger').trigger('click')
    await nextTick()

    expect(wrapper.find('.platform-login-title').text()).toBe('QQ Music 已登录')
    await wrapper.find('.login-platform-btn').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      path: '/user',
      query: { platform: 'qq' }
    })
    expect(wrapper.find('.dropdown').exists()).toBe(false)
  })

  it('keeps legacy Netease and QQ login entries visible before installed manifests refresh', async () => {
    replaceRuntimePlatformDescriptors([
      {
        id: 'netease',
        displayName: 'Netease Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: true,
          needsHydration: true,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: true
        }
      },
      {
        id: 'qq',
        displayName: 'QQ Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false
        }
      }
    ])

    const wrapper = createWrapper()

    await wrapper.find('.user-trigger').trigger('click')
    await nextTick()

    expect(wrapper.findAll('.platform-login-title').map(title => title.text())).toEqual([
      'Netease Music 未登录',
      'QQ Music 未登录'
    ])
  })

  it('refreshes plugin auth state and opens a plugin user center from a logged-in plugin row', async () => {
    const kugouDescriptor = {
      id: 'kugou',
      displayName: 'Kugou Music',
      source: 'external' as const,
      runtime: 'external-host' as const,
      enabled: true,
      capabilities: {
        search: true,
        songUrl: true,
        songDetail: true,
        lyric: true,
        playlistDetail: false,
        needsHydration: false,
        supportsLyricFetch: true,
        supportsUrlRefreshOnFailure: false,
        auth: {
          login: true,
          preferredMode: 'browser' as const,
          modes: ['browser' as const]
        }
      }
    }
    pluginServiceMock.refreshPlatformDescriptors.mockResolvedValue([kugouDescriptor])
    pluginServiceMock.auth.getState.mockResolvedValue({
      platform: 'kugou',
      status: 'authenticated',
      account: {
        id: 'plugin-user',
        nickname: 'Plugin User'
      },
      message: 'ok',
      updatedAt: Date.now()
    })
    replaceRuntimePlatformDescriptors([kugouDescriptor])

    const wrapper = createWrapper()
    await vi.waitFor(() => expect(pluginServiceMock.auth.getState).toHaveBeenCalledWith('kugou'))

    await wrapper.find('.user-trigger').trigger('click')
    await nextTick()

    expect(wrapper.find('.platform-login-title').text()).toBe('Kugou Music 已登录')
    await wrapper.find('.login-platform-btn').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      path: '/user',
      query: { platform: 'kugou' }
    })
  })

  it('opens the generic plugin login modal for non-legacy auth platforms', async () => {
    replaceRuntimePlatformDescriptors([
      {
        id: 'kugou',
        displayName: 'Kugou Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false,
          auth: {
            login: true,
            preferredMode: 'browser',
            modes: ['browser']
          }
        }
      }
    ])

    const wrapper = createWrapper()

    await wrapper.find('.user-trigger').trigger('click')
    await nextTick()
    await wrapper.find('.login-platform-btn').trigger('click')
    await nextTick()

    expect(wrapper.find('.plugin-login-modal-stub').exists()).toBe(true)
    expect(wrapper.find('.login-modal-stub').exists()).toBe(false)
  })

  it('keeps Netease and QQ routed to legacy login modals during the cookie compatibility phase', async () => {
    replaceRuntimePlatformDescriptors([
      {
        id: 'netease',
        displayName: 'Netease Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: true,
          needsHydration: true,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: true,
          auth: {
            login: true,
            importSession: true,
            preferredMode: 'qr',
            modes: ['qr']
          }
        }
      },
      {
        id: 'qq',
        displayName: 'QQ Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false,
          auth: {
            login: true,
            importSession: true,
            preferredMode: 'qr',
            modes: ['qr']
          }
        }
      }
    ])

    const wrapper = createWrapper()

    await wrapper.find('.user-trigger').trigger('click')
    await nextTick()

    const loginButtons = wrapper.findAll('.login-platform-btn')
    await loginButtons[0].trigger('click')
    await nextTick()
    expect(wrapper.find('.login-modal-stub').exists()).toBe(true)
    expect(wrapper.find('.plugin-login-modal-stub').exists()).toBe(false)

    await wrapper.find('.user-trigger').trigger('click')
    await nextTick()
    await wrapper.findAll('.login-platform-btn')[1].trigger('click')
    await nextTick()
    expect(wrapper.find('.qq-login-modal-stub').exists()).toBe(true)
  })

  it('imports legacy Netease cookie into plugin auth secrets when plugin state is anonymous', async () => {
    const neteaseDescriptor = {
      id: 'netease',
      displayName: 'Netease Music',
      source: 'external' as const,
      runtime: 'external-host' as const,
      enabled: true,
      capabilities: {
        search: true,
        songUrl: true,
        songDetail: true,
        lyric: true,
        playlistDetail: true,
        needsHydration: true,
        supportsLyricFetch: true,
        supportsUrlRefreshOnFailure: true,
        auth: {
          login: true,
          importSession: true,
          preferredMode: 'qr' as const,
          modes: ['qr' as const]
        }
      }
    }
    pluginServiceMock.refreshPlatformDescriptors.mockResolvedValue([neteaseDescriptor])
    pluginServiceMock.auth.getState.mockResolvedValue({
      platform: 'netease',
      status: 'anonymous',
      message: '未登录',
      updatedAt: Date.now()
    })
    pluginServiceMock.auth.importSession.mockResolvedValue({
      platform: 'netease',
      status: 'authenticated',
      account: {
        id: 42,
        nickname: 'Tester'
      },
      message: '登录会话已导入',
      updatedAt: Date.now()
    })

    const userStore = useUserStore()
    userStore.login(
      {
        nickname: 'Tester',
        avatarUrl: 'https://example.com/avatar.png',
        userId: 42
      },
      'MUSIC_U=legacy'
    )

    createWrapper()

    await vi.waitFor(() =>
      expect(pluginServiceMock.auth.importSession).toHaveBeenCalledWith('netease', {
        credential: {
          type: 'cookie',
          value: 'MUSIC_U=legacy'
        },
        account: {
          id: 42,
          nickname: 'Tester',
          avatarUrl: 'https://example.com/avatar.png'
        }
      })
    )
    expect(userStore.getPlatformAuthState('netease').status).toBe('authenticated')
  })

  it('imports legacy QQ cookie after login status validation succeeds', async () => {
    const qqDescriptor = {
      id: 'qq',
      displayName: 'QQ Music',
      source: 'external' as const,
      runtime: 'external-host' as const,
      enabled: true,
      capabilities: {
        search: true,
        songUrl: true,
        songDetail: true,
        lyric: true,
        playlistDetail: false,
        needsHydration: false,
        supportsLyricFetch: true,
        supportsUrlRefreshOnFailure: false,
        auth: {
          login: true,
          importSession: true,
          preferredMode: 'qr' as const,
          modes: ['qr' as const]
        }
      }
    }
    checkQQMusicLoginMock.mockResolvedValue({ data: { cookie: 'qq-cookie' } })
    pluginServiceMock.refreshPlatformDescriptors.mockResolvedValue([qqDescriptor])
    pluginServiceMock.auth.getState.mockResolvedValue({
      platform: 'qq',
      status: 'anonymous',
      message: '未登录',
      updatedAt: Date.now()
    })

    const userStore = useUserStore()
    userStore.setQQCookie('qq-cookie')

    createWrapper()

    await vi.waitFor(() =>
      expect(pluginServiceMock.auth.importSession).toHaveBeenCalledWith('qq', {
        credential: {
          type: 'cookie',
          value: 'qq-cookie'
        }
      })
    )
  })
})
