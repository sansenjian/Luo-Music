import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(nextResolve => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

const qqApiMocks = vi.hoisted(() => ({
  getQQLoginQr: vi.fn(),
  checkQQLoginQr: vi.fn()
}))

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn()
}))

vi.mock('../../src/api/qqmusic', () => ({
  qqMusicApi: qqApiMocks
}))

vi.mock('../../src/services', () => ({
  services: {
    logger: () => ({
      createLogger: () => loggerMocks
    })
  }
}))

describe('QQLoginModal.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    localStorage.clear()
    qqApiMocks.getQQLoginQr.mockReset()
    qqApiMocks.checkQQLoginQr.mockReset()
    loggerMocks.error.mockReset()
    loggerMocks.warn.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ignores stale QR payloads after the modal closes', async () => {
    const qrRequest = createDeferred<{
      body: { img: string; ptqrtoken: string; qrsig: string }
    }>()
    qqApiMocks.getQQLoginQr.mockReturnValue(qrRequest.promise)

    const { default: QQLoginModal } = await import('../../src/components/QQLoginModal.vue')
    const wrapper = mount(QQLoginModal, {
      props: {
        modelValue: true
      }
    })

    await wrapper.setProps({ modelValue: false })
    qrRequest.resolve({
      body: {
        img: 'data:image/png;base64,qr',
        ptqrtoken: 'token',
        qrsig: 'sig'
      }
    })
    await flushPromises()

    expect(qqApiMocks.checkQQLoginQr).not.toHaveBeenCalled()
  })

  it('clears delayed success callbacks when the modal closes early', async () => {
    qqApiMocks.getQQLoginQr.mockResolvedValue({
      body: {
        img: 'data:image/png;base64,qr',
        ptqrtoken: 'token',
        qrsig: 'sig'
      }
    })
    qqApiMocks.checkQQLoginQr.mockResolvedValue({
      isOk: true,
      session: {
        cookie: 'cookie'
      }
    })

    const { default: QQLoginModal } = await import('../../src/components/QQLoginModal.vue')
    const wrapper = mount(QQLoginModal, {
      props: {
        modelValue: true
      }
    })

    await flushPromises()
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()

    await wrapper.setProps({ modelValue: false })
    await vi.advanceTimersByTimeAsync(500)

    expect(wrapper.emitted('login-success')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
