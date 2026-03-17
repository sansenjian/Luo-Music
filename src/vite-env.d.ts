/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC: string
  readonly VITE_DEV_SERVER_URL: string
  readonly SENTRY_DSN?: string
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
