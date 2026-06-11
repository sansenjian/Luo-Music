import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { LocalLibraryCoverManager } from '../../electron/local-library/coverManager'

const createdPaths: string[] = []

async function createTempPath(name: string): Promise<string> {
  const directoryPath = await mkdtemp(join(tmpdir(), `${name}-`))
  createdPaths.push(directoryPath)
  return directoryPath
}

afterEach(async () => {
  while (createdPaths.length > 0) {
    const targetPath = createdPaths.pop()
    if (!targetPath) {
      continue
    }

    await rm(targetPath, { recursive: true, force: true })
  }
})

describe('LocalLibraryCoverManager', () => {
  it('generates dedicated thumbnail and album cover files when a resizer is available', async () => {
    const coverDirectoryPath = await createTempPath('local-library-cover-manager')
    const manager = new LocalLibraryCoverManager(coverDirectoryPath, ({ maxSize, size }) =>
      Buffer.from(`resized:${size}:${maxSize}`)
    )
    const coverData = Buffer.from('fake-cover')
    const expectedLargeDataUrl = `data:image/png;base64,${coverData.toString('base64')}`
    const expectedThumbDataUrl = `data:image/png;base64,${Buffer.from('resized:thumb:96').toString('base64')}`
    const expectedAlbumDataUrl = `data:image/png;base64,${Buffer.from('resized:album:512').toString('base64')}`

    const coverHash = await manager.saveEmbeddedCover(coverData, 'image/png')

    expect(coverHash).toEqual(expect.stringMatching(/^[a-f0-9]{40}$/))
    expect(await manager.getCoverDataUrl(coverHash!, 'large')).toBe(expectedLargeDataUrl)
    expect(await manager.getCoverDataUrl(coverHash!, 'thumb')).toBe(expectedThumbDataUrl)
    expect(await manager.getCoverDataUrl(coverHash!, 'album')).toBe(expectedAlbumDataUrl)
    await expect(readdir(coverDirectoryPath)).resolves.toEqual(
      expect.arrayContaining([`${coverHash}.png`, 'album', 'thumb'])
    )
    await expect(readdir(join(coverDirectoryPath, 'thumb'))).resolves.toEqual([`${coverHash}.png`])
    await expect(readdir(join(coverDirectoryPath, 'album'))).resolves.toEqual([`${coverHash}.png`])
  })

  it('falls back to the original cover when resizing is unavailable', async () => {
    const coverDirectoryPath = await createTempPath('local-library-cover-manager-fallback')
    const manager = new LocalLibraryCoverManager(coverDirectoryPath, null)
    const coverData = Buffer.from('fake-cover')
    const expectedDataUrl = `data:image/png;base64,${coverData.toString('base64')}`

    const coverHash = await manager.saveEmbeddedCover(coverData, 'image/png')

    expect(await manager.getCoverDataUrl(coverHash!, 'thumb')).toBe(expectedDataUrl)
    expect(await manager.getCoverDataUrl(coverHash!, 'album')).toBe(expectedDataUrl)
    await expect(readdir(coverDirectoryPath)).resolves.toEqual([`${coverHash}.png`])
  })
})
