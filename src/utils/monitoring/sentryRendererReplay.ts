import { replayIntegration } from '@sentry/browser'

export function createRendererReplayIntegration(): ReturnType<typeof replayIntegration> {
  return replayIntegration({
    maskAllText: true,
    blockAllMedia: true,
    unmask: ['[data-sentry-unmask]'],
    unblock: ['[data-sentry-unblock]']
  })
}
