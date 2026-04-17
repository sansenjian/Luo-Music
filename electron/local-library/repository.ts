import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

import type { Song } from '@/types/schemas'
import type {
  LocalLibraryAlbumSummary,
  LocalLibraryFolder,
  LocalLibraryPage,
  LocalLibrarySummaryQuery,
  LocalLibraryTrack,
  LocalLibraryTrackQuery,
  LocalLibraryArtistSummary
} from '@/types/localLibrary'
import { LOCAL_LIBRARY_DEFAULT_PAGE_SIZE } from '@/types/localLibrary'

import { createLocalMediaUrl } from './protocol'

type BetterSqlite3Database = import('better-sqlite3').Database
type BetterSqlite3Statement = import('better-sqlite3').Statement
type BetterSqlite3Constructor = new (
  filename: string,
  options?: {
    readonly?: boolean
    fileMustExist?: boolean
    timeout?: number
  }
) => BetterSqlite3Database

type PersistedFolder = Omit<LocalLibraryFolder, 'songCount'>
type TrackRow = {
  id: string
  folder_id: string
  file_path: string
  file_name: string
  title: string
  artist: string
  album: string
  duration: number
  file_size: number
  modified_at: number
  cover_hash: string | null
}

type FolderRow = {
  id: string
  path: string
  name: string
  enabled: number
  created_at: number
  last_scanned_at: number | null
}

type FolderListRow = FolderRow & {
  song_count: number
}

type ArtistRow = {
  artist: string
  track_count: number
  total_duration: number | null
  cover_hash: string | null
}

type AlbumRow = {
  album: string
  artist: string
  track_count: number
  total_duration: number | null
  cover_hash: string | null
}

const DatabaseConstructor = require('better-sqlite3') as BetterSqlite3Constructor

function resolveDefaultDatabasePath(): string {
  const electronModule = require('electron') as
    | string
    | {
        app?: {
          getPath(name: 'userData'): string
        }
      }
  const userDataPath =
    typeof electronModule === 'object' && electronModule !== null && 'app' in electronModule
      ? electronModule.app?.getPath('userData')
      : undefined

  return path.join(userDataPath ?? path.resolve(process.cwd(), '.userData'), 'local-library.db')
}

function normalizeFolderPath(folderPath: string): string {
  return path.resolve(folderPath).replace(/[\\/]+$/, '')
}

function normalizeFilePath(filePath: string): string {
  return path.resolve(filePath)
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function createPathKey(targetPath: string): string {
  return normalizeFolderPath(targetPath).toLocaleLowerCase()
}

function createFilePathKey(filePath: string): string {
  return normalizeFilePath(filePath).toLocaleLowerCase()
}

function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) {
    return 0
  }

  const matched = /^offset:(\d+)$/.exec(cursor)
  if (!matched) {
    return 0
  }

  const offset = Number.parseInt(matched[1] ?? '0', 10)
  return Number.isFinite(offset) && offset > 0 ? offset : 0
}

function encodeCursor(offset: number, total: number): string | null {
  if (offset >= total) {
    return null
  }

  return `offset:${offset}`
}

function toPageLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return LOCAL_LIBRARY_DEFAULT_PAGE_SIZE
  }

  return Math.max(1, Math.min(200, Math.floor(limit ?? LOCAL_LIBRARY_DEFAULT_PAGE_SIZE)))
}

function createTrackSong(row: TrackRow): Song {
  return {
    id: row.id,
    name: row.title,
    artists: [{ id: `local-artist:${row.artist}`, name: row.artist }],
    album: {
      id: `local-album:${row.album}`,
      name: row.album,
      picUrl: ''
    },
    duration: row.duration,
    mvid: 0,
    platform: 'netease',
    originalId: row.id,
    url: createLocalMediaUrl(row.file_path),
    extra: {
      localSource: true,
      localFilePath: row.file_path,
      localAlbum: row.album,
      localCoverHash: row.cover_hash
    }
  }
}

function mapFolderRow(row: FolderRow): PersistedFolder {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    lastScannedAt: row.last_scanned_at
  }
}

function toArtistSummary(row: ArtistRow): LocalLibraryArtistSummary {
  return {
    id: createArtistId(row.artist),
    name: row.artist,
    trackCount: row.track_count,
    totalDuration: row.total_duration ?? 0,
    coverHash: row.cover_hash ?? null
  }
}

