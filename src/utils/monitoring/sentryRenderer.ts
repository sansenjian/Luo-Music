import { captureException, init, setContext, setTag, setTags } from '@sentry/browser'

type InitializeRendererSentryOptions = {
  dsn: string
  environment: string
  release?: string
  tracingEnabled: boolean
  replayEnabled: boolean
  tracesSampleRate: number
  replaysSessionSampleRate: number
  replaysOnErrorSampleRate: number
}

const sentryTracingFeatureEnabled = import.meta.env.SENTRY_TRACING_ENABLED === '1'
const sentryReplayFeatureEnabled = import.meta.env.SENTRY_REPLAY_ENABLED === '1'

let rendererSentryInitialized = false

export function captureRendererException(error: unknown): void {
  if (!rendererSentryInitialized) {
    return
  }

  captureException(error)
}

export async function initializeRendererSentry(
  options: InitializeRendererSentryOptions
): Promise<void> {
  if (rendererSentryInitialized) {
    return
  }

  const integrations = []

  if (sentryTracingFeatureEnabled && options.tracingEnabled) {
    const { createRendererTracingIntegration } =
      await import('@/utils/monitoring/sentryRendererTracing')
    integrations.push(createRendererTracingIntegration())
  }

  if (sentryReplayFeatureEnabled && options.replayEnabled) {
    const { createRendererReplayIntegration } =
      await import('@/utils/monitoring/sentryRendererReplay')
    integrations.push(createRendererReplayIntegration())
  }

  init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    integrations,
    tracesSampleRate: options.tracingEnabled ? options.tracesSampleRate : 0,
    replaysSessionSampleRate: options.replayEnabled ? options.replaysSessionSampleRate : 0,
    replaysOnErrorSampleRate: options.replayEnabled ? options.replaysOnErrorSampleRate : 0
  })

  setTags({
    'process.type': 'renderer',
    platform: navigator.platform || 'unknown',
    'app.environment': options.environment
  })

  if (options.release) {
    setTag('app.release', options.release)
  }

  setContext('runtime', {
    userAgent: navigator.userAgent
  })

  rendererSentryInitialized = true
}

export function resetRendererSentryForTest(): void {
  rendererSentryInitialized = false
}
