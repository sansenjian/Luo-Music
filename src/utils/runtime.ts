export type AppRuntime = 'web' | 'electron'

function normalizeRuntime(value: unknown): AppRuntime | null {
  if (value === 'web' || value === 'electron') {
    return value
  }

  return null
}

declare global {
  var __LUO_APP_RUNTIME__: AppRuntime | undefined
}

export function getAppRuntime(): AppRuntime {
  return (
    normalizeRuntime(globalThis.__LUO_APP_RUNTIME__) ??
    normalizeRuntime(import.meta.env.APP_RUNTIME) ??
    'web'
  )
}

export function isElectronRuntime(): boolean {
  return getAppRuntime() === 'electron'
}

export function isWebRuntime(): boolean {
  return getAppRuntime() === 'web'
}
