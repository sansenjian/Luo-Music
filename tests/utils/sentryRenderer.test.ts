import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const initMock = vi.hoisted(() => vi.fn())
const captureExceptionMock = vi.hoisted(() => vi.fn())
const setContextMock = vi.hoisted(() => vi.fn())
const setTagMock = vi.hoisted(() => vi.fn())
const setTagsMock = vi.hoisted(() => vi.fn())
const browserTracingIntegrationMock = vi.hoisted(() => vi.fn(() => ({ name: 'tracing' })))
const replayIntegrationMock = vi.hoisted(() =>
  vi.fn(options => ({
    name: 'replay',
    options
  }))
)
const expectedReplayPrivacyOptions = {
  maskAllText: true,
  blockAllMedia: true,
  unmask: ['[data-sentry-unmask]'],
  unblock: ['[data-sentry-unblock]']
}

vi.mock('@sentry/browser', () => ({
  init: initMock,
  captureException: captureExceptionMock,
  setContext: setContextMock,
  setTag: setTagMock,
  setTags: setTagsMock,
  browserTracingIntegration: browserTracingIntegrationMock,
  replayIntegration: replayIntegrationMock
}))

describe('renderer sentry bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('captures exceptions only after initialization', async () => {
    const { captureRendererException, initializeRendererSentry, resetRendererSentryForTest } =
      await import('@/utils/monitoring/sentryRenderer')

    captureRendererException(new Error('before init'))
    expect(captureExceptionMock).not.toHaveBeenCalled()

    await initializeRendererSentry({
      dsn: 'https://example.ingest.sentry.io/123',
      environment: 'production',
      tracingEnabled: false,
      replayEnabled: false,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1
    })

    captureRendererException(new Error('after init'))
    expect(captureExceptionMock).toHaveBeenCalledTimes(1)

    resetRendererSentryForTest()
  })

  it('keeps renderer Sentry lightweight by default', async () => {
    vi.stubEnv('SENTRY_TRACING_ENABLED', '0')
    vi.stubEnv('SENTRY_REPLAY_ENABLED', '0')

    const { initializeRendererSentry, resetRendererSentryForTest } =
      await import('@/utils/monitoring/sentryRenderer')

    await initializeRendererSentry({
      dsn: 'https://example.ingest.sentry.io/123',
      environment: 'production',
      tracingEnabled: false,
      replayEnabled: false,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1
    })

    expect(browserTracingIntegrationMock).not.toHaveBeenCalled()
    expect(replayIntegrationMock).not.toHaveBeenCalled()
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integrations: [],
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0
      })
    )

    resetRendererSentryForTest()
  })

  it('does not enable tracing or replay when feature flags are disabled', async () => {
    vi.stubEnv('SENTRY_TRACING_ENABLED', '0')
    vi.stubEnv('SENTRY_REPLAY_ENABLED', '0')

    const { initializeRendererSentry, resetRendererSentryForTest } =
      await import('@/utils/monitoring/sentryRenderer')

    await initializeRendererSentry({
      dsn: 'https://example.ingest.sentry.io/123',
      environment: 'production',
      tracingEnabled: true,
      replayEnabled: true,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1
    })

    expect(browserTracingIntegrationMock).not.toHaveBeenCalled()
    expect(replayIntegrationMock).not.toHaveBeenCalled()
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integrations: [],
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0
      })
    )

    resetRendererSentryForTest()
  })

  it('loads tracing and replay integrations only when explicitly enabled', async () => {
    vi.stubEnv('SENTRY_TRACING_ENABLED', '1')
    vi.stubEnv('SENTRY_REPLAY_ENABLED', '1')

    const { initializeRendererSentry, resetRendererSentryForTest } =
      await import('@/utils/monitoring/sentryRenderer')

    await initializeRendererSentry({
      dsn: 'https://example.ingest.sentry.io/123',
      environment: 'production',
      release: 'luo-music@1.0.0',
      tracingEnabled: true,
      replayEnabled: true,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1
    })

    expect(browserTracingIntegrationMock).toHaveBeenCalledTimes(1)
    expect(replayIntegrationMock).toHaveBeenCalledTimes(1)
    expect(replayIntegrationMock).toHaveBeenCalledWith(expectedReplayPrivacyOptions)
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integrations: expect.arrayContaining([
          { name: 'tracing' },
          expect.objectContaining({
            name: 'replay',
            options: expect.objectContaining(expectedReplayPrivacyOptions)
          })
        ]),
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1
      })
    )
    expect(setTagsMock).toHaveBeenCalled()
    expect(setContextMock).toHaveBeenCalledWith(
      'runtime',
      expect.objectContaining({
        userAgent: navigator.userAgent
      })
    )
    expect(setTagMock).toHaveBeenCalledWith('app.release', 'luo-music@1.0.0')

    resetRendererSentryForTest()
  })
})
