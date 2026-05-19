import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pluginServiceMock = vi.hoisted(() => ({
  auth: {
    startLogin: vi.fn(),
    pollLogin: vi.fn(),
    cancelLogin: vi.fn()
  }
}))

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn()
}))

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn()
}))

vi.mock('@/services', () => ({
  services: {
    logger: () => ({
      createLogger: () => loggerMocks
    }),
    plugins: () => pluginServiceMock
  }
}))

vi.mock('@/store/toastStore', () => ({
  useToastStore: () => toastMocks
}))

describe('PluginLoginModal.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pluginServiceMock.auth.startLogin.mockResolvedValue({
      challengeId: 'challenge-1',
      type: 'qr',
      qrImageUrl: 'data:image/png;base64,qr',
      pollIntervalMs: 1000,
      cancelable: true
    })
    pluginServiceMock.auth.pollLogin.mockResolvedValue({
      platform: 'kugou',
      status: 'pending',
      message: '等待扫码',
      updatedAt: Date.now()
    })
    pluginServiceMock.auth.cancelLogin.mockResolvedValue(undefined)
  })

  it('starts plugin login through the auth facade', async () => {
    const { default: PluginLoginModal } = await import('@/components/PluginLoginModal.vue')
    mount(PluginLoginModal, {
      props: {
        modelValue: true,
        platformId: 'kugou',
        platformName: 'Kugou Music',
        preferredMode: 'qr'
      }
    })

    await flushPromises()

    expect(pluginServiceMock.auth.startLogin).toHaveBeenCalledWith('kugou', { mode: 'qr' })
  })

  it('cancels an active challenge through the auth facade when closing', async () => {
    const { default: PluginLoginModal } = await import('@/components/PluginLoginModal.vue')
    const wrapper = mount(PluginLoginModal, {
      props: {
        modelValue: true,
        platformId: 'kugou',
        platformName: 'Kugou Music'
      }
    })
    await flushPromises()

    await wrapper.setProps({ modelValue: false })
    await flushPromises()

    expect(pluginServiceMock.auth.cancelLogin).toHaveBeenCalledWith('kugou', 'challenge-1')
  })

  it('treats missing cancelable as cancelable when closing', async () => {
    pluginServiceMock.auth.startLogin.mockResolvedValueOnce({
      challengeId: 'challenge-default',
      type: 'qr',
      qrImageUrl: 'data:image/png;base64,qr',
      pollIntervalMs: 1000
    })

    const { default: PluginLoginModal } = await import('@/components/PluginLoginModal.vue')
    const wrapper = mount(PluginLoginModal, {
      props: {
        modelValue: true,
        platformId: 'kugou',
        platformName: 'Kugou Music'
      }
    })
    await flushPromises()

    await wrapper.setProps({ modelValue: false })
    await flushPromises()

    expect(pluginServiceMock.auth.cancelLogin).toHaveBeenCalledWith('kugou', 'challenge-default')
  })
})
