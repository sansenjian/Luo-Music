import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { finalizePortableOutput } =
  require('../../../scripts/build/finalize-portable-output.cjs') as {
    finalizePortableOutput: (customDir: string) => Promise<string>
  }

describe('finalizePortableOutput', () => {
  it('keeps only the portable exe inside the output directory', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'luo-music-portable-'))

    try {
      await mkdir(join(outputDir, 'win-unpacked'), { recursive: true })
      await Promise.all([
        writeFile(join(outputDir, 'LUO Music-portable-1.0.0.exe'), 'exe'),
        writeFile(join(outputDir, 'builder-effective-config.yaml'), 'yaml'),
        writeFile(join(outputDir, 'latest.yml'), 'yaml'),
        writeFile(join(outputDir, 'LUO Music-portable-1.0.0.exe.blockmap'), 'blockmap')
      ])

      const portableExePath = await finalizePortableOutput(outputDir)
      const remainingEntries = await readdir(outputDir)

      expect(portableExePath).toBe(join(outputDir, 'LUO Music-portable-1.0.0.exe'))
      expect(remainingEntries).toEqual(['LUO Music-portable-1.0.0.exe'])
    } finally {
      await rm(outputDir, { recursive: true, force: true })
    }
  })

  it('fails when the output directory does not contain exactly one portable exe', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'luo-music-portable-invalid-'))

    try {
      await Promise.all([
        writeFile(join(outputDir, 'first.exe'), 'exe'),
        writeFile(join(outputDir, 'second.exe'), 'exe')
      ])

      await expect(finalizePortableOutput(outputDir)).rejects.toThrow(
        'Expected exactly one portable exe'
      )
    } finally {
      await rm(outputDir, { recursive: true, force: true })
    }
  })
})
