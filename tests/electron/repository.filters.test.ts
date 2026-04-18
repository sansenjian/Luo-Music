import { describe, expect, it } from 'vitest'

import type { LocalLibrarySummaryQuery, LocalLibraryTrackQuery } from '@/types/localLibrary'

import {
  appendSummarySearchFilter,
  appendTrackFilters
} from '../../electron/local-library/repository.filters'

describe('repository.filters', () => {
  it('escapes SQLite LIKE wildcard characters in track searches', () => {
    const clauses: string[] = []
    const params: unknown[] = []
    const query: LocalLibraryTrackQuery = {
      search: '100%_\\mix'
    }

    appendTrackFilters(clauses, params, query)

    expect(clauses).toEqual([
      'folder.enabled = 1',
      "(track.title COLLATE NOCASE LIKE ? ESCAPE '\\' OR track.artist COLLATE NOCASE LIKE ? ESCAPE '\\' OR track.album COLLATE NOCASE LIKE ? ESCAPE '\\' OR track.file_name COLLATE NOCASE LIKE ? ESCAPE '\\')"
    ])
    expect(params).toEqual([
      '%100\\%\\_\\\\mix%',
      '%100\\%\\_\\\\mix%',
      '%100\\%\\_\\\\mix%',
      '%100\\%\\_\\\\mix%'
    ])
  })

  it('escapes SQLite LIKE wildcard characters in summary searches', () => {
    const clauses: string[] = []
    const params: unknown[] = []
    const query: LocalLibrarySummaryQuery = {
      search: 'artist_100%'
    }

    appendSummarySearchFilter(clauses, params, query, ['track.album', 'track.artist'])

    expect(clauses).toEqual([
      'folder.enabled = 1',
      "(track.album COLLATE NOCASE LIKE ? ESCAPE '\\' OR track.artist COLLATE NOCASE LIKE ? ESCAPE '\\')"
    ])
    expect(params).toEqual(['%artist\\_100\\%%', '%artist\\_100\\%%'])
  })
})
