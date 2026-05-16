import { describe, expect, it } from 'vitest'

import {
  createListAlbumsPageQueries,
  createListTracksBatchQuery,
  createListTracksPageQueries
} from '../../electron/local-library/repository.kysely'

describe('localLibrary Kysely query builders', () => {
  it('builds typed track page queries with escaped search filters', () => {
    const queries = createListTracksPageQueries(
      {
        folderId: 'folder-1',
        album: 'Album',
        search: '100%_\\mix'
      },
      25,
      50
    )

    expect(queries.count.sql).toContain('from "local_library_tracks" as "track"')
    expect(queries.count.sql).toContain('"folder"."enabled" = ?')
    expect(queries.count.sql).toContain('"track"."folder_id" = ?')
    expect(queries.count.sql).toContain('"track"."album" = ?')
    expect(queries.count.sql).toContain('"track"."title" COLLATE NOCASE LIKE ?')
    expect(queries.count.parameters).toEqual([
      1,
      'folder-1',
      'Album',
      '%100\\%\\_\\\\mix%',
      '%100\\%\\_\\\\mix%',
      '%100\\%\\_\\\\mix%',
      '%100\\%\\_\\\\mix%'
    ])

    expect(queries.rows.sql).toContain('order by "track"."title" COLLATE NOCASE asc')
    expect(queries.rows.sql).toContain('limit ? offset ?')
    expect(queries.rows.parameters).toEqual([...queries.count.parameters, 25, 50])
  })

  it('builds batch queries without database-side artist equality when split artist matching is required', () => {
    const query = createListTracksBatchQuery(
      {
        search: 'artist',
        artist: undefined
      },
      200,
      0
    )

    expect(query.sql).not.toContain('"track"."artist" = ?')
    expect(query.sql).toContain('"track"."artist" COLLATE NOCASE LIKE ?')
    expect(query.parameters).toEqual([1, '%artist%', '%artist%', '%artist%', '%artist%', 200, 0])
  })

  it('builds grouped album summary queries with search and pagination', () => {
    const queries = createListAlbumsPageQueries({ search: 'album_100%' }, 10, 20)

    expect(queries.count.sql).toContain('select count(*) as "count" from (')
    expect(queries.count.sql).toContain('group by "track"."album", "track"."artist"')
    expect(queries.count.parameters).toEqual([1, '%album\\_100\\%%', '%album\\_100\\%%'])

    expect(queries.rows.sql).toContain('count("track"."id") as "track_count"')
    expect(queries.rows.sql).toContain('sum("track"."duration") as "total_duration"')
    expect(queries.rows.sql).toContain('max("track"."cover_hash") as "cover_hash"')
    expect(queries.rows.sql).toContain('limit ? offset ?')
    expect(queries.rows.parameters).toEqual([1, '%album\\_100\\%%', '%album\\_100\\%%', 10, 20])
  })
})
