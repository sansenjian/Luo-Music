export enum ErrorCode {
  // 网络层 (1000-1999)
  NETWORK_OFFLINE = 1001,
  API_TIMEOUT = 1002,
  API_RATE_LIMIT = 1003,
  
  // 业务层 (2000-2999)
  SONG_NO_COPYRIGHT = 2001,      // 无版权
  SONG_URL_EXPIRED = 2002,       // URL过期
  PLAYLIST_NOT_FOUND = 2003,
  
  // 播放器层 (3000-3999)
  AUDIO_DECODE_FAILED = 3001,    // 解码失败
  AUDIO_CONTEXT_SUSPENDED = 3002,// 浏览器策略阻止播放
  
  // 系统层 (4000-4999)
  MAIN_PROCESS_CRASH = 4001,
  STORAGE_FULL = 4002,
  UNKNOWN_ERROR = 9999
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public recoverable: boolean = true,  // 是否可自动恢复
    public data?: unknown                 // 附加数据（如歌曲ID）
  ) {
    super(message)
    this.name = 'AppError'
  }

  // 友好提示（给用户看）
  getUserMessage(): string {
    const map: Record<ErrorCode, string> = {
      [ErrorCode.SONG_NO_COPYRIGHT]: '该歌曲暂无版权，已自动跳过',
      [ErrorCode.NETWORK_OFFLINE]: '网络断开，正在重试...',
      [ErrorCode.AUDIO_DECODE_FAILED]: '音频解码失败，尝试切换音质',
      [ErrorCode.API_TIMEOUT]: '请求超时，请检查网络',
      [ErrorCode.API_RATE_LIMIT]: '请求过于频繁，请稍后再试',
      [ErrorCode.PLAYLIST_NOT_FOUND]: '找不到该歌单',
      [ErrorCode.SONG_URL_EXPIRED]: '歌曲链接已过期，正在刷新',
      [ErrorCode.AUDIO_CONTEXT_SUSPENDED]: '点击页面任意处开始播放',
      [ErrorCode.MAIN_PROCESS_CRASH]: '主进程异常',
      [ErrorCode.STORAGE_FULL]: '存储空间已满',
      [ErrorCode.UNKNOWN_ERROR]: '未知错误'
    }
    return map[this.code] || this.message || '操作失败，请重试'
  }
}

// 快捷创建方法
export const Errors = {
  noCopyright: (songId: string | number) =>
    new AppError(ErrorCode.SONG_NO_COPYRIGHT, 'No copyright', true, { songId }),
  
  network: () =>
    new AppError(ErrorCode.NETWORK_OFFLINE, 'Network error', true),
    
  fatal: (msg: string) =>
    new AppError(ErrorCode.MAIN_PROCESS_CRASH, msg, false),
    
  unknown: (msg: string, data?: unknown) =>
    new AppError(ErrorCode.UNKNOWN_ERROR, msg, true, data)
}
