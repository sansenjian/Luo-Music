import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  sql,
  type CompiledQuery,
  type RawBuilder
} from 'kysely'

import type { LocalLibrarySummaryQuery, LocalLibraryTrackQuery } from '@shared/types/localLibrary'

import type { AlbumRow, LocalLibraryDatabase, TrackRow } from './repository.types'

type TrackSelectAlias =
  | 'track.id'
  | 'track.folder_id'
  | 'track.file_path'
  | 'track.file_name'
  | 'track.title'
  | 'track.artist'
  | 'track.album'
  | 'track.duration'
  | 'track.file_size'
  | 'track.modified_at'
  | 'track.cover_hash'

const TRACK_SELECT_COLUMNS: TrackSelectAlias[] = [
  'track.id',
  'track.folder_id',
  'track.file_path',
  'track.file_name',
  'track.title',
  'track.artist',
  'track.album',
  'track.duration',
  'track.file_size',
  'track.modified_at',
  'track.cover_hash'
]

const TRACK_SEARCH_COLUMNS = ['track.title', 'track.artist', 'track.album', 'track.file_name']
const ALBUM_SEARCH_COLUMNS = ['track.album', 'track.artist']

export const localLibraryQueryBuilder = new Kysely<LocalLibraryDatabase>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: db => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler()
  }
})

export type LocalLibraryCompiledQuery<T = unknown> = CompiledQuery<T>

export function createListTracksPageQueries(
  query: LocalLibraryTrackQuery,
  limit: number,
  offset: number
): {
  count: LocalLibraryCompiledQuery<{ count: number }>
  rows: LocalLibraryCompiledQuery<TrackRow>
} {
  const baseQuery = createTracksBaseQuery(query)

  return {
    count: baseQuery.select(({ fn }) => fn.count('track.id').as('count')).compile(),
    rows: baseQuery
      .select(TRACK_SELECT_COLUMNS)
      .orderBy(sql`${sql.ref('track.title')} COLLATE NOCASE`, 'asc')
      .orderBy(sql`${sql.ref('track.file_path')} COLLATE NOCASE`, 'asc')
      .limit(limit)
      .offset(offset)
      .compile()
  }
}

export function createListTracksBatchQuery(
  query: LocalLibraryTrackQuery,
  limit: number,
  offset: number
): LocalLibraryCompiledQuery<TrackRow> {
  return createTracksBaseQuery(query)
    .select(TRACK_SELECT_COLUMNS)
    .orderBy(sql`${sql.ref('track.title')} COLLATE NOCASE`, 'asc')
    .orderBy(sql`${sql.ref('track.file_path')} COLLATE NOCASE`, 'asc')
    .limit(limit)
    .offset(offset)
    .compile()
}

export function createListAlbumsPageQueries(
  query: LocalLibrarySummaryQuery,
  limit: number,
  offset: number
): {
  count: LocalLibraryCompiledQuery<{ count: number }>
  rows: LocalLibraryCompiledQuery<AlbumRow>
} {
  const baseQuery = createAlbumsBaseQuery(query)
  const groupedQuery = baseQuery
    .select(['track.album', 'track.artist'])
    .groupBy(['track.album', 'track.artist'])

  return {
    count: localLibraryQueryBuilder
      .selectFrom(groupedQuery.as('album_group'))
      .select(({ fn }) => fn.countAll().as('count'))
      .compile(),
    rows: baseQuery
      .select(['track.album as album', 'track.artist as artist'])
      .select(({ fn }) => [
        fn.count('track.id').as('track_count'),
        fn.sum<number>('track.duration').as('total_duration'),
        fn.max<string | null>('track.cover_hash').as('cover_hash')
      ])
      .groupBy(['track.album', 'track.artist'])
      .orderBy(sql`${sql.ref('track.album')} COLLATE NOCASE`, 'asc')
      .orderBy(sql`${sql.ref('track.artist')} COLLATE NOCASE`, 'asc')
      .limit(limit)
      .offset(offset)
      .compile()
  }
}

function createTracksBaseQuery(query: LocalLibraryTrackQuery) {
  const searchPattern = query.search?.trim() ? createContainsSearchPattern(query.search) : null

  return localLibraryQueryBuilder
    .selectFrom('local_library_tracks as track')
    .innerJoin('local_library_folders as folder', 'folder.id', 'track.folder_id')
    .where('folder.enabled', '=', 1)
    .$if(Boolean(query.folderId), queryBuilder =>
      queryBuilder.where('track.folder_id', '=', query.folderId ?? '')
    )
    .$if(Boolean(query.artist), queryBuilder =>
      queryBuilder.where('track.artist', '=', query.artist ?? '')
    )
    .$if(Boolean(query.album), queryBuilder =>
      queryBuilder.where('track.album', '=', query.album ?? '')
    )
    .$if(Boolean(searchPattern), queryBuilder =>
      queryBuilder.where(({ or }) =>
        or(
          TRACK_SEARCH_COLUMNS.map(column =>
            createCaseInsensitiveLikeExpression(column, searchPattern ?? '')
          )
        )
      )
    )
}

function createAlbumsBaseQuery(query: LocalLibrarySummaryQuery) {
  const searchPattern = query.search?.trim() ? createContainsSearchPattern(query.search) : null

  return localLibraryQueryBuilder
    .selectFrom('local_library_tracks as track')
    .innerJoin('local_library_folders as folder', 'folder.id', 'track.folder_id')
    .where('folder.enabled', '=', 1)
    .$if(Boolean(searchPattern), queryBuilder =>
      queryBuilder.where(({ or }) =>
        or(
          ALBUM_SEARCH_COLUMNS.map(column =>
            createCaseInsensitiveLikeExpression(column, searchPattern ?? '')
          )
        )
      )
    )
}

function createContainsSearchPattern(search: string): string {
  const escapedSearch = search
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
  return `%${escapedSearch}%`
}

function createCaseInsensitiveLikeExpression(
  column: string,
  searchPattern: string
): RawBuilder<boolean> {
  return sql<boolean>`${sql.ref(column)} COLLATE NOCASE LIKE ${searchPattern} ESCAPE '\\'`
}
