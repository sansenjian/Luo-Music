export enum ErrorCode {
  // 网络 (1xxx)
  NETWORK_OFFLINE = 1001,
  API_TIMEOUT = 1002,
  API_RATE_LIMIT = 1003,
  API_REQUEST_FAILED = 1004,
  SERVICE_UNAVAILABLE = 1005,

  // 内容 (2xxx)
  SONG_NO_COPYRIGHT = 2001,
  SONG_URL_EXPIRED = 2002,
  PLAYLIST_NOT_FOUND = 2003,
  LYRIC_NOT_FOUND = 2004,
  LYRIC_PARSE_ERROR = 2005,

  // 播放 (3xxx)
  AUDIO_DECODE_FAILED = 3001,
  AUDIO_CONTEXT_SUSPENDED = 3002,

  // 系统 (4xxx)
  MAIN_PROCESS_CRASH = 4001,
  STORAGE_FULL = 4002,
  CACHE_READ_ERROR = 4003,
  CACHE_WRITE_ERROR = 4004,
  CACHE_CORRUPTED = 4005,
  CONFIG_LOAD_FAILED = 4006,
  CONFIG_INVALID = 4007,

  // 认证 (5xxx)
  LOGIN_FAILED = 5001,
  SESSION_EXPIRED = 5002,
  TOKEN_REFRESH_FAILED = 5003,
  PERMISSION_DENIED = 5004,

  // 下载 (6xxx)
  DOWNLOAD_FAILED = 6001,
  DOWNLOAD_INTERRUPTED = 6002,

  UNKNOWN_ERROR = 9999
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public recoverable: boolean = true,
    public data?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }

  getUserMessage(): string {
    const map: Partial<Record<ErrorCode, string>> = {
      // 网络
      [ErrorCode.NETWORK_OFFLINE]: '网络断开，正在重试...',
      [ErrorCode.API_TIMEOUT]: '请求超时，请检查网络',
      [ErrorCode.API_RATE_LIMIT]: '请求过于频繁，请稍后再试',
      [ErrorCode.API_REQUEST_FAILED]: '服务请求失败，请稍后重试',
      [ErrorCode.SERVICE_UNAVAILABLE]: '服务暂时不可用，请稍后重试',
      // 内容
      [ErrorCode.SONG_NO_COPYRIGHT]: '该歌曲暂无版权，已自动跳过',
      [ErrorCode.SONG_URL_EXPIRED]: '歌曲链接已过期，正在刷新',
      [ErrorCode.PLAYLIST_NOT_FOUND]: '找不到该歌单',
      [ErrorCode.LYRIC_NOT_FOUND]: '暂无歌词',
      [ErrorCode.LYRIC_PARSE_ERROR]: '歌词解析失败',
      // 播放
      [ErrorCode.AUDIO_DECODE_FAILED]: '音频解码失败，尝试切换音质',
      [ErrorCode.AUDIO_CONTEXT_SUSPENDED]: '点击页面任意处开始播放',
      // 系统
      [ErrorCode.MAIN_PROCESS_CRASH]: '主进程异常',
      [ErrorCode.STORAGE_FULL]: '存储空间已满',
      [ErrorCode.CACHE_READ_ERROR]: '缓存读取失败',
      [ErrorCode.CACHE_WRITE_ERROR]: '缓存写入失败',
      [ErrorCode.CACHE_CORRUPTED]: '缓存数据损坏',
      [ErrorCode.CONFIG_LOAD_FAILED]: '配置加载失败',
      [ErrorCode.CONFIG_INVALID]: '配置无效',
      // 认证
      [ErrorCode.LOGIN_FAILED]: '登录失败，请重试',
      [ErrorCode.SESSION_EXPIRED]: '登录已过期，请重新登录',
      [ErrorCode.TOKEN_REFRESH_FAILED]: '令牌刷新失败',
      [ErrorCode.PERMISSION_DENIED]: '权限不足',
      // 下载
      [ErrorCode.DOWNLOAD_FAILED]: '下载失败',
      [ErrorCode.DOWNLOAD_INTERRUPTED]: '下载已中断'
    }

    return map[this.code] || this.message || '操作失败，请重试'
  }
}

