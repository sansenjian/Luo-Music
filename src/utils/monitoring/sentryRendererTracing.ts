import { browserTracingIntegration } from '@sentry/browser'

export function createRendererTracingIntegration(): ReturnType<typeof browserTracingIntegration> {
  return browserTracingIntegration()
}
