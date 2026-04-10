import { browserTracingIntegration } from '@sentry/browser'

export function createRendererTracingIntegration() {
  return browserTracingIntegration()
}
