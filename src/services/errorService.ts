import {
  AppError,
  ErrorCode,
  Errors,
  errorCenter,
  handleApiError,
  handleError,
  handleNetworkError,
  handlePlayerError,
  withErrorHandling
} from '../utils/error'

export type ErrorService = {
  emit(error: AppError | Error | unknown): void
  on(code: ErrorCode, handler: (error: AppError) => void | Promise<void>): void
  onAny(handler: (error: AppError) => void | Promise<void>): void
  handleError: typeof handleError
  handleApiError: typeof handleApiError
  handlePlayerError: typeof handlePlayerError
  handleNetworkError: typeof handleNetworkError
  withErrorHandling: typeof withErrorHandling
  Errors: typeof Errors
  AppError: typeof AppError
  ErrorCode: typeof ErrorCode
}

export function createErrorService(): ErrorService {
  return {
    emit: error => errorCenter.emit(error),
    on: (code, handler) => errorCenter.on(code, handler),
    onAny: handler => errorCenter.onAny(handler),
    handleError,
    handleApiError,
    handlePlayerError,
    handleNetworkError,
    withErrorHandling,
    Errors,
    AppError,
    ErrorCode
  }
}