function toAlbumSummary(row: AlbumRow): LocalLibraryAlbumSummary {
  return {
    id: createAlbumId(row.artist, row.album),
    name: row.album,
    artist: row.artist,
    trackCount: row.track_count,
    totalDuration: row.total_duration ?? 0,
    coverHash: row.cover_hash ?? null
  }
}

function appendTrackFilters(
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

function appendSummarySearchFilter(
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

export class LocalLibraryRepository {
  private readonly db: BetterSqlite3Database
  private readonly upsertFolderStatement: BetterSqlite3Statement
  private readonly updateFolderEnabledStatement: BetterSqlite3Statement
  private readonly updateFolderLastScanStatement: BetterSqlite3Statement
  private readonly removeFolderStatement: BetterSqlite3Statement
  private readonly findFolderByPathKeyStatement: BetterSqlite3Statement
  private readonly listFoldersStatement: BetterSqlite3Statement
  private readonly listEnabledFoldersStatement: BetterSqlite3Statement
  private readonly listTracksStatement: BetterSqlite3Statement
  private readonly listTracksByFolderStatement: BetterSqlite3Statement
  private readonly findTrackByFilePathKeyStatement: BetterSqlite3Statement
  private readonly enabledTrackCountStatement: BetterSqlite3Statement
  private readonly deleteTracksByFolderStatement: BetterSqlite3Statement
  private readonly deleteTrackByFilePathKeyStatement: BetterSqlite3Statement
  private readonly insertTrackStatement: BetterSqlite3Statement
  private readonly replaceTracksForFolderTransaction: (
    folderId: string,
    tracks: LocalLibraryTrack[]
  ) => void
  private readonly upsertTracksTransaction: (tracks: LocalLibraryTrack[]) => void

  constructor(databasePath = resolveDefaultDatabasePath()) {
    if (!existsSync(path.dirname(databasePath))) {
      mkdirSync(path.dirname(databasePath), { recursive: true })
    }

    this.db = new DatabaseConstructor(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('synchronous = NORMAL')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_library_folders (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        path_key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_scanned_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS local_library_tracks (
        id TEXT PRIMARY KEY,
        folder_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_path_key TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        duration INTEGER NOT NULL DEFAULT 0,
        file_size INTEGER NOT NULL,
        modified_at INTEGER NOT NULL,
        cover_hash TEXT,
        FOREIGN KEY (folder_id) REFERENCES local_library_folders(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_local_library_tracks_folder_id
        ON local_library_tracks(folder_id);
      CREATE INDEX IF NOT EXISTS idx_local_library_tracks_title
        ON local_library_tracks(title);
      CREATE INDEX IF NOT EXISTS idx_local_library_tracks_artist
        ON local_library_tracks(artist);
      CREATE INDEX IF NOT EXISTS idx_local_library_tracks_album
        ON local_library_tracks(album);
    `)

    this.ensureTrackColumn('cover_hash', 'TEXT')
    this.ensureTrackIndex('idx_local_library_tracks_cover_hash', 'cover_hash')

    this.upsertFolderStatement = this.db.prepare(`
      INSERT INTO local_library_folders (
        id,
        path,
        path_key,
        name,
        enabled,
        created_at,
        last_scanned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        path = excluded.path,
        path_key = excluded.path_key,
        name = excluded.name,
        enabled = excluded.enabled,
        created_at = excluded.created_at,
        last_scanned_at = excluded.last_scanned_at
    `)

    this.updateFolderEnabledStatement = this.db.prepare(`
      UPDATE local_library_folders
      SET enabled = ?
      WHERE id = ?
    `)

    this.updateFolderLastScanStatement = this.db.prepare(`
      UPDATE local_library_folders
      SET last_scanned_at = ?
      WHERE id = ?
    `)

    this.removeFolderStatement = this.db.prepare(`
      DELETE FROM local_library_folders
      WHERE id = ?
    `)

    this.findFolderByPathKeyStatement = this.db.prepare(`
      SELECT id, path, name, enabled, created_at, last_scanned_at
      FROM local_library_folders
      WHERE path_key = ?
      LIMIT 1
    `)

    this.listFoldersStatement = this.db.prepare(`
      SELECT
        folder.id,
        folder.path,
        folder.name,
        folder.enabled,
        folder.created_at,
        folder.last_scanned_at,
        COUNT(track.id) AS song_count
      FROM local_library_folders AS folder
      LEFT JOIN local_library_tracks AS track
        ON track.folder_id = folder.id
      GROUP BY folder.id
      ORDER BY folder.created_at ASC
    `)

    this.listEnabledFoldersStatement = this.db.prepare(`
      SELECT id, path, name, enabled, created_at, last_scanned_at
      FROM local_library_folders
      WHERE enabled = 1
      ORDER BY created_at ASC
    `)

    this.listTracksStatement = this.db.prepare(`
      SELECT
        track.id,
        track.folder_id,
        track.file_path,
        track.file_name,
        track.title,
        track.artist,
        track.album,
        track.duration,
        track.file_size,
        track.modified_at,
        track.cover_hash
      FROM local_library_tracks AS track
      INNER JOIN local_library_folders AS folder
        ON folder.id = track.folder_id
      WHERE folder.enabled = 1
      ORDER BY track.title COLLATE NOCASE ASC, track.file_path COLLATE NOCASE ASC
    `)

    this.listTracksByFolderStatement = this.db.prepare(`
      SELECT
        id,
        folder_id,
        file_path,
        file_name,
        title,
        artist,
        album,
        duration,
        file_size,
        modified_at,
        cover_hash
      FROM local_library_tracks
      WHERE folder_id = ?
      ORDER BY title COLLATE NOCASE ASC, file_path COLLATE NOCASE ASC
    `)

    this.findTrackByFilePathKeyStatement = this.db.prepare(`
      SELECT
        id,
        folder_id,
        file_path,
        file_name,
        title,
        artist,
        album,
        duration,
        file_size,
        modified_at,
        cover_hash
      FROM local_library_tracks
      WHERE file_path_key = ?
      LIMIT 1
    `)

    this.enabledTrackCountStatement = this.db.prepare(`
      SELECT COUNT(track.id) AS count
      FROM local_library_tracks AS track
      INNER JOIN local_library_folders AS folder
        ON folder.id = track.folder_id
      WHERE folder.enabled = 1
    `)

    this.deleteTracksByFolderStatement = this.db.prepare(`
      DELETE FROM local_library_tracks
      WHERE folder_id = ?
    `)

    this.deleteTrackByFilePathKeyStatement = this.db.prepare(`
      DELETE FROM local_library_tracks
      WHERE file_path_key = ?
    `)

    this.insertTrackStatement = this.db.prepare(`
      INSERT INTO local_library_tracks (
        id,
        folder_id,
        file_path,
        file_path_key,
        file_name,
        title,
        artist,
        album,
        duration,
        file_size,
        modified_at,
        cover_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        folder_id = excluded.folder_id,
        file_path = excluded.file_path,
        file_path_key = excluded.file_path_key,
        file_name = excluded.file_name,
        title = excluded.title,
        artist = excluded.artist,
        album = excluded.album,
        duration = excluded.duration,
        file_size = excluded.file_size,
        modified_at = excluded.modified_at,
        cover_hash = excluded.cover_hash
    `)

    this.replaceTracksForFolderTransaction = this.db.transaction(
      (folderId: string, tracks: LocalLibraryTrack[]) => {
        this.deleteTracksByFolderStatement.run(folderId)
        for (const track of tracks) {
          this.runInsertTrack(track)
        }
      }
    )

    this.upsertTracksTransaction = this.db.transaction((tracks: LocalLibraryTrack[]) => {
      for (const track of tracks) {
        this.runInsertTrack(track)
      }
    })
  }

  hasAnyFolder(): boolean {
    const row = this.db.prepare(`SELECT 1 AS value FROM local_library_folders LIMIT 1`).get() as
      | { value?: number }
      | undefined

    return row?.value === 1
  }

  upsertFolder(folder: PersistedFolder): void {
    this.upsertFolderStatement.run(
      folder.id,
      normalizeFolderPath(folder.path),
      createPathKey(folder.path),
      folder.name,
      folder.enabled ? 1 : 0,
      folder.createdAt,
      folder.lastScannedAt
    )
  }

  setFolderEnabled(folderId: string, enabled: boolean): void {
    this.updateFolderEnabledStatement.run(enabled ? 1 : 0, folderId)
  }

  updateFolderLastScannedAt(folderId: string, lastScannedAt: number | null): void {
    this.updateFolderLastScanStatement.run(lastScannedAt, folderId)
  }

  findFolderByPath(folderPath: string): PersistedFolder | null {
    const row = this.findFolderByPathKeyStatement.get(createPathKey(folderPath)) as
      | FolderRow
      | undefined

    return row ? mapFolderRow(row) : null
  }

  removeFolder(folderId: string): void {
    this.removeFolderStatement.run(folderId)
  }

  listFolders(): LocalLibraryFolder[] {
    const rows = this.listFoldersStatement.all() as FolderListRow[]

    return rows.map(row => ({
      ...mapFolderRow(row),
      songCount: row.song_count
    }))
  }

  listEnabledFolders(): PersistedFolder[] {
    const rows = this.listEnabledFoldersStatement.all() as FolderRow[]
    return rows.map(row => mapFolderRow(row))
  }

  listTracks(): LocalLibraryTrack[] {
    const rows = this.listTracksStatement.all() as TrackRow[]
    return rows.map(row => this.mapTrackRow(row))
  }

  listTracksByFolder(folderId: string): LocalLibraryTrack[] {
    const rows = this.listTracksByFolderStatement.all(folderId) as TrackRow[]
    return rows.map(row => this.mapTrackRow(row))
  }

  findTrackByFilePath(filePath: string): LocalLibraryTrack | null {
    const row = this.findTrackByFilePathKeyStatement.get(createFilePathKey(filePath)) as
      | TrackRow
      | undefined

    return row ? this.mapTrackRow(row) : null
  }

  getTrackCount(): number {
    const row = this.enabledTrackCountStatement.get() as { count: number }
    return row.count
  }

  replaceFolderTracks(folderId: string, tracks: LocalLibraryTrack[]): void {
    this.replaceTracksForFolderTransaction(folderId, tracks)
  }

  upsertTracks(tracks: LocalLibraryTrack[]): void {
    if (tracks.length === 0) {
      return
    }

    this.upsertTracksTransaction(tracks)
  }

  deleteTracksByFilePaths(filePaths: string[]): number {
    if (filePaths.length === 0) {
      return 0
    }

    let deleted = 0
    const transaction = this.db.transaction((normalizedPaths: string[]) => {
      for (const filePath of normalizedPaths) {
        const result = this.deleteTrackByFilePathKeyStatement.run(createFilePathKey(filePath))
        deleted += result.changes
      }
    })

    transaction(filePaths)
    return deleted
  }

  getTracksPage(query: LocalLibraryTrackQuery = {}): LocalLibraryPage<LocalLibraryTrack> {
    const limit = toPageLimit(query.limit)
    const offset = decodeCursor(query.cursor)
    const params: unknown[] = []
    const whereClauses: string[] = []

    appendTrackFilters(whereClauses, params, query)

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const fromSql = `
      FROM local_library_tracks AS track
      INNER JOIN local_library_folders AS folder
        ON folder.id = track.folder_id
      ${whereSql}
    `

    const totalRow = this.db
      .prepare(`SELECT COUNT(track.id) AS count ${fromSql}`)
      .get(...params) as { count: number }

    const rows = this.db
      .prepare(
        `
        SELECT
          track.id,
          track.folder_id,
          track.file_path,
          track.file_name,
          track.title,
          track.artist,
          track.album,
          track.duration,
          track.file_size,
          track.modified_at,
          track.cover_hash
        ${fromSql}
        ORDER BY track.title COLLATE NOCASE ASC, track.file_path COLLATE NOCASE ASC
        LIMIT ? OFFSET ?
      `
      )
      .all(...params, limit, offset) as TrackRow[]

    return {
      items: rows.map(row => this.mapTrackRow(row)),
      nextCursor: encodeCursor(offset + rows.length, totalRow.count),
      total: totalRow.count,
      limit
    }
  }

  getArtistsPage(
    query: LocalLibrarySummaryQuery = {}
  ): LocalLibraryPage<LocalLibraryArtistSummary> {
    const limit = toPageLimit(query.limit)
    const offset = decodeCursor(query.cursor)
    const params: unknown[] = []
    const whereClauses: string[] = []

    appendSummarySearchFilter(whereClauses, params, query, ['track.artist'])

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const groupedSql = `
      FROM local_library_tracks AS track
      INNER JOIN local_library_folders AS folder
        ON folder.id = track.folder_id
      ${whereSql}
      GROUP BY track.artist
    `

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM (SELECT track.artist ${groupedSql})`)
      .get(...params) as { count: number }

    const rows = this.db
      .prepare(
        `
        SELECT
          track.artist AS artist,
          COUNT(track.id) AS track_count,
          SUM(track.duration) AS total_duration,
          MAX(track.cover_hash) AS cover_hash
        ${groupedSql}
        ORDER BY track.artist COLLATE NOCASE ASC
        LIMIT ? OFFSET ?
      `
      )
      .all(...params, limit, offset) as ArtistRow[]

    return {
      items: rows.map(row => toArtistSummary(row)),
      nextCursor: encodeCursor(offset + rows.length, totalRow.count),
      total: totalRow.count,
      limit
    }
  }

  getAlbumsPage(query: LocalLibrarySummaryQuery = {}): LocalLibraryPage<LocalLibraryAlbumSummary> {
    const limit = toPageLimit(query.limit)
    const offset = decodeCursor(query.cursor)
    const params: unknown[] = []
    const whereClauses: string[] = []

    appendSummarySearchFilter(whereClauses, params, query, ['track.album', 'track.artist'])

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const groupedSql = `
      FROM local_library_tracks AS track
      INNER JOIN local_library_folders AS folder
        ON folder.id = track.folder_id
      ${whereSql}
      GROUP BY track.album, track.artist
    `

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM (SELECT track.album, track.artist ${groupedSql})`)
      .get(...params) as { count: number }

    const rows = this.db
      .prepare(
        `
        SELECT
          track.album AS album,
          track.artist AS artist,
          COUNT(track.id) AS track_count,
          SUM(track.duration) AS total_duration,
          MAX(track.cover_hash) AS cover_hash
        ${groupedSql}
        ORDER BY track.album COLLATE NOCASE ASC, track.artist COLLATE NOCASE ASC
        LIMIT ? OFFSET ?
      `
      )
      .all(...params, limit, offset) as AlbumRow[]

    return {
      items: rows.map(row => toAlbumSummary(row)),
      nextCursor: encodeCursor(offset + rows.length, totalRow.count),
      total: totalRow.count,
      limit
    }
  }

  private ensureTrackColumn(columnName: string, columnDefinition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(local_library_tracks)`).all() as Array<{
      name: string
    }>
    if (columns.some(column => column.name === columnName)) {
      return
    }

    this.db.exec(`ALTER TABLE local_library_tracks ADD COLUMN ${columnName} ${columnDefinition}`)
  }

  private ensureTrackIndex(indexName: string, columnName: string): void {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS ${indexName}
        ON local_library_tracks(${columnName});
    `)
  }

  private runInsertTrack(track: LocalLibraryTrack): void {
    this.insertTrackStatement.run(
      track.id,
      track.folderId,
      normalizeFilePath(track.filePath),
      createFilePathKey(track.filePath),
      track.fileName,
      track.title,
      track.artist,
      track.album,
      track.duration,
      track.fileSize,
      track.modifiedAt,
      track.coverHash
    )
  }

  private mapTrackRow(row: TrackRow): LocalLibraryTrack {
    return {
      id: row.id,
      folderId: row.folder_id,
      filePath: row.file_path,
      fileName: row.file_name,
      title: row.title,
      artist: row.artist,
      album: row.album,
      duration: row.duration,
      fileSize: row.file_size,
      modifiedAt: row.modified_at,
      coverHash: row.cover_hash ?? null,
      song: createTrackSong(row)
    }
  }

  close(): void {
    this.db.close()
  }
}

export function createFolderId(folderPath: string): string {
  const normalized = normalizeFolderPath(folderPath).toLocaleLowerCase()
  const hash = createHash('sha1').update(normalized).digest('hex')
  return `local-folder:${hash}`
}

export function createTrackId(prefix: string, filePath: string): string {
  const normalized = normalizeFilePath(filePath).toLocaleLowerCase()
  const hash = createHash('sha1').update(normalized).digest('hex')
  return `${prefix}${hash}`
}

export function createArtistId(artistName: string): string {
  const hash = createHash('sha1').update(normalizeText(artistName)).digest('hex')
  return `local-artist:${hash}`
}

export function createAlbumId(artistName: string, albumName: string): string {
  const hash = createHash('sha1')
    .update(`${normalizeText(artistName)}\u0000${normalizeText(albumName)}`)
    .digest('hex')
  return `local-album:${hash}`
}