export const Errors = {
  // 内容相关
  noCopyright: (songId: string | number) =>
    new AppError(ErrorCode.SONG_NO_COPYRIGHT, 'No copyright', true, { songId }),

  songUrlExpired: (songId: string | number) =>
    new AppError(ErrorCode.SONG_URL_EXPIRED, 'Song URL expired', true, { songId }),

  playlistNotFound: (playlistId: string | number) =>
    new AppError(ErrorCode.PLAYLIST_NOT_FOUND, 'Playlist not found', true, { playlistId }),

  lyricNotFound: (songId: string | number) =>
    new AppError(ErrorCode.LYRIC_NOT_FOUND, 'Lyric not found', true, { songId }),

  lyricParseError: (songId: string | number, reason?: string) =>
    new AppError(ErrorCode.LYRIC_PARSE_ERROR, reason || 'Failed to parse lyric', true, { songId }),

  // 网络相关
  network: () => new AppError(ErrorCode.NETWORK_OFFLINE, 'Network error', true),

  timeout: (endpoint?: string) =>
    new AppError(ErrorCode.API_TIMEOUT, 'Request timeout', true, endpoint ? { endpoint } : undefined),

  rateLimit: () => new AppError(ErrorCode.API_RATE_LIMIT, 'Rate limited', true),

  api: (message = 'API request failed', data?: unknown) =>
    new AppError(ErrorCode.API_REQUEST_FAILED, message, true, data),

  unavailable: (message = 'Service unavailable', data?: unknown) =>
    new AppError(ErrorCode.SERVICE_UNAVAILABLE, message, true, data),

  // 播放相关
  audioDecode: (songId?: string | number) =>
    new AppError(ErrorCode.AUDIO_DECODE_FAILED, 'Audio decode failed', true, songId ? { songId } : undefined),

  audioContextSuspended: () =>
    new AppError(ErrorCode.AUDIO_CONTEXT_SUSPENDED, 'Audio context suspended', true),

  // 系统相关
  cache: (operation: 'read' | 'write' | 'corrupted', data?: unknown) => {
    const code =
      operation === 'read'
        ? ErrorCode.CACHE_READ_ERROR
        : operation === 'write'
          ? ErrorCode.CACHE_WRITE_ERROR
          : ErrorCode.CACHE_CORRUPTED
    return new AppError(code, `Cache ${operation} error`, true, data)
  },

  config: (operation: 'load' | 'invalid', data?: unknown) =>
    new AppError(
      operation === 'load' ? ErrorCode.CONFIG_LOAD_FAILED : ErrorCode.CONFIG_INVALID,
      `Config ${operation} error`,
      true,
      data
    ),

  storageFull: () => new AppError(ErrorCode.STORAGE_FULL, 'Storage full', true),

  // 认证相关
  loginFailed: (reason?: string) =>
    new AppError(ErrorCode.LOGIN_FAILED, reason || 'Login failed', true),

  sessionExpired: () => new AppError(ErrorCode.SESSION_EXPIRED, 'Session expired', true),

  tokenRefreshFailed: () => new AppError(ErrorCode.TOKEN_REFRESH_FAILED, 'Token refresh failed', true),

  permissionDenied: (resource?: string) =>
    new AppError(ErrorCode.PERMISSION_DENIED, 'Permission denied', true, resource ? { resource } : undefined),

  // 下载相关
  downloadFailed: (songId?: string | number, reason?: string) =>
    new AppError(ErrorCode.DOWNLOAD_FAILED, reason || 'Download failed', true, songId ? { songId } : undefined),

  downloadInterrupted: (songId?: string | number) =>
    new AppError(ErrorCode.DOWNLOAD_INTERRUPTED, 'Download interrupted', true, songId ? { songId } : undefined),

  // 其他
  fatal: (message: string, data?: unknown) =>
    new AppError(ErrorCode.MAIN_PROCESS_CRASH, message, false, data),

  unknown: (message: string, data?: unknown) =>
    new AppError(ErrorCode.UNKNOWN_ERROR, message, true, data)
}
