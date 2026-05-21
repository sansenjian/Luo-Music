import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

import { pluginSdkRuntime } from '../../packages/plugin-sdk/runtime'

const require = createRequire(import.meta.url)
const { checkPluginSdkRuntimeSync } =
  require('../../scripts/check-plugin-sdk-runtime-sync.cjs') as {
    checkPluginSdkRuntimeSync: (sdkRuntime: unknown, rootDir?: string) => string[]
  }

describe('plugin SDK runtime parity', () => {
  it('keeps external worker SDK helpers aligned with the TypeScript runtime', () => {
    expect(checkPluginSdkRuntimeSync(pluginSdkRuntime)).toEqual([])
  })
})
