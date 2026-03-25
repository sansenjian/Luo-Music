import { beforeEach, describe, expect, it, vi } from 'vitest'

const setupServicesMock = vi.hoisted(() => vi.fn())
const vueQueryInstallMock = vi.hoisted(() => vi.fn())
const routerInstallMock = vi.hoisted(() => vi.fn())
const routerBeforeResolveMock = vi.hoisted(() => vi.fn())
const loggerWarnMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())
const performanceInitMock = vi.hoisted(() => vi.fn())
const performanceDisposeMock = vi.hoisted(() => vi.fn())

vi.mock('../src/App.vue', () => ({
  default: {
    template: '<div class="app-stub" />'
  }
}))

vi.mock('../src/router', () => ({
  default: {
    install: routerInstallMock,
    beforeResolve: routerBeforeResolveMock
  }
}))

vi.mock('@tanstack/vue-query', () => ({
  VueQueryPlugin: {
    install: vueQueryInstallMock
  }
}))

vi.mock('../src/services', () => ({
  setupServices: setupServicesMock
}))

vi.mock('../src/utils/logger', () => ({
  getLogger: () => ({
    warn: loggerWarnMock,
    error: loggerErrorMock
  })
}))

vi.mock('../src/utils/performance/monitor', () => ({
  performanceMonitor: {
    init: performanceInitMock,
    dispose: performanceDisposeMock
  }
}))

describe('main bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="app"></div>'
    document.cookie = 'sessionToken=alive'
  })

  it('does not clear existing cookies during bootstrap', async () => {
    await import('../src/main.ts')
    await vi.runAllTimersAsync()

    expect(document.cookie).toContain('sessionToken=alive')
    expect(setupServicesMock).toHaveBeenCalledTimes(1)
  })

  it('installs Vue Query before router navigation starts', async () => {
    await import('../src/main.ts')

    expect(vueQueryInstallMock).toHaveBeenCalledTimes(1)
    expect(routerInstallMock).toHaveBeenCalledTimes(1)
    expect(vueQueryInstallMock.mock.invocationCallOrder[0]).toBeLessThan(
      routerInstallMock.mock.invocationCallOrder[0]
    )
  })
})
