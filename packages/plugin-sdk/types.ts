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

export interface PluginPermissionDeclaration {
  network?: {
    domains: string[]
  }
  storage?: boolean
  secrets?: boolean
}

export type PluginCategory = 'api' | 'extension' | 'theme'

export interface PluginContext {
  pluginId: string
  platformId: string
  settings: Readonly<Record<string, unknown>>
  storage: PluginStorage
  secrets: PluginStorage
  http: RestrictedHttpClient
  logger: PluginLogger
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

export interface SongUrlOptions {
  level?: 'standard' | 'higher' | 'exhigh' | 'lossless' | 'hires'
  br?: number
  mediaId?: string
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

export interface PluginAuthCapability {
  login?: boolean
  logout?: boolean
  refresh?: boolean
  profile?: boolean
  preferredMode?: StandardLoginMode
  modes?: StandardLoginMode[]
}

export type PluginMethodName =
  | 'search'
  | 'getSongUrl'
  | 'getSongDetail'
  | 'getLyric'
  | 'getPlaylistDetail'
  | 'auth.getState'
  | 'auth.startLogin'
  | 'auth.pollLogin'
  | 'auth.submitLogin'
  | 'auth.cancelLogin'
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
  requiresServices?: string[]
  permissions?: PluginPermissionDeclaration
  contributions?: {
    settings?: PluginSettingDefinition[]
    themeResources?: PluginThemeResource[]
  }
}

export interface MusicPluginInstance {
  search?(input: SearchInput): Promise<SearchResult>
  getSongUrl?(input: SongUrlInput): Promise<string | null>
  getSongDetail?(input: SongDetailInput): Promise<PluginSong | null>
  getLyric?(input: LyricInput): Promise<LyricResult>
  getPlaylistDetail?(input: PlaylistDetailInput): Promise<PlaylistDetail | null>
  [method: `auth.${string}`]: ((input?: unknown) => Promise<unknown> | unknown) | undefined
  dispose?(): Promise<void> | void
}

export interface MusicPluginDefinition {
  manifest: PluginManifest
  create(ctx: PluginContext): Promise<MusicPluginInstance> | MusicPluginInstance
}
