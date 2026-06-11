import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryDuplicateMode,
  LocalLibraryDuplicateSummary,
  LocalLibraryHealthSummary,
  LocalLibraryMetadataCandidate,
  LocalLibraryMetadataCandidateField,
  LocalLibraryMetadataCandidateSummary,
  LocalLibraryPage,
  LocalLibraryScanJob,
  LocalLibraryScanJobKind,
  LocalLibraryScanJobPhase,
  LocalLibrarySummaryQuery,
  LocalLibraryTrack,
  LocalLibraryTrackQuery
} from '@shared/types/localLibrary'
import {
  LOCAL_LIBRARY_INBOX_WINDOW_MS,
  createEmptyLocalLibraryMetadataCandidateSummary
} from '@shared/types/localLibrary'

import {
  createFilePathKey,
  createPathKey,
  decodeCursor,
  encodeCursor,
  matchesLocalArtistName,
  normalizeFilePath,
  normalizeFolderPath,
  resolveDefaultDatabasePath,
  summarizeLocalArtists,
  toPageLimit
} from './repository.helpers'
import {
  createListAlbumsPageQueries,
  createListTracksBatchQuery,
  createListTracksPageQueries,
  type LocalLibraryCompiledQuery
} from './repository.kysely'
import { buildStrictDuplicateIndex } from './duplicates'
import { mapFolderListRow, mapFolderRow, mapTrackRow, toAlbumSummary } from './repository.mappers'
import type {
  ArtistSummarySourceRow,
  BetterSqlite3Constructor,
  BetterSqlite3Database,
  BetterSqlite3Statement,
  FolderRow,
  MetadataCandidateSummaryRow,
  PersistedFolder,
  TrackRow
} from './repository.types'

const DatabaseConstructor = require('better-sqlite3') as BetterSqlite3Constructor

type ScanJobRow = {
  id: string
  kind: LocalLibraryScanJobKind
  phase: LocalLibraryScanJobPhase
  message: string
  folder_count: number
  scanned_folders: number
  scanned_files: number
  discovered_tracks: number
  error_message: string | null
  started_at: number
  finished_at: number | null
  updated_at: number
}

