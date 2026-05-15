import { describe, expect, it } from 'vitest'

import {
  matchesLocalArtistName,
  summarizeLocalArtists
} from '../../electron/local-library/repository.helpers'

describe('localLibrary repository helpers', () => {
  it('matches a selected artist against slash-delimited artist credits', () => {
    expect(matchesLocalArtistName('Artist A / Artist B', 'Artist A')).toBe(true)
    expect(matchesLocalArtistName('Artist A / Artist B', 'Artist B')).toBe(true)
    expect(matchesLocalArtistName('Artist A / Artist B', 'Artist C')).toBe(false)
  })

  it('builds artist summaries from slash-delimited artist credits', () => {
    const summaries = summarizeLocalArtists([
      {
        artist: 'Artist A / Artist B',
        duration: 1000,
        coverHash: 'cover-1'
      },
      {
        artist: 'Artist B',
        duration: 2000,
        coverHash: 'cover-2'
      }
    ])

    expect(summaries).toEqual([
      {
        id: expect.any(String),
        name: 'Artist A',
        trackCount: 1,
        totalDuration: 1000,
        coverHash: 'cover-1'
      },
      {
        id: expect.any(String),
        name: 'Artist B',
        trackCount: 2,
        totalDuration: 3000,
        coverHash: 'cover-1'
      }
    ])
  })

  it('filters artist summaries by the split artist name instead of the raw credit string', () => {
    const summaries = summarizeLocalArtists(
      [
        {
          artist: 'Artist A / Artist B',
          duration: 1000,
          coverHash: 'cover-1'
        }
      ],
      'Artist B'
    )

    expect(summaries).toEqual([
      {
        id: expect.any(String),
        name: 'Artist B',
        trackCount: 1,
        totalDuration: 1000,
        coverHash: 'cover-1'
      }
    ])
  })
})
