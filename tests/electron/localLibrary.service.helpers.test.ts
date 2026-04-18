import { beforeEach, describe, expect, it, vi } from 'vitest'

const parseFileMock = vi.hoisted(() => vi.fn())

vi.mock('music-metadata', () => ({
  parseFile: parseFileMock
}))

describe('localLibrary service helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    parseFileMock.mockResolvedValue({
      common: {},
      format: {}
    })
  })

  it('requests full-duration parsing for ogg files', async () => {
    const { readTrackMetadata } = await import('../../electron/local-library/service.helpers')

    await readTrackMetadata('D:\\Music\\sample.ogg')

    expect(parseFileMock).toHaveBeenCalledWith('D:\\Music\\sample.ogg', { duration: true })
  })

  it('requests full-duration parsing for opus files', async () => {
    const { readTrackMetadata } = await import('../../electron/local-library/service.helpers')

    await readTrackMetadata('D:\\Music\\sample.opus')

    expect(parseFileMock).toHaveBeenCalledWith('D:\\Music\\sample.opus', { duration: true })
  })

  it('keeps default parsing for mp3 files', async () => {
    const { readTrackMetadata } = await import('../../electron/local-library/service.helpers')

    await readTrackMetadata('D:\\Music\\sample.mp3')

    expect(parseFileMock).toHaveBeenCalledWith('D:\\Music\\sample.mp3', undefined)
  })

  it('splits slash-delimited artist credits into multiple song artists', async () => {
    const { createTrackSong } = await import('../../electron/local-library/service.helpers')
    const { createArtistId } = await import('../../electron/local-library/repository.helpers')

    const song = createTrackSong(
      'local:track-1',
      'Sample Song',
      'Artist A / Artist B',
      'Sample Album',
      'D:\\Music\\sample.mp3',
      123000,
      null
    )

    expect(song.artists).toEqual([
      { id: createArtistId('Artist A'), name: 'Artist A' },
      { id: createArtistId('Artist B'), name: 'Artist B' }
    ])
  })
})
