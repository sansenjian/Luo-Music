import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

import UserAvatar from '../../src/components/UserAvatar.vue'
import { useUserStore } from '../../src/store/userStore'

const pushMock = vi.hoisted(() => vi.fn())
const logoutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const checkQQMusicLoginMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { cookie: '' } }))
const warnMock = vi.hoisted(() => vi.fn())
const platformServiceMock = vi.hoisted(() => ({
  isElectron: vi.fn(() => false)
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock
  })
}))

vi.mock('../../src/api/user', () => ({
  logout: logoutMock
}))

vi.mock('../../src/api/qqmusic', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/api/qqmusic')>()
  return {
    ...actual,
    qqMusicApi: {
      ...actual.qqMusicApi,
      checkQQMusicLogin: checkQQMusicLoginMock
    }
  }
})

vi.mock('../../src/services', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      logger: () => ({
        createLogger: () => ({
          warn: warnMock
        })
      }),
      platform: () => platformServiceMock
    }
  }
})

function createWrapper() {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(UserAvatar, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      stubs: {
        LoginModal: {
          template: '<div class="login-modal-stub">login</div>'
        },
        QQLoginModal: {
          template: '<div class="qq-login-modal-stub">qq</div>'
        }
      }
    }
  })
}

describe('UserAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    platformServiceMock.isElectron.mockReturnValue(true)
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

  it('navigates to user center from the dropdown menu item', async () => {
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
    await wrapper.find('.menu-btn').trigger('click')

    expect(pushMock).toHaveBeenCalledWith('/user')
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

    const firstMenuButton = wrapper.get('.menu-btn')
    expect(document.activeElement).toBe(firstMenuButton.element)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    await nextTick()

    expect(wrapper.find('.dropdown').exists()).toBe(false)
    expect(document.activeElement).toBe(triggerButton.element)
  })
})
