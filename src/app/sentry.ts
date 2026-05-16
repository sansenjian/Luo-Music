import type { RouteLocationNormalized } from 'vue-router'

import { getLogger } from '@/utils/logger'
import { isElectronRuntime } from '@/utils/runtime'

type SentryRendererModule = typeof import('@/utils/monitoring/sentryRenderer')

let sentryRendererModule: SentryRendererModule | null = null
let sentryRendererModulePromise: Promise<SentryRendererModule> | null = null

const sentryDsn = import.meta.env.SENTRY_DSN
const sentryRelease = import.meta.env.SENTRY_RELEASE
const sentryTracingEnabled = import.meta.env.SENTRY_TRACING_ENABLED === '1'
const sentryReplayEnabled = import.meta.env.SENTRY_REPLAY_ENABLED === '1'
const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

export const canLoadRendererSentry = import.meta.env.APP_RUNTIME === 'electron'

const sentryEnabled =
  canLoadRendererSentry &&
  Boolean(sentryDsn) &&
  import.meta.env.PROD &&
  isElectronRuntime() &&
  !isLocalhost

async function loadRendererSentryModule(): Promise<SentryRendererModule> {
  if (sentryRendererModule) {
    return sentryRendererModule
  }

  if (!sentryRendererModulePromise) {
    sentryRendererModulePromise = import('@/utils/monitoring/sentryRenderer').then(module => {
      sentryRendererModule = module
      return module
    })
  }

  return sentryRendererModulePromise
}

export function captureSentryException(error: unknown): void {
  sentryRendererModule?.captureRendererException(error)
}

export async function initializeSentry(): Promise<void> {
  if (!sentryEnabled) {
    return
  }

  const dsn = sentryDsn
  if (!dsn) {
    return
  }

  const sentryRenderer = await loadRendererSentryModule()

  await sentryRenderer.initializeRendererSentry({
    dsn,
    environment: import.meta.env.MODE,
    release: sentryRelease || undefined,
    tracingEnabled: sentryTracingEnabled,
    replayEnabled: sentryReplayEnabled,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0
  })
}

export function installGlobalErrorHandlers(): void {
  window.addEventListener('unhandledrejection', event => {
    getLogger().error('Main', 'Unhandled Promise Rejection', event.reason)
    captureSentryException(event.reason)
  })

  window.addEventListener('error', event => {
    console.error('Global Error:', event.error)
    if (event.error) {
      captureSentryException(event.error)
    }
  })
}

export function routeRequiresVueQuery(route: RouteLocationNormalized): boolean {
  return route.matched.some(record => record.meta.requiresVueQuery === true)
}