export class LocalLibraryRepository {
  private readonly db: BetterSqlite3Database
  private readonly hasAnyFolderStatement: BetterSqlite3Statement
  private readonly upsertFolderStatement: BetterSqlite3Statement
  private readonly updateFolderEnabledStatement: BetterSqlite3Statement
  private readonly updateFolderLastScanStatement: BetterSqlite3Statement
  private readonly removeFolderStatement: BetterSqlite3Statement
  private readonly findFolderByIdStatement: BetterSqlite3Statement
  private readonly findFolderByPathKeyStatement: BetterSqlite3Statement
  private readonly listFoldersStatement: BetterSqlite3Statement
  private readonly listEnabledFoldersStatement: BetterSqlite3Statement
  private readonly listTracksStatement: BetterSqlite3Statement
  private readonly listTracksByFolderStatement: BetterSqlite3Statement
  private readonly listArtistSummarySourceRowsStatement: BetterSqlite3Statement
  private readonly findTrackByIdStatement: BetterSqlite3Statement
  private readonly findTrackByFilePathKeyStatement: BetterSqlite3Statement
  private readonly enabledTrackCountStatement: BetterSqlite3Statement
  private readonly listUsedCoverHashesStatement: BetterSqlite3Statement
  private readonly deleteTracksByFolderStatement: BetterSqlite3Statement
  private readonly deleteTrackByFilePathKeyStatement: BetterSqlite3Statement
  private readonly deleteDuplicateGroupsForTrackStatement: BetterSqlite3Statement
  private readonly deleteDuplicateMembersForTrackStatement: BetterSqlite3Statement
  private readonly insertTrackStatement: BetterSqlite3Statement
  private readonly deleteMetadataCandidatesForTrackStatement: BetterSqlite3Statement
  private readonly insertMetadataCandidateStatement: BetterSqlite3Statement
  private readonly replaceTracksForFolderTransaction: (
    folderId: string,
    tracks: LocalLibraryTrack[]
  ) => void
  private readonly upsertTracksTransaction: (tracks: LocalLibraryTrack[]) => void
  private closed = false

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
        first_seen_at INTEGER NOT NULL,
        cover_hash TEXT,
        codec TEXT,
        sample_rate INTEGER,
        bit_depth INTEGER,
        bitrate INTEGER,
        metadata_sources_json TEXT,
        FOREIGN KEY (folder_id) REFERENCES local_library_folders(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS local_library_metadata_candidates (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        field TEXT NOT NULL,
        source TEXT NOT NULL,
        current_value TEXT,
        suggested_value TEXT,
        confidence REAL NOT NULL,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(track_id, field),
        FOREIGN KEY (track_id) REFERENCES local_library_tracks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS local_library_scan_jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        phase TEXT NOT NULL,
        message TEXT NOT NULL,
        folder_count INTEGER NOT NULL,
        scanned_folders INTEGER NOT NULL,
        scanned_files INTEGER NOT NULL,
        discovered_tracks INTEGER NOT NULL,
        error_message TEXT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_library_duplicate_groups (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        duplicate_key TEXT NOT NULL,
        representative_track_id TEXT NOT NULL,
        track_count INTEGER NOT NULL,
        hidden_count INTEGER NOT NULL,
        confidence REAL NOT NULL,
        reasons_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (representative_track_id) REFERENCES local_library_tracks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS local_library_duplicate_members (
        group_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        quality_score INTEGER NOT NULL,
        rank INTEGER NOT NULL,
        hidden INTEGER NOT NULL,
        reasons_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (group_id, track_id),
        FOREIGN KEY (group_id) REFERENCES local_library_duplicate_groups(id) ON DELETE CASCADE,
        FOREIGN KEY (track_id) REFERENCES local_library_tracks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_local_library_tracks_folder_id
        ON local_library_tracks(folder_id);
      CREATE INDEX IF NOT EXISTS idx_local_library_tracks_title
        ON local_library_tracks(title);
      CREATE INDEX IF NOT EXISTS idx_local_library_tracks_artist
        ON local_library_tracks(artist);
      CREATE INDEX IF NOT EXISTS idx_local_library_tracks_album
        ON local_library_tracks(album);
      CREATE INDEX IF NOT EXISTS idx_local_library_metadata_candidates_track_id
        ON local_library_metadata_candidates(track_id);
      CREATE INDEX IF NOT EXISTS idx_local_library_metadata_candidates_state
        ON local_library_metadata_candidates(state);
      CREATE INDEX IF NOT EXISTS idx_local_library_duplicate_groups_mode
        ON local_library_duplicate_groups(mode);
      CREATE INDEX IF NOT EXISTS idx_local_library_duplicate_members_group_id
        ON local_library_duplicate_members(group_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_local_library_duplicate_members_mode_track
        ON local_library_duplicate_members(mode, track_id);
      CREATE INDEX IF NOT EXISTS idx_local_library_scan_jobs_updated_at
        ON local_library_scan_jobs(updated_at);
    `)

    this.ensureTrackColumn('cover_hash', 'TEXT')
    this.ensureTrackColumn('codec', 'TEXT')
    this.ensureTrackColumn('sample_rate', 'INTEGER')
    this.ensureTrackColumn('bit_depth', 'INTEGER')
    this.ensureTrackColumn('bitrate', 'INTEGER')
    this.ensureTrackColumn('metadata_sources_json', 'TEXT')
    this.ensureTrackColumn('first_seen_at', 'INTEGER')
    this.backfillFirstSeenAt()
    this.ensureTrackIndex('idx_local_library_tracks_cover_hash', 'cover_hash')
    this.ensureTrackIndex('idx_local_library_tracks_first_seen_at', 'first_seen_at')

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
    this.findFolderByIdStatement = this.db.prepare(`
      SELECT id, path, name, enabled, created_at, last_scanned_at
      FROM local_library_folders
      WHERE id = ?
      LIMIT 1
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
        track.first_seen_at,
        track.cover_hash,
        track.codec,
        track.sample_rate,
        track.bit_depth,
        track.bitrate,
        track.metadata_sources_json
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
        first_seen_at,
        cover_hash,
        codec,
        sample_rate,
        bit_depth,
        bitrate,
        metadata_sources_json
      FROM local_library_tracks
      WHERE folder_id = ?
      ORDER BY title COLLATE NOCASE ASC, file_path COLLATE NOCASE ASC
    `)
    this.listArtistSummarySourceRowsStatement = this.db.prepare(`
      SELECT
        track.artist,
        track.duration,
        track.cover_hash
      FROM local_library_tracks AS track
      INNER JOIN local_library_folders AS folder
        ON folder.id = track.folder_id
      WHERE folder.enabled = 1
    `)
    this.findTrackByIdStatement = this.db.prepare(`
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
        first_seen_at,
        cover_hash,
        codec,
        sample_rate,
        bit_depth,
        bitrate,
        metadata_sources_json
      FROM local_library_tracks
      WHERE id = ?
      LIMIT 1
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
        first_seen_at,
        cover_hash,
        codec,
        sample_rate,
        bit_depth,
        bitrate,
        metadata_sources_json
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
    this.listUsedCoverHashesStatement = this.db.prepare(`
      SELECT DISTINCT track.cover_hash AS cover_hash
      FROM local_library_tracks AS track
      INNER JOIN local_library_folders AS folder
        ON folder.id = track.folder_id
      WHERE folder.enabled = 1
        AND track.cover_hash IS NOT NULL
        AND track.cover_hash != ''
    `)
    this.hasAnyFolderStatement = this.db.prepare(`
      SELECT 1 AS value
      FROM local_library_folders
      LIMIT 1
    `)
    this.deleteTracksByFolderStatement = this.db.prepare(`
      DELETE FROM local_library_tracks
      WHERE folder_id = ?
    `)
    this.deleteTrackByFilePathKeyStatement = this.db.prepare(`
      DELETE FROM local_library_tracks
      WHERE file_path_key = ?
    `)
    this.deleteDuplicateGroupsForTrackStatement = this.db.prepare(`
      DELETE FROM local_library_duplicate_groups
      WHERE representative_track_id = ?
    `)
    this.deleteDuplicateMembersForTrackStatement = this.db.prepare(`
      DELETE FROM local_library_duplicate_members
      WHERE track_id = ?
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
        first_seen_at,
        cover_hash,
        codec,
        sample_rate,
        bit_depth,
        bitrate,
        metadata_sources_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        first_seen_at = COALESCE(local_library_tracks.first_seen_at, excluded.first_seen_at),
        cover_hash = excluded.cover_hash,
        codec = excluded.codec,
        sample_rate = excluded.sample_rate,
        bit_depth = excluded.bit_depth,
        bitrate = excluded.bitrate,
        metadata_sources_json = excluded.metadata_sources_json
      ON CONFLICT(file_path_key) DO UPDATE SET
        id = excluded.id,
        folder_id = excluded.folder_id,
        file_path = excluded.file_path,
        file_name = excluded.file_name,
        title = excluded.title,
        artist = excluded.artist,
        album = excluded.album,
        duration = excluded.duration,
        file_size = excluded.file_size,
        modified_at = excluded.modified_at,
        first_seen_at = COALESCE(local_library_tracks.first_seen_at, excluded.first_seen_at),
        cover_hash = excluded.cover_hash,
        codec = excluded.codec,
        sample_rate = excluded.sample_rate,
        bit_depth = excluded.bit_depth,
        bitrate = excluded.bitrate,
        metadata_sources_json = excluded.metadata_sources_json
    `)
    this.deleteMetadataCandidatesForTrackStatement = this.db.prepare(`
      DELETE FROM local_library_metadata_candidates
      WHERE track_id = ?
    `)
    this.insertMetadataCandidateStatement = this.db.prepare(`
      INSERT INTO local_library_metadata_candidates (
        id,
        track_id,
        field,
        source,
        current_value,
        suggested_value,
        confidence,
        state,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(track_id, field) DO UPDATE SET
        source = excluded.source,
        current_value = excluded.current_value,
        suggested_value = excluded.suggested_value,
        confidence = excluded.confidence,
        state = excluded.state,
        updated_at = excluded.updated_at
    `)

    this.replaceTracksForFolderTransaction = this.db.transaction(
      (folderId: string, tracks: LocalLibraryTrack[]) => {
        const firstSeenByPathKey = new Map(
          (this.listTracksByFolderStatement.all(folderId) as TrackRow[]).map(row => [
            createFilePathKey(row.file_path),
            row.first_seen_at ?? row.modified_at
          ])
        )

        this.deleteTracksByFolderStatement.run(folderId)
        for (const track of tracks) {
          this.runInsertTrack({
            ...track,
            firstSeenAt:
              firstSeenByPathKey.get(createFilePathKey(track.filePath)) ?? track.firstSeenAt
          })
        }
      }
    )
    this.upsertTracksTransaction = this.db.transaction((tracks: LocalLibraryTrack[]) => {
      for (const track of tracks) {
        this.runInsertTrack(track)
      }
    })

    this.rebuildDuplicateIndex()
  }

  hasAnyFolder(): boolean {
    const row = this.hasAnyFolderStatement.get() as { value?: number } | undefined

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

  findFolderById(folderId: string): PersistedFolder | null {
    const row = this.findFolderByIdStatement.get(folderId) as FolderRow | undefined

    return row ? mapFolderRow(row) : null
  }

  removeFolder(folderId: string): void {
    this.removeFolderStatement.run(folderId)
  }

  listFolders() {
    return (this.listFoldersStatement.all() as import('./repository.types').FolderListRow[]).map(
      mapFolderListRow
    )
  }

  listEnabledFolders(): PersistedFolder[] {
    return (this.listEnabledFoldersStatement.all() as FolderRow[]).map(mapFolderRow)
  }

  listTracks(): LocalLibraryTrack[] {
    return (this.listTracksStatement.all() as TrackRow[]).map(mapTrackRow)
  }

  listTracksByFolder(folderId: string): LocalLibraryTrack[] {
    return (this.listTracksByFolderStatement.all(folderId) as TrackRow[]).map(mapTrackRow)
  }

  findTrackByFilePath(filePath: string): LocalLibraryTrack | null {
    const row = this.findTrackByFilePathKeyStatement.get(createFilePathKey(filePath)) as
      | TrackRow
      | undefined

    return row ? mapTrackRow(row) : null
  }

  findTrackById(trackId: string): LocalLibraryTrack | null {
    const row = this.findTrackByIdStatement.get(trackId) as TrackRow | undefined

    return row ? mapTrackRow(row) : null
  }

  getTrackCount(): number {
    const row = this.enabledTrackCountStatement.get() as { count: number }
    return row.count
  }

  listUsedCoverHashes(): string[] {
    const rows = this.listUsedCoverHashesStatement.all() as Array<{ cover_hash: string }>

    return rows.map(row => row.cover_hash)
  }

  runInTransaction<T>(task: () => T): T {
    return this.db.transaction(task)()
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
    const normalizedQuery = normalizeTrackPageQuery(query)
    const limit = toPageLimit(normalizedQuery.limit)
    const offset = decodeCursor(normalizedQuery.cursor)
    const artistFilter = normalizedQuery.artist?.trim() ? normalizedQuery.artist.trim() : null
    const databaseQuery = artistFilter
      ? {
          ...normalizedQuery,
          artist: undefined
        }
      : normalizedQuery

    if (artistFilter) {
      const batchSize = Math.max(200, limit)
      const filteredRows: TrackRow[] = []
      let filteredCount = 0
      let fetchOffset = 0

      while (true) {
        const batchRows = this.allCompiledQuery(
          createListTracksBatchQuery(databaseQuery, batchSize, fetchOffset)
        )
        if (batchRows.length === 0) {
          break
        }

        for (const row of batchRows) {
          if (!matchesLocalArtistName(row.artist, artistFilter)) {
            continue
          }

          if (filteredCount >= offset && filteredRows.length < limit) {
            filteredRows.push(row)
          }

          filteredCount += 1
        }

        fetchOffset += batchRows.length
        if (batchRows.length < batchSize) {
          break
        }
      }

      return {
        items: filteredRows.map(mapTrackRow),
        nextCursor: encodeCursor(offset + filteredRows.length, filteredCount),
        total: filteredCount,
        limit
      }
    }

    const pageQueries = createListTracksPageQueries(normalizedQuery, limit, offset)
    const totalRow = this.getCompiledQuery(pageQueries.count) ?? { count: 0 }
    const rows = this.allCompiledQuery(pageQueries.rows)

    return {
      items: rows.map(mapTrackRow),
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
    const artistSummaries = summarizeLocalArtists(
      (this.listArtistSummarySourceRowsStatement.all() as ArtistSummarySourceRow[]).map(row => ({
        artist: row.artist,
        duration: row.duration,
        coverHash: row.cover_hash
      })),
      query.search
    )
    const pagedItems = artistSummaries.slice(offset, offset + limit)

    return {
      items: pagedItems,
      nextCursor: encodeCursor(offset + pagedItems.length, artistSummaries.length),
      total: artistSummaries.length,
      limit
    }
  }

  getAlbumsPage(query: LocalLibrarySummaryQuery = {}): LocalLibraryPage<LocalLibraryAlbumSummary> {
    const limit = toPageLimit(query.limit)
    const offset = decodeCursor(query.cursor)
    const pageQueries = createListAlbumsPageQueries(query, limit, offset)
    const totalRow = this.getCompiledQuery(pageQueries.count) ?? { count: 0 }
    const rows = this.allCompiledQuery(pageQueries.rows)

    return {
      items: rows.map(toAlbumSummary),
      nextCursor: encodeCursor(offset + rows.length, totalRow.count),
      total: totalRow.count,
      limit
    }
  }

  createScanJob(input: {
    kind: LocalLibraryScanJobKind
    message: string
    folderCount: number
  }): LocalLibraryScanJob {
    const now = Date.now()
    const scanJob: LocalLibraryScanJob = {
      id: `local-scan:${randomUUID()}`,
      kind: input.kind,
      phase: 'queued',
      message: input.message,
      folderCount: input.folderCount,
      scannedFolders: 0,
      scannedFiles: 0,
      discoveredTracks: this.getTrackCount(),
      errorMessage: null,
      startedAt: now,
      finishedAt: null,
      updatedAt: now
    }

    this.db
      .prepare(
        `
          INSERT INTO local_library_scan_jobs (
            id,
            kind,
            phase,
            message,
            folder_count,
            scanned_folders,
            scanned_files,
            discovered_tracks,
            error_message,
            started_at,
            finished_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        scanJob.id,
        scanJob.kind,
        scanJob.phase,
        scanJob.message,
        scanJob.folderCount,
        scanJob.scannedFolders,
        scanJob.scannedFiles,
        scanJob.discoveredTracks,
        scanJob.errorMessage,
        scanJob.startedAt,
        scanJob.finishedAt,
        scanJob.updatedAt
      )

    return scanJob
  }

  updateScanJob(
    scanJobId: string,
    patch: Partial<
      Pick<
        LocalLibraryScanJob,
        | 'discoveredTracks'
        | 'errorMessage'
        | 'finishedAt'
        | 'message'
        | 'phase'
        | 'scannedFiles'
        | 'scannedFolders'
      >
    >
  ): LocalLibraryScanJob | null {
    const current = this.findScanJobById(scanJobId)
    if (!current) {
      return null
    }

    const nextJob: LocalLibraryScanJob = {
      ...current,
      ...patch,
      updatedAt: Date.now()
    }

    this.db
      .prepare(
        `
          UPDATE local_library_scan_jobs
          SET
            phase = ?,
            message = ?,
            scanned_folders = ?,
            scanned_files = ?,
            discovered_tracks = ?,
            error_message = ?,
            finished_at = ?,
            updated_at = ?
          WHERE id = ?
        `
      )
      .run(
        nextJob.phase,
        nextJob.message,
        nextJob.scannedFolders,
        nextJob.scannedFiles,
        nextJob.discoveredTracks,
        nextJob.errorMessage,
        nextJob.finishedAt,
        nextJob.updatedAt,
        nextJob.id
      )

    return nextJob
  }

  findScanJobById(scanJobId: string): LocalLibraryScanJob | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            kind,
            phase,
            message,
            folder_count,
            scanned_folders,
            scanned_files,
            discovered_tracks,
            error_message,
            started_at,
            finished_at,
            updated_at
          FROM local_library_scan_jobs
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(scanJobId) as ScanJobRow | undefined

    return row ? mapScanJobRow(row) : null
  }

  getLatestScanJob(): LocalLibraryScanJob | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            kind,
            phase,
            message,
            folder_count,
            scanned_folders,
            scanned_files,
            discovered_tracks,
            error_message,
            started_at,
            finished_at,
            updated_at
          FROM local_library_scan_jobs
          ORDER BY updated_at DESC
          LIMIT 1
        `
      )
      .get() as ScanJobRow | undefined

    return row ? mapScanJobRow(row) : null
  }

  rebuildDuplicateIndex(mode: LocalLibraryDuplicateMode = 'strict'): LocalLibraryDuplicateSummary {
    const groups = mode === 'strict' ? buildStrictDuplicateIndex(this.listTracks()) : []
    const updatedAt = Date.now()
    const deleteMembersStatement = this.db.prepare(`
      DELETE FROM local_library_duplicate_members
      WHERE mode = ?
    `)
    const deleteGroupsStatement = this.db.prepare(`
      DELETE FROM local_library_duplicate_groups
      WHERE mode = ?
    `)
    const insertGroupStatement = this.db.prepare(`
      INSERT INTO local_library_duplicate_groups (
        id,
        mode,
        duplicate_key,
        representative_track_id,
        track_count,
        hidden_count,
        confidence,
        reasons_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertMemberStatement = this.db.prepare(`
      INSERT INTO local_library_duplicate_members (
        group_id,
        track_id,
        mode,
        quality_score,
        rank,
        hidden,
        reasons_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.db.transaction(() => {
      deleteMembersStatement.run(mode)
      deleteGroupsStatement.run(mode)

      for (const group of groups) {
        insertGroupStatement.run(
          group.id,
          group.mode,
          group.duplicateKey,
          group.representativeTrackId,
          group.trackCount,
          group.hiddenCount,
          group.confidence,
          JSON.stringify(group.reasons),
          updatedAt,
          updatedAt
        )

        for (const member of group.members) {
          insertMemberStatement.run(
            member.groupId,
            member.trackId,
            group.mode,
            member.qualityScore,
            member.rank,
            member.hidden ? 1 : 0,
            JSON.stringify(member.reasons),
            updatedAt,
            updatedAt
          )
        }
      }
    })()

    return this.getDuplicateSummary(mode)
  }

  getDuplicateSummary(mode: LocalLibraryDuplicateMode = 'strict'): LocalLibraryDuplicateSummary {
    const groupRow = this.db
      .prepare(
        `
          SELECT COUNT(id) AS count, MAX(updated_at) AS updated_at
          FROM local_library_duplicate_groups
          WHERE mode = ?
        `
      )
      .get(mode) as { count: number; updated_at: number | null }
    const memberRow = this.db
      .prepare(
        `
          SELECT
            COUNT(track_id) AS duplicate_track_count,
            SUM(CASE WHEN hidden = 1 THEN 1 ELSE 0 END) AS hidden_track_count
          FROM local_library_duplicate_members
          WHERE mode = ?
        `
      )
      .get(mode) as { duplicate_track_count: number; hidden_track_count: number | null }

    return {
      mode,
      groupCount: groupRow.count,
      duplicateTrackCount: memberRow.duplicate_track_count,
      hiddenTrackCount: memberRow.hidden_track_count ?? 0,
      updatedAt: groupRow.updated_at ?? null
    }
  }

  getHealthSummary(): LocalLibraryHealthSummary {
    const now = Date.now()
    const inboxSince = now - LOCAL_LIBRARY_INBOX_WINDOW_MS
    const folderRow = this.db
      .prepare(
        `
          SELECT
            COUNT(id) AS folder_count,
            SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled_folder_count
          FROM local_library_folders
        `
      )
      .get() as { folder_count: number; enabled_folder_count: number | null }
    const trackRow = this.db
      .prepare(
        `
          SELECT
            COUNT(track.id) AS track_count,
            SUM(CASE WHEN track.first_seen_at >= ? THEN 1 ELSE 0 END) AS inbox_track_count,
            SUM(CASE WHEN track.cover_hash IS NULL OR track.cover_hash = '' THEN 1 ELSE 0 END) AS missing_cover_count,
            SUM(CASE WHEN track.duration <= 0 THEN 1 ELSE 0 END) AS missing_duration_count,
            SUM(
              CASE
                WHEN track.codec IS NULL
                  AND track.sample_rate IS NULL
                  AND track.bit_depth IS NULL
                  AND track.bitrate IS NULL
                THEN 1
                ELSE 0
              END
            ) AS missing_technical_metadata_count,
            SUM(CASE WHEN folder.enabled = 1 AND folder.last_scanned_at IS NULL THEN 1 ELSE 0 END) AS stale_track_count
          FROM local_library_tracks AS track
          INNER JOIN local_library_folders AS folder
            ON folder.id = track.folder_id
          WHERE folder.enabled = 1
        `
      )
      .get(inboxSince) as {
      track_count: number
      inbox_track_count: number | null
      missing_cover_count: number | null
      missing_duration_count: number | null
      missing_technical_metadata_count: number | null
      stale_track_count: number | null
    }
    const duplicateSummary = this.getDuplicateSummary()

    return {
      trackCount: trackRow.track_count,
      folderCount: folderRow.folder_count,
      enabledFolderCount: folderRow.enabled_folder_count ?? 0,
      inboxTrackCount: trackRow.inbox_track_count ?? 0,
      missingCoverCount: trackRow.missing_cover_count ?? 0,
      missingDurationCount: trackRow.missing_duration_count ?? 0,
      missingTechnicalMetadataCount: trackRow.missing_technical_metadata_count ?? 0,
      duplicateGroupCount: duplicateSummary.groupCount,
      duplicateTrackCount: duplicateSummary.duplicateTrackCount,
      hiddenDuplicateTrackCount: duplicateSummary.hiddenTrackCount,
      staleTrackCount: trackRow.stale_track_count ?? 0,
      updatedAt: now
    }
  }

  getMetadataCandidateSummary(): LocalLibraryMetadataCandidateSummary {
    const rows = this.db
      .prepare(
        `
          SELECT
            candidate.field,
            candidate.source,
            COUNT(candidate.id) AS count,
            MAX(candidate.updated_at) AS updated_at
          FROM local_library_metadata_candidates AS candidate
          INNER JOIN local_library_tracks AS track
            ON track.id = candidate.track_id
          INNER JOIN local_library_folders AS folder
            ON folder.id = track.folder_id
          WHERE candidate.state = 'pending'
            AND folder.enabled = 1
          GROUP BY candidate.field, candidate.source
        `
      )
      .all() as MetadataCandidateSummaryRow[]

    const summary = createEmptyLocalLibraryMetadataCandidateSummary()
    let pendingCount = 0
    let updatedAt: number | null = null

    for (const row of rows) {
      pendingCount += row.count
      summary.byField[row.field] = (summary.byField[row.field] ?? 0) + row.count
      summary.bySource[row.source] = (summary.bySource[row.source] ?? 0) + row.count
      if (row.updated_at !== null) {
        updatedAt = Math.max(updatedAt ?? row.updated_at, row.updated_at)
      }
    }

    return {
      ...summary,
      pendingCount,
      updatedAt
    }
  }

  close(): void {
    if (this.closed) {
      return
    }

    this.db.close()
    this.closed = true
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

  private backfillFirstSeenAt(): void {
    this.db.exec(`
      UPDATE local_library_tracks
      SET first_seen_at = COALESCE(first_seen_at, modified_at, CAST(strftime('%s', 'now') AS INTEGER) * 1000)
      WHERE first_seen_at IS NULL
    `)
  }

  private ensureTrackIndex(indexName: string, columnName: string): void {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS ${indexName}
        ON local_library_tracks(${columnName});
    `)
  }

  private getCompiledQuery<T>(query: LocalLibraryCompiledQuery<T>): T | undefined {
    return this.db.prepare(query.sql).get(...query.parameters) as T | undefined
  }

  private allCompiledQuery<T>(query: LocalLibraryCompiledQuery<T>): T[] {
    return this.db.prepare(query.sql).all(...query.parameters) as T[]
  }

  private runInsertTrack(track: LocalLibraryTrack): void {
    const normalizedFilePath = normalizeFilePath(track.filePath)
    const filePathKey = createFilePathKey(normalizedFilePath)
    const existingTrack = this.findTrackByFilePathKeyStatement.get(filePathKey) as
      | TrackRow
      | undefined
    if (existingTrack && existingTrack.id !== track.id) {
      this.deleteDuplicateMembersForTrackStatement.run(existingTrack.id)
      this.deleteDuplicateGroupsForTrackStatement.run(existingTrack.id)
      this.deleteMetadataCandidatesForTrackStatement.run(existingTrack.id)
    }

    this.insertTrackStatement.run(
      track.id,
      track.folderId,
      normalizedFilePath,
      filePathKey,
      track.fileName,
      track.title,
      track.artist,
      track.album,
      track.duration,
      track.fileSize,
      track.modifiedAt,
      track.firstSeenAt ?? Date.now(),
      track.coverHash,
      track.codec ?? null,
      track.sampleRate ?? null,
      track.bitDepth ?? null,
      track.bitrate ?? null,
      JSON.stringify(track.metadataSources ?? createUnknownMetadataSources())
    )
    this.refreshMetadataCandidatesForTrack(track)
  }

  private refreshMetadataCandidatesForTrack(track: LocalLibraryTrack): void {
    this.deleteMetadataCandidatesForTrackStatement.run(track.id)

    for (const candidate of createMetadataCandidatesForTrack(track)) {
      this.insertMetadataCandidateStatement.run(
        candidate.id,
        candidate.trackId,
        candidate.field,
        candidate.source,
        candidate.currentValue,
        candidate.suggestedValue,
        candidate.confidence,
        candidate.state,
        candidate.createdAt,
        candidate.updatedAt
      )
    }
  }
}

export { createFolderId, createTrackId } from './repository.helpers'

function mapScanJobRow(row: ScanJobRow): LocalLibraryScanJob {
  return {
    id: row.id,
    kind: row.kind,
    phase: row.phase,
    message: row.message,
    folderCount: row.folder_count,
    scannedFolders: row.scanned_folders,
    scannedFiles: row.scanned_files,
    discoveredTracks: row.discovered_tracks,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at
  }
}

function normalizeTrackPageQuery(query: LocalLibraryTrackQuery): LocalLibraryTrackQuery {
  if (!query.recentlyAddedOnly || typeof query.recentlyAddedSince === 'number') {
    return query
  }

  return {
    ...query,
    recentlyAddedSince: Date.now() - LOCAL_LIBRARY_INBOX_WINDOW_MS
  }
}

function createUnknownMetadataSources(): NonNullable<LocalLibraryTrack['metadataSources']> {
  return {
    title: 'unknown',
    artist: 'unknown',
    album: 'unknown',
    duration: 'unknown',
    cover: 'unknown',
    technical: 'unknown'
  }
}

function createMetadataCandidatesForTrack(
  track: LocalLibraryTrack
): LocalLibraryMetadataCandidate[] {
  const sources = track.metadataSources ?? createUnknownMetadataSources()
  const now = Date.now()
  const candidates: LocalLibraryMetadataCandidate[] = []

  for (const field of METADATA_CANDIDATE_FIELDS) {
    const source = sources[field]
    if (source === 'embedded') {
      continue
    }

    const currentValue = resolveMetadataCandidateCurrentValue(track, field)
    if (field !== 'title' && field !== 'artist' && field !== 'album' && currentValue) {
      continue
    }

    candidates.push({
      id: `local-metadata:${track.id}:${field}`,
      trackId: track.id,
      field,
      source,
      currentValue,
      suggestedValue: null,
      confidence: resolveMetadataCandidateConfidence(field, source),
      state: 'pending',
      createdAt: now,
      updatedAt: now
    })
  }

  return candidates
}

const METADATA_CANDIDATE_FIELDS: LocalLibraryMetadataCandidateField[] = [
  'title',
  'artist',
  'album',
  'duration',
  'cover',
  'technical'
]

function resolveMetadataCandidateCurrentValue(
  track: LocalLibraryTrack,
  field: LocalLibraryMetadataCandidateField
): string | null {
  switch (field) {
    case 'title':
      return track.title || null
    case 'artist':
      return track.artist || null
    case 'album':
      return track.album || null
    case 'duration':
      return track.duration > 0 ? String(track.duration) : null
    case 'cover':
      return track.coverHash
    case 'technical':
      return (
        [
          track.codec ?? null,
          track.sampleRate ? `${track.sampleRate} Hz` : null,
          track.bitDepth ? `${track.bitDepth} bit` : null,
          track.bitrate ? `${track.bitrate} bps` : null
        ]
          .filter((value): value is string => Boolean(value))
          .join(' / ') || null
      )
  }
}

function resolveMetadataCandidateConfidence(
  field: LocalLibraryMetadataCandidateField,
  source: NonNullable<LocalLibraryTrack['metadataSources']>[LocalLibraryMetadataCandidateField]
): number {
  if (field === 'cover' || field === 'technical' || field === 'duration') {
    return source === 'unknown' ? 0.3 : 0.5
  }

  if (source === 'filename') {
    return 0.58
  }

  if (source === 'folder') {
    return 0.52
  }

  return 0.25
}
