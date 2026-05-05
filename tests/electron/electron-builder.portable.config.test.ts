import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

type FileSet = {
  from: string
  to: string
  filter?: string[]
}

type PortableConfig = {
  artifactName?: string
  directories?: {
    output?: string
    buildResources?: string
  }
  asarUnpack?: string[]
  files?: string[]
  extraResources?: FileSet[]
  win?: {
    icon?: string
    target?: Array<{
      target: string
      arch?: string[]
    }>
  }
}

const require = createRequire(import.meta.url)
const portableConfig = require('../../electron-builder.portable.cjs') as PortableConfig

describe('electron-builder portable config', () => {
  it('emits a single x64 portable exe into a dedicated output directory', () => {
    expect(portableConfig.directories?.output).toBe('out/portable')
    expect(portableConfig.artifactName).toBe('${productName}-portable-${version}.${ext}')
    expect(portableConfig.win?.target).toEqual([
      {
        target: 'portable',
        arch: ['x64']
      }
    ])
  })

  it('reuses the packaged runtime resources without shipping source trees', () => {
    expect(portableConfig.asarUnpack).toContain(
      '**/node_modules/{conf,ajv,json-schema-traverse,atomically,dot-prop,uint8array-extras,type-fest}/**'
    )
    expect(portableConfig.files).toEqual(
      expect.arrayContaining([
        'build/**/*',
        'public/**/*',
        'plugins/third-party/**/*',
        '!build/runtime{,/**}',
        '!build/service{,/**}',
        '!**/*.map'
      ])
    )
    expect(portableConfig.extraResources).toEqual(
      expect.arrayContaining([
        {
          from: 'build/service',
          to: 'service',
          filter: ['**/*']
        },
        {
          from: 'build/runtime/qq-api-server.cjs',
          to: '.',
          filter: ['qq-api-server.cjs']
        },
        {
          from: 'scripts/runtime/qq-search-fallback.cjs',
          to: '.',
          filter: ['qq-search-fallback.cjs']
        },
        {
          from: 'scripts/runtime/netease-api-server.cjs',
          to: '.',
          filter: ['netease-api-server.cjs']
        }
      ])
    )
  })
})
