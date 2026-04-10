import { beforeEach, describe, expect, it, vi } from 'vitest'

async function loadElectronViteConfig(sourcemapFlag?: string) {
  const previousFlag = process.env.LUO_BUILD_SOURCEMAP

  if (sourcemapFlag === undefined) {
    delete process.env.LUO_BUILD_SOURCEMAP
  } else {
    process.env.LUO_BUILD_SOURCEMAP = sourcemapFlag
  }

  vi.resetModules()
  vi.doMock('electron-vite', () => ({
    defineConfig: <T>(config: T) => config
  }))
  vi.doMock('@vitejs/plugin-vue', () => ({
    default: () => ({ name: 'mock-vue-plugin' })
  }))
  vi.doMock('@sentry/vite-plugin', () => ({
    sentryVitePlugin: () => []
  }))
  vi.doMock('dotenv', () => ({
    config: vi.fn()
  }))

  try {
    return (await import('../../electron.vite.config')).default
  } finally {
    if (previousFlag === undefined) {
      delete process.env.LUO_BUILD_SOURCEMAP
    } else {
      process.env.LUO_BUILD_SOURCEMAP = previousFlag
    }
  }
}

describe('electron.vite.config sourcemap policy', () => {
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
    const config = await loadElectronViteConfig('1')

    expect(config.main?.build?.sourcemap).toBe(true)
    expect(config.preload?.build?.sourcemap).toBe(true)
    expect(config.renderer?.build?.sourcemap).toBe(true)
  })
})
