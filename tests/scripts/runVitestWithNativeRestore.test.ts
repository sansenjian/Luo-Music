import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createVitestCommand } = require('../../scripts/run-vitest-with-native-restore.cjs') as {
  createVitestCommand: (
    args: string[],
    options?: {
      execPath?: string
      npmExecPath?: string
      platform?: NodeJS.Platform
    }
  ) => {
    command: string
    args: string[]
    shell: boolean
  }
}

describe('run-vitest-with-native-restore', () => {
  it('runs native tests through the local Vitest npm script', () => {
    expect(
      createVitestCommand(['run', '-c', '.config/vitest.config.ts'], {
        execPath: 'C:/Program Files/nodejs/node.exe',
        npmExecPath: 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js',
        platform: 'win32'
      })
    ).toEqual({
      command: 'C:/Program Files/nodejs/node.exe',
      args: [
        'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js',
        'run',
        'vitest',
        '--',
        'run',
        '-c',
        '.config/vitest.config.ts'
      ],
      shell: false
    })
  })
})
