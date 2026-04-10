import { replayIntegration } from '@sentry/browser'

export function createRendererReplayIntegration() {
  return replayIntegration({
    maskAllText: false,
    blockAllMedia: false
  })
}
