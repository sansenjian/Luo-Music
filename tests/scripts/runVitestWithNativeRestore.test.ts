import { createRequire } from 'node:module'

import { describe, expect, it } from 'vite-plus/test'

const require = createRequire(import.meta.url)
const { createVpTestCommand } = require('../../scripts/run-vitest-with-native-restore.cjs') as {
  createVpTestCommand: (
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
  it('runs tests through the local VP CLI npm script', () => {
    expect(
      createVpTestCommand(['run', '-c', '.config/vite.config.ts'], {
        execPath: 'C:/Program Files/nodejs/node.exe',
        npmExecPath: 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js',
        platform: 'win32'
      })
    ).toEqual({
      command: 'C:/Program Files/nodejs/node.exe',
      args: [
        'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js',
        'run',
        'vp',
        '--',
        'test',
        'run',
        '-c',
        '.config/vite.config.ts'
      ],
      shell: false
    })
  })
})
