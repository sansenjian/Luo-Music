import { describe, expect, it, vi } from 'vitest'
import demoPlugin from '../../plugins/examples/demo/index.mjs'
import { pluginSdkRuntime } from '../../packages/plugin-sdk/runtime'

function createLogger() {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}

async function createAdapter() {
  const storageValues = new Map()
  const ctx = {
    platformId: 'demo',
    settings: {
      maxResults: 5,
      verbose: false
    },
    storage: {
      get: vi.fn(key => storageValues.get(key)),
      set: vi.fn((key, value) => {
        storageValues.set(key, value)
      }),
      remove: vi.fn(key => {
        storageValues.delete(key)
      }),
      clear: vi.fn(() => {
        storageValues.clear()
      })
    },
    logger: createLogger(),
    sdk: pluginSdkRuntime
  }

  return {
    adapter: await demoPlugin.create(ctx),
    ctx,
    storageValues
  }
}

describe('Demo external plugin', () => {
  it('executes the contributed reset-search-count command', async () => {
    const { adapter, ctx, storageValues } = await createAdapter()

    await adapter.search({ keyword: 'demo', limit: 1, page: 1 })
    expect(storageValues.get('searchCount')).toBe(1)

    await expect(adapter['demo.resetSearchCount']()).resolves.toEqual({ count: 0 })

    expect(storageValues.get('searchCount')).toBe(0)
    expect(ctx.storage.set).toHaveBeenLastCalledWith('searchCount', 0)

    await adapter.search({ keyword: 'demo', limit: 1, page: 1 })
    await expect(adapter['command.demo.resetSearchCount']()).resolves.toEqual({ count: 0 })
  })
})
