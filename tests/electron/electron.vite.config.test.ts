import { beforeEach, describe, expect, it, vi } from 'vitest'

type ElectronViteConfigEnv = {
  sentryAuthToken?: string
  sentryOrg?: string
  sentryProject?: string
  sentryUpload?: string
  sourcemapFlag?: string
}

const sentryVitePluginMock = vi.fn(() => [])

async function loadElectronViteConfig(env: ElectronViteConfigEnv = {}) {
  const previousEnv = {
    LUO_BUILD_SOURCEMAP: process.env.LUO_BUILD_SOURCEMAP,
    LUO_SENTRY_UPLOAD: process.env.LUO_SENTRY_UPLOAD,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT
  }

  const nextEnv: Record<keyof typeof previousEnv, string | undefined> = {
    LUO_BUILD_SOURCEMAP: env.sourcemapFlag,
    LUO_SENTRY_UPLOAD: env.sentryUpload,
    SENTRY_AUTH_TOKEN: env.sentryAuthToken,
    SENTRY_ORG: env.sentryOrg,
    SENTRY_PROJECT: env.sentryProject
  }

  for (const [key, value] of Object.entries(nextEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  vi.resetModules()
  sentryVitePluginMock.mockClear()
  vi.doMock('electron-vite', () => ({
    defineConfig: <T>(config: T) => config
  }))
  vi.doMock('@vitejs/plugin-vue', () => ({
    default: () => ({ name: 'mock-vue-plugin' })
  }))
  vi.doMock('@sentry/vite-plugin', () => ({
    sentryVitePlugin: sentryVitePluginMock
  }))
  vi.doMock('dotenv', () => ({
    config: vi.fn()
  }))

  try {
    return (await import('../../electron/vite.config')).default
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

describe('electron/vite.config sourcemap policy', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('disables sourcemaps by default for packaged builds', async () => {
    const config = await loadElectronViteConfig()

    expect(config.main?.build?.sourcemap).toBe(false)
    expect(config.preload?.build?.sourcemap).toBe(false)
    expect(config.renderer?.build?.sourcemap).toBe(false)
  })

  it('allows opting back into sourcemaps explicitly', async () => {
    const config = await loadElectronViteConfig({ sourcemapFlag: '1' })

    expect(config.main?.build?.sourcemap).toBe(true)
    expect(config.preload?.build?.sourcemap).toBe(true)
    expect(config.renderer?.build?.sourcemap).toBe(true)
  })

  it('does not upload Sentry sourcemaps only because credentials exist', async () => {
    await loadElectronViteConfig({
      sentryAuthToken: 'token',
      sentryOrg: 'org',
      sentryProject: 'project'
    })

    expect(sentryVitePluginMock).not.toHaveBeenCalled()
  })

  it('requires an explicit Sentry upload flag and enables sourcemaps for upload', async () => {
    const config = await loadElectronViteConfig({
      sentryAuthToken: 'token',
      sentryOrg: 'org',
      sentryProject: 'project',
      sentryUpload: '1'
    })

    expect(sentryVitePluginMock).toHaveBeenCalledTimes(1)
    expect(config.renderer?.build?.sourcemap).toBe(true)
  })

  it('copies the external plugin worker beside the main process bundle', async () => {
    const config = await loadElectronViteConfig()
    const plugins = config.main?.plugins as Array<{ name?: string }> | undefined

    expect(plugins?.map(plugin => plugin.name)).toContain('luo-copy-external-plugin-worker')
  })
})
