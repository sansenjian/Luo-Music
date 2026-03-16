/** Error codes for categorizing errors */
export enum ErrorCode {
  NETWORK_OFFLINE = 'NETWORK_OFFLINE',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  PLAYER_ERROR = 'PLAYER_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/** Error type for display purposes */
export type ErrorType = 'warning' | 'error' | 'info'

/** Application error interface */
export interface AppError {
  code: ErrorCode
  message: string
  type: ErrorType
  context?: Record<string, unknown>
  timestamp: number
  getUserMessage: () => string
}

/** Error handler function type */
export type ErrorHandler = (error: AppError) => void | Promise<void>

/**
 * Custom AppError class
 */
export class AppErrorImpl extends Error implements AppError {
  code: ErrorCode
  type: ErrorType
  context?: Record<string, unknown>
  timestamp: number

  constructor(
    code: ErrorCode,
    message: string,
    type: ErrorType = 'error',
    context?: Record<string, unknown>
  ) {
    super(message)
    this.code = code
    this.type = type
    this.context = context
    this.timestamp = Date.now()
    this.name = 'AppError'
  }

  getUserMessage(): string {
    return this.message
  }
}

/**
 * Predefined error templates
 */
export const Errors = {
  NetworkOffline: (message = '网络连接已断开') =>
    new AppErrorImpl(ErrorCode.NETWORK_OFFLINE, message, 'warning'),
  NetworkTimeout: (message = '网络请求超时') =>
    new AppErrorImpl(ErrorCode.NETWORK_TIMEOUT, message, 'warning'),
  NetworkError: (message = '网络请求失败') =>
    new AppErrorImpl(ErrorCode.NETWORK_ERROR, message, 'error'),
  ApiError: (message = 'API 请求失败', context?: Record<string, unknown>) =>
    new AppErrorImpl(ErrorCode.API_ERROR, message, 'error', context),
  PlayerError: (message = '播放器错误', context?: Record<string, unknown>) =>
    new AppErrorImpl(ErrorCode.PLAYER_ERROR, message, 'error', context),
  ParseError: (message = '数据解析错误') =>
    new AppErrorImpl(ErrorCode.PARSE_ERROR, message, 'error'),
  UnknownError: (message = '未知错误') =>
    new AppErrorImpl(ErrorCode.UNKNOWN_ERROR, message, 'error')
}

/**
 * Error Service - Centralized error handling
 */
export class ErrorService {
  private handlers: Map<ErrorCode, Set<ErrorHandler>> = new Map()
  private anyHandlers: Set<ErrorHandler> = new Set()

  /** Expose error utilities */
  readonly Errors = Errors
  readonly AppError = AppErrorImpl
  readonly ErrorCode = ErrorCode

  /**
   * Emit an error to all registered handlers
   */
  emit(error: AppError | Error | unknown): void {
    let appError: AppError

    if (error instanceof AppErrorImpl) {
      appError = error
    } else if (error instanceof Error) {
      appError = new AppErrorImpl(ErrorCode.UNKNOWN_ERROR, error.message, 'error', {
        originalError: error
      })
    } else {
      appError = new AppErrorImpl(ErrorCode.UNKNOWN_ERROR, String(error), 'error', {
        originalError: error
      })
    }

    // Call specific handlers
    const codeHandlers = this.handlers.get(appError.code)
    if (codeHandlers) {
      codeHandlers.forEach(handler => {
        try {
          handler(appError)
        } catch (e) {
          console.error('[ErrorService] Handler error:', e)
        }
      })
    }

    // Call 'any' handlers
    this.anyHandlers.forEach(handler => {
      try {
        handler(appError)
      } catch (e) {
        console.error('[ErrorService] Handler error:', e)
      }
    })
  }

  /**
   * Register a handler for a specific error code
   */
  on(code: ErrorCode, handler: ErrorHandler): void {
    if (!this.handlers.has(code)) {
      this.handlers.set(code, new Set())
    }
    this.handlers.get(code)!.add(handler)
  }

  /**
   * Register a handler for all errors
   */
  onAny(handler: ErrorHandler): void {
    this.anyHandlers.add(handler)
  }

  /**
   * Remove a specific handler
   */
  off(code: ErrorCode, handler: ErrorHandler): void {
    this.handlers.get(code)?.delete(handler)
  }

  /**
   * Remove an 'any' handler
   */
  offAny(handler: ErrorHandler): void {
    this.anyHandlers.delete(handler)
  }

  /**
   * Clear all handlers
   */
  clearAllListeners(): void {
    this.handlers.clear()
    this.anyHandlers.clear()
  }

  /**
   * Handle API errors with standard processing
   */
  handleApiError(error: unknown, context?: Record<string, unknown>): AppError {
    let appError: AppError

    if (error instanceof AppErrorImpl) {
      appError = error
    } else if (error instanceof Error) {
      appError = Errors.ApiError(error.message, { ...context, originalError: error })
    } else {
      appError = Errors.ApiError(String(error), context)
    }

    this.emit(appError)
    return appError
  }

  /**
   * Handle player errors
   */
  handlePlayerError(error: unknown, context?: Record<string, unknown>): AppError {
    let appError: AppError

    if (error instanceof AppErrorImpl) {
      appError = error
    } else if (error instanceof Error) {
      appError = Errors.PlayerError(error.message, { ...context, originalError: error })
    } else {
      appError = Errors.PlayerError(String(error), context)
    }

    this.emit(appError)
    return appError
  }

  /**
   * Handle network errors
   */
  handleNetworkError(error: unknown, _context?: Record<string, unknown>): AppError {
    let appError: AppError

    if (error instanceof AppErrorImpl) {
      appError = error
    } else if (error instanceof Error) {
      const message = error.message.toLowerCase()
      if (message.includes('timeout')) {
        appError = Errors.NetworkTimeout()
      } else if (message.includes('offline') || message.includes('network')) {
        appError = Errors.NetworkOffline()
      } else {
        appError = Errors.NetworkError()
      }
    } else {
      appError = Errors.NetworkError()
    }

    this.emit(appError)
    return appError
  }

  /**
   * Generic error handler
   */
  handleError(error: unknown, context?: Record<string, unknown>): AppError {
    let appError: AppError

    if (error instanceof AppErrorImpl) {
      appError = error
    } else if (error instanceof Error) {
      appError = new AppErrorImpl(ErrorCode.UNKNOWN_ERROR, error.message, 'error', {
        ...context,
        originalError: error
      })
    } else {
      appError = new AppErrorImpl(ErrorCode.UNKNOWN_ERROR, String(error), 'error', context)
    }

    this.emit(appError)
    return appError
  }

  /**
   * Wrap an async function with error handling
   */
  withErrorHandling<T>(
    fn: () => Promise<T>,
    errorHandler?: (error: AppError) => void
  ): Promise<T | undefined> {
    return fn().catch(error => {
      const appError = this.handleError(error)
      errorHandler?.(appError)
      return undefined
    })
  }
}
