import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const testWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/test.yml'), 'utf8')

describe('GitHub test workflow', () => {
  it('keeps native local-library tests enabled in coverage shards', () => {
    expect(testWorkflow).toMatch(
      /- name: Run coverage tests\s+env:\s+LUO_TEST_INCLUDE_NATIVE: "1"\s+run: >\s+npm run test:coverage -- --shard=\$\{\{ matrix\.shard \}\}\/2/
    )
  })
})
