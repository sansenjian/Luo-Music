import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('plugin SDK shared runtime', () => {
  it('keeps worker SDK helpers imported from the shared runtime module', () => {
    const workerSource = readFileSync(
      resolve(process.cwd(), 'electron/plugins/externalPluginWorker.mjs'),
      'utf8'
    )
    const electronViteConfig = readFileSync(
      resolve(process.cwd(), 'electron/vite.config.ts'),
      'utf8'
    )

    expect(workerSource).toContain('from "./runtime-shared.mjs"')
    expect(workerSource).not.toContain('class PluginCallError')
    expect(workerSource).not.toContain('function createSongUrlResult')
    expect(electronViteConfig).toContain('packages/plugin-sdk/runtime-shared.mjs')
    expect(electronViteConfig).toContain('build/electron/runtime-shared.mjs')
  })
})
