import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UserProfileHeader from '@/components/user/UserProfileHeader.vue'

const clipboardWriteTextMock = vi.fn()

describe('UserProfileHeader.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: vi.fn()
    })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        clipboard: {
          writeText: clipboardWriteTextMock
        }
      }
    })
  })

  it('renders core profile info and action buttons', () => {
    const wrapper = mount(UserProfileHeader, {
      props: {
        userId: '123',
        nickname: 'Test User',
        avatarUrl: 'http://example.com/avatar.jpg'
      }
    })

    expect(wrapper.find('.user-profile-name').text()).toBe('Test User')
    expect(wrapper.find('.user-profile-id').text()).toContain('UID 123')
    expect(wrapper.get('[data-testid="copy-user-id"]').text()).toContain('复制 UID')
    expect(wrapper.get('[data-testid="open-user-profile"]').text()).toContain('打开主页')
    expect(wrapper.get('[data-testid="preview-avatar"]').text()).toContain('预览头像')
  })

  it('copies user id and opens the external profile link', async () => {
    clipboardWriteTextMock.mockResolvedValue(undefined)

    const wrapper = mount(UserProfileHeader, {
      props: {
        userId: '123',
        nickname: 'Test User'
      }
    })

    await wrapper.get('[data-testid="copy-user-id"]').trigger('click')
    expect(clipboardWriteTextMock).toHaveBeenCalledWith('123')
    expect(wrapper.get('[data-testid="copy-user-id"]').text()).toContain('UID 已复制')

    await wrapper.get('[data-testid="open-user-profile"]').trigger('click')
    expect(window.open).toHaveBeenCalledWith(
      'https://music.163.com/#/user/home?id=123',
      '_blank',
      'noopener,noreferrer'
    )
  })

  it('opens and closes the avatar preview dialog', async () => {
    const wrapper = mount(UserProfileHeader, {
      props: {
        userId: '123',
        nickname: 'Test User',
        avatarUrl: 'http://example.com/avatar.jpg'
      }
    })

    expect(wrapper.find('.avatar-preview-backdrop').exists()).toBe(false)

    await wrapper.get('[data-testid="preview-avatar"]').trigger('click')
    expect(wrapper.find('.avatar-preview-backdrop').exists()).toBe(true)

    await wrapper.get('.avatar-preview-close').trigger('click')
    expect(wrapper.find('.avatar-preview-backdrop').exists()).toBe(false)
  })

  it('disables avatar preview when no avatar is available', () => {
    const wrapper = mount(UserProfileHeader, {
      props: {
        userId: '123',
        nickname: 'Test User'
      }
    })

    expect(wrapper.get('[data-testid="preview-avatar"]').attributes('disabled')).toBeDefined()
  })
})
