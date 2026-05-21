export interface PluginLogger {
  trace(message: string, meta?: Record<string, unknown>): void
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export interface PluginStorage {
  get<T = unknown>(key: string): Promise<T | undefined> | T | undefined
  set<T = unknown>(key: string, value: T): Promise<void> | void
  remove(key: string): Promise<void> | void
  clear(): Promise<void> | void
}

export interface RestrictedHttpRequestOptions {
  headers?: Record<string, string>
  timeoutMs?: number
}

export interface RestrictedHttpClient {
  get<T = unknown>(
    url: string,
    params?: Record<string, unknown>,
    options?: RestrictedHttpRequestOptions
  ): Promise<T>
  post<T = unknown>(url: string, body?: unknown, options?: RestrictedHttpRequestOptions): Promise<T>
}

export interface PluginSettingOption {
  value: string
  label: string
}

export interface PluginSettingDefinition {
  key: string
  type: 'boolean' | 'text' | 'select'
  label: string
  default?: unknown
  options?: PluginSettingOption[]
}

export interface PluginThemeResource {
  id: string
  label: string
  renderStyle: string
  description?: string
  cssVariables?: Record<string, string>
  cssFile?: string
  cssText?: string
}

export interface PluginCallErrorPayload {
  code: string
  message: string
  retryable?: boolean
  userMessage?: string
  details?: Record<string, unknown>
}

export type PluginCallErrorInstance = Error & {
  readonly code: string
  readonly retryable: boolean
  readonly userMessage?: string
  readonly details?: Record<string, unknown>

  toJSON(): PluginCallErrorPayload
}

export interface PluginCallErrorConstructor {
  new (payload: PluginCallErrorPayload): PluginCallErrorInstance
  new (
    codeOrPayload: string | PluginCallErrorPayload,
    message?: string,
    options?: Omit<PluginCallErrorPayload, 'code' | 'message'>
  ): PluginCallErrorInstance
}

export type CreatePluginCallError = (
  codeOrPayload: string | PluginCallErrorPayload,
  message?: string,
  options?: Omit<PluginCallErrorPayload, 'code' | 'message'>
) => PluginCallErrorInstance

export interface CreateSongUrlResultOptions {
  mediaId?: string | number
  expiresAt?: number
  level?: StandardSongUrlLevel
  bitrate?: number
}

export type CreateSongUrlResult = (
  url: string | null | undefined,
  options?: CreateSongUrlResultOptions
) => StandardSongUrl

export interface PluginPermissionDeclaration {
  network?: {
    domains: string[]
  }
  storage?: boolean
  secrets?: boolean
}

export type PluginCategory = 'api' | 'extension' | 'theme'

export interface PluginSdkRuntime {
  PluginCallError: PluginCallErrorConstructor
  createPluginCallError: CreatePluginCallError
  createSongUrlResult: CreateSongUrlResult
}

export interface PluginContext {
  pluginId: string
  platformId: string
  settings: Readonly<Record<string, unknown>>
  storage: PluginStorage
  secrets: PluginStorage
  http: RestrictedHttpClient
  logger: PluginLogger
  sdk: PluginSdkRuntime
}

export interface PluginArtist {
  id: string | number
  name: string
}

export interface PluginAlbum {
  id: string | number
  name: string
  picUrl: string
}

export interface PluginSong {
  id: string | number
  name: string
  artists: PluginArtist[]
  album: PluginAlbum
  duration: number
  mvid: string | number
  platform: string
  originalId: string | number
  extra?: Record<string, unknown>
  url?: string
  mediaId?: string | number
  retryCount?: number
  unavailable?: boolean
  errorMessage?: string | null
}

export interface SearchResult {
  list: PluginSong[]
  total: number
}

export interface LyricResult {
  lrc: string
  tlyric: string
  romalrc: string
}

export interface PlaylistDetail {
  id: string | number
  name: string
  coverImgUrl: string
  description?: string
  trackCount?: number
  tracks: PluginSong[]
}

export interface StandardPlaylistSummary {
  id: string | number
  name: string
  coverImgUrl?: string
  description?: string
  trackCount?: number
  subscribed?: boolean
  creator?: StandardAccountProfile
  extra?: Record<string, unknown>
}

export interface StandardPageInfo {
  limit: number
  offset: number
  total?: number
  hasMore: boolean
}

export interface StandardSongPage {
  list: PluginSong[]
  page: StandardPageInfo
}

export interface StandardPlaylistPage {
  list: StandardPlaylistSummary[]
  page: StandardPageInfo
}

export interface SongUrlOptions {
  level?: StandardSongUrlQuality
  br?: number
  mediaId?: string
}

export type StandardSongUrlQuality = 'standard' | 'higher' | 'exhigh' | 'lossless' | 'hires'

export type StandardSongUrlLevel = StandardSongUrlQuality | 'unknown'

export interface StandardSongUrl {
  url: string | null
  mediaId?: string | number
  expiresAt?: number
  level?: StandardSongUrlLevel
  bitrate?: number
}

export interface SearchInput {
  keyword: string
  limit: number
  page: number
}

export interface SongUrlInput {
  id: string | number
  options?: SongUrlOptions | string
}

export interface SongDetailInput {
  id: string | number
}

export interface LyricInput {
  id: string | number
}

export interface PlaylistDetailInput {
  id: string | number
}

export interface AccountProfileInput {
  userId?: string | number
}

export interface LibraryPageInput {
  userId?: string | number
  limit?: number
  offset?: number
}

export interface PlaylistTracksInput {
  id: string | number
  limit?: number
  offset?: number
}

export type StandardLoginMode = 'qr' | 'browser' | 'form'

export interface StandardAccountProfile {
  id: string | number
  nickname: string
  avatarUrl?: string
  homepageUrl?: string
  extra?: Record<string, unknown>
}

export interface StandardAuthState {
  platform: string
  status: 'anonymous' | 'pending' | 'authenticated' | 'expired' | 'error'
  account?: StandardAccountProfile
  expiresAt?: number
  message?: string
}

export interface StandardLoginField {
  key: string
  label: string
  type: 'text' | 'password' | 'otp'
  required?: boolean
}

export interface StandardLoginChallenge {
  challengeId: string
  type: StandardLoginMode | 'none'
  title?: string
  statusText?: string
  qrImageUrl?: string
  authorizeUrl?: string
  expiresAt?: number
  pollIntervalMs?: number
  canRefresh?: boolean
  cancelable?: boolean
  helpUrl?: string
  fields?: StandardLoginField[]
}

export type StandardAuthSessionCredentialType = 'cookie' | 'token' | 'opaque'

export interface StandardAuthSessionCredential {
  type: StandardAuthSessionCredentialType
  value: string
}

export interface StandardImportedAuthSession {
  credential: StandardAuthSessionCredential
  account?: StandardAccountProfile
  expiresAt?: number
  extra?: Record<string, unknown>
}

export type PluginPlayerHookName =
  | 'beforePlay'
  | 'afterPlay'
  | 'beforeResolveUrl'
  | 'onUrlExpired'
  | 'onPlayError'
  | 'afterTrackChanged'
  | 'beforeSongUrlRefresh'
  | 'afterSongUrlRefresh'
  | 'playbackError'

export interface PluginPlayerHookContext {
  platformId: string
  song?: PluginSong
  reason?: string
  error?: PluginCallErrorPayload
  extra?: Record<string, unknown>
}

export interface PluginPlayerHookResult {
  allow?: boolean
  handled?: boolean
  message?: string
  song?: PluginSong
  replacementUrl?: StandardSongUrl
  extra?: Record<string, unknown>
}

export type PluginPlayerHook = (
  context: PluginPlayerHookContext
) => Promise<PluginPlayerHookResult | void> | PluginPlayerHookResult | void

export interface PluginPlayerHookContribution {
  type: 'playerHook'
  hook: PluginPlayerHookName
  description?: string
}

export interface PluginSettingsContribution {
  type: 'settings'
  settings: PluginSettingDefinition[]
}

export interface PluginAuthContribution {
  type: 'auth'
  preferredMode?: StandardLoginMode
  modes: StandardLoginMode[]
}

export interface PluginCommandContribution {
  type: 'command'
  command: string
  title: string
  description?: string
}

export interface PluginMenuContribution {
  type: 'menu'
  command: string
  title?: string
  location?: string
}

export interface PluginPanelContribution {
  type: 'panel'
  panelId: string
  title: string
  schema?: Record<string, unknown>
}

export type PluginContribution =
  | PluginSettingsContribution
  | PluginAuthContribution
  | PluginCommandContribution
  | PluginMenuContribution
  | PluginPanelContribution
  | PluginPlayerHookContribution

export interface PluginAuthCapability {
  login?: boolean
  logout?: boolean
  refresh?: boolean
  profile?: boolean
  importSession?: boolean
  preferredMode?: StandardLoginMode
  modes?: StandardLoginMode[]
}

export interface PluginAccountCapability {
  profile?: boolean
}

export interface PluginLibraryCapability {
  likedSongs?: boolean
  playlists?: boolean
  playlistTracks?: boolean
}

export interface PluginCapabilityMap {
  music?: {
    search?: boolean
    songUrl?: boolean
    songDetail?: boolean
    lyric?: boolean
    playlistDetail?: boolean
    urlRefresh?: boolean
  }
  auth?: PluginAuthCapability
  account?: PluginAccountCapability
  library?: PluginLibraryCapability
  commands?: boolean
  ui?: boolean
  player?: boolean
  storage?: boolean
  network?: {
    domains: string[]
  }
  secrets?: boolean
}

export type PluginMethodName =
  | 'search'
  | 'getSongUrl'
  | 'getSongDetail'
  | 'getLyric'
  | 'getPlaylistDetail'
  | 'account.getProfile'
  | 'library.getLikedSongs'
  | 'library.getPlaylists'
  | 'library.getPlaylistTracks'
  | 'auth.getState'
  | 'auth.startLogin'
  | 'auth.pollLogin'
  | 'auth.submitLogin'
  | 'auth.cancelLogin'
  | 'auth.importSession'
  | 'auth.refresh'
  | 'auth.logout'

export interface MusicPluginCapabilities {
  search: boolean
  songUrl: boolean
  songDetail: boolean
  lyric: boolean
  playlistDetail: boolean
  needsHydration: boolean
  supportsLyricFetch: boolean
  supportsUrlRefreshOnFailure: boolean
  auth?: PluginAuthCapability
  account?: PluginAccountCapability
  library?: PluginLibraryCapability
}

export interface PluginManifest {
  manifestVersion: number
  id: string
  name: string
  version: string
  description?: string
  author?: string
  category?: PluginCategory
  platformId: string
  source: 'core' | 'builtin' | 'external'
  runtime: 'local' | 'external-host'
  capabilities: MusicPluginCapabilities
  capabilitiesV2?: PluginCapabilityMap
  requiresServices?: string[]
  permissions?: PluginPermissionDeclaration
  contributions?: {
    settings?: PluginSettingDefinition[]
    themeResources?: PluginThemeResource[]
  }
  contributionsV2?: PluginContribution[]
}

export interface MusicPluginInstance {
  search?(input: SearchInput): Promise<SearchResult>
  getSongUrl?(input: SongUrlInput): Promise<string | null | StandardSongUrl>
  getSongDetail?(input: SongDetailInput): Promise<PluginSong | null>
  getLyric?(input: LyricInput): Promise<LyricResult>
  getPlaylistDetail?(input: PlaylistDetailInput): Promise<PlaylistDetail | null>
  [method: `account.${string}`]: ((input?: unknown) => Promise<unknown> | unknown) | undefined
  [method: `library.${string}`]: ((input?: unknown) => Promise<unknown> | unknown) | undefined
  [method: `auth.${string}`]: ((input?: unknown) => Promise<unknown> | unknown) | undefined
  dispose?(): Promise<void> | void
}

export interface MusicPluginDefinition {
  manifest: PluginManifest
  create(ctx: PluginContext): Promise<MusicPluginInstance> | MusicPluginInstance
}
