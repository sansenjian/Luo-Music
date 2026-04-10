/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_RUNTIME?: 'web' | 'electron'
  readonly VITE_PUBLIC: string
  readonly VITE_DEV_SERVER_URL: string
  readonly VITE_DESKTOP_LYRIC_DEBUG?: string
  readonly SENTRY_DSN?: string
  readonly SENTRY_RELEASE?: string
  readonly SENTRY_TRACING_ENABLED?: '0' | '1'
  readonly SENTRY_REPLAY_ENABLED?: '0' | '1'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Electron API exposed by preload script
interface ElectronAPI {
  send: (channel: string, data: unknown) => void
  on: (channel: string, callback: (data: unknown) => void) => () => void
  invoke: (channel: string, data?: unknown) => Promise<unknown>
  minimize: () => void
  maximize: () => void
  close: () => void
  getAppVersion: () => Promise<string>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }

  // Web Animations API - animate function
  function animate(
    element: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options?: number | KeyframeAnimationOptions
  ): Animation
}
