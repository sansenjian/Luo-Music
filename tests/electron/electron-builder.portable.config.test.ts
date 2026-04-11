import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

const portableConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'electron-builder.portable.json'), 'utf8')
) as PortableConfig

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
          from: 'scripts/dev/qq-search-fallback.cjs',
          to: '.',
          filter: ['qq-search-fallback.cjs']
        },
        {
          from: 'scripts/dev/netease-api-server.cjs',
          to: '.',
          filter: ['netease-api-server.cjs']
        }
      ])
    )
  })
})
