import { describe, expect, it } from 'vite-plus/test'
import { BuiltInAdapterLoader } from '@/platform/music/plugin/BuiltInAdapterLoader'

describe('BuiltInAdapterLoader', () => {
  it('rejects unknown built-in plugin ids', async () => {
    const loader = new BuiltInAdapterLoader()

    await expect(loader.load('missing-plugin')).rejects.toThrow(
      'Built-in plugin "missing-plugin" is not registered'
    )
  })

  it('supports returns false for unknown plugins', () => {
    const loader = new BuiltInAdapterLoader()

    expect(loader.supports('missing-plugin')).toBe(false)
  })
})
