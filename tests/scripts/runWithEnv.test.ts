import { createRequire } from 'node:module'

import { describe, expect, it } from 'vite-plus/test'

const require = createRequire(import.meta.url)
const { createSpawnTarget, parseArgs } = require('../../scripts/run-with-env.cjs') as {
  createSpawnTarget: (parts: string[]) => {
    command: string
    args: string[]
    shell: boolean
    windowsVerbatimArguments: boolean
  }
  parseArgs: (
    rawArgs: string[],
    env?: Record<string, string>
  ) => {
    commandParts: string[]
    env: Record<string, string>
  }
}

describe('run-with-env', () => {
  it('keeps executable paths with spaces as a command instead of a shell string', () => {
    expect(
      createSpawnTarget([
        'C:/Program Files/nodejs/node.exe',
        'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js',
        'run',
        'vp'
      ])
    ).toEqual({
      command: 'C:/Program Files/nodejs/node.exe',
      args: ['C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js', 'run', 'vp'],
      shell: false,
      windowsVerbatimArguments: false
    })
  })

  it('parses environment assignments separately from command arguments', () => {
    expect(parseArgs(['APP_RUNTIME=web', '--', 'npm', 'run', 'vp'], {})).toEqual({
      commandParts: ['npm', 'run', 'vp'],
      env: {
        APP_RUNTIME: 'web'
      }
    })
  })
})
