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
    const search = `%${query.search.trim()}%`
    clauses.push(
      `(${trackAlias}.title LIKE ? COLLATE NOCASE OR ${trackAlias}.artist LIKE ? COLLATE NOCASE OR ${trackAlias}.album LIKE ? COLLATE NOCASE OR ${trackAlias}.file_name LIKE ? COLLATE NOCASE)`
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

  const search = `%${query.search.trim()}%`
  clauses.push(`(${fields.map(field => `${field} LIKE ? COLLATE NOCASE`).join(' OR ')})`)
  params.push(...fields.map(() => search))
}
