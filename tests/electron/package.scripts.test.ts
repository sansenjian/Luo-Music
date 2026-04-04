import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type PackageJson = {
  scripts?: Record<string, string>
}

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
) as PackageJson

describe('package scripts for forge workflows', () => {
  it.each(['package', 'package:fast', 'make', 'make:fast'])(
    'runs build:server before %s',
    scriptName => {
      expect(packageJson.scripts?.[scriptName]).toMatch(/^npm run build:server && /)
    }
  )
})
