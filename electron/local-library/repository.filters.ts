import type { LocalLibrarySummaryQuery, LocalLibraryTrackQuery } from '@/types/localLibrary'

export function appendTrackFilters(
  clauses: string[],
  params: unknown[],
  query: LocalLibraryTrackQuery,
  trackAlias = 'track',
  folderAlias = 'folder'
): void {
  clauses.push(`${folderAlias}.enabled = 1`)

  if (query.folderId) {
    clauses.push(`${trackAlias}.folder_id = ?`)
    params.push(query.folderId)
  }

  if (query.artist) {
    clauses.push(`${trackAlias}.artist = ?`)
    params.push(query.artist)
  }

  if (query.album) {
    clauses.push(`${trackAlias}.album = ?`)
    params.push(query.album)
  }

  if (query.search && query.search.trim()) {
    const search = createContainsSearchPattern(query.search)
    clauses.push(
      `(${createCaseInsensitiveLikeClause(`${trackAlias}.title`)} OR ${createCaseInsensitiveLikeClause(`${trackAlias}.artist`)} OR ${createCaseInsensitiveLikeClause(`${trackAlias}.album`)} OR ${createCaseInsensitiveLikeClause(`${trackAlias}.file_name`)})`
    )
    params.push(search, search, search, search)
  }
}

export function appendSummarySearchFilter(
  clauses: string[],
  params: unknown[],
  query: LocalLibrarySummaryQuery,
  fields: string[]
): void {
  clauses.push('folder.enabled = 1')

  if (!query.search || !query.search.trim()) {
    return
  }

  const search = createContainsSearchPattern(query.search)
  clauses.push(`(${fields.map(field => createCaseInsensitiveLikeClause(field)).join(' OR ')})`)
  params.push(...fields.map(() => search))
}

function createContainsSearchPattern(search: string): string {
  const escapedSearch = search
    .trim()
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_')
  return `%${escapedSearch}%`
}

function createCaseInsensitiveLikeClause(field: string): string {
  return `${field} COLLATE NOCASE LIKE ? ESCAPE '\\'`
}
