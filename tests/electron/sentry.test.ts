import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const initMock = vi.fn()

vi.mock('@sentry/electron/main', () => ({
  init: initMock
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getVersion: () => '1.2.3'
  }
}))

vi.mock('electron-log', () => ({
  default: {
    transports: { file: {}, console: {} },
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    verbose: vi.fn()
  }
}))

// Save original NODE_ENV
const originalEnv = process.env.NODE_ENV

describe('initSentry', () => {
  beforeEach(() => {
    vi.resetModules()
    initMock.mockClear()
    // Set production environment for test
    process.env.NODE_ENV = 'production'
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  it('initializes Sentry with provided DSN', async () => {
    const { initSentry } = await import('../../electron/logger')

    await initSentry({
      dsn: 'https://example.ingest.sentry.io/123',
      force: true
    })

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://example.ingest.sentry.io/123',
        release: 'luo-music@1.2.3',
        environment: 'production'
      })
    )
  })
})
