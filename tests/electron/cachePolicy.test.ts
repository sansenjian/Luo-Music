import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  AUDIO_OUTPUT_CACHE_DIR_NAME,
  clearDirectoryContents,
  formatBytes,
  getDirectorySize
} from '../../electron/cachePolicy'

describe('cachePolicy', () => {
  let cacheRoot: string

  beforeEach(async () => {
    cacheRoot = await mkdtemp(join(tmpdir(), 'luo-cache-policy-'))
  })

  afterEach(async () => {
    await rm(cacheRoot, { recursive: true, force: true })
  })

  it('uses the shared native audio cache directory name', () => {
    expect(AUDIO_OUTPUT_CACHE_DIR_NAME).toBe('audio-output-cache')
  })

  it('formats byte sizes defensively', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(2048)).toBe('2 KB')
  })

  it('calculates nested directory size and treats missing folders as empty', async () => {
    await writeFile(join(cacheRoot, 'first.bin'), 'abc')
    await mkdir(join(cacheRoot, 'nested'))
    await writeFile(join(cacheRoot, 'nested', 'second.bin'), 'hello')

    await expect(getDirectorySize(cacheRoot)).resolves.toBe(8)
    await expect(getDirectorySize(join(cacheRoot, 'missing'))).resolves.toBe(0)
  })

  it('clears directory contents without removing the directory itself', async () => {
    await writeFile(join(cacheRoot, 'cached.flac'), 'audio')
    await mkdir(join(cacheRoot, 'chunks'))
    await writeFile(join(cacheRoot, 'chunks', 'part.bin'), 'chunk')

    const result = await clearDirectoryContents(cacheRoot)

    expect(result.failed).toEqual([])
    expect(result.removed).toHaveLength(2)
    await expect(readdir(cacheRoot)).resolves.toEqual([])
  })
})
