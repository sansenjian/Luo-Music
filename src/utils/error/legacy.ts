import { errorCenter } from './center'
import { AppError, ErrorCode, Errors } from './types'
import { normalizeApiError, normalizeError, type ErrorContext } from './normalize'

type ErrorOptions = {
  code?: ErrorCode
  customMessage?: string
  recoverable?: boolean
  emit?: boolean
  context?: ErrorContext
  onError?: ((error: AppError) => void) | null
}

function shouldEmit(error: AppError): boolean {
  const data = error.data
  return !data || typeof data !== 'object' || !(data as { silent?: boolean }).silent
}

export function handleError(error: unknown, options: ErrorOptions = {}): AppError {
  const {
    code = ErrorCode.UNKNOWN_ERROR,
    customMessage = 'Unexpected error',
    recoverable = true,
    emit = true,
    context,
    onError = null
  } = options

  const appError = normalizeError(error, code, customMessage, context, recoverable)

  if (emit && shouldEmit(appError)) {
    errorCenter.emit(appError)
  }

  onError?.(appError)
  return appError
}

export function handleApiError(
  error: unknown,
  customMessage = '',
  context?: ErrorContext
): AppError {
  const appError = normalizeApiError(error, customMessage || undefined, context)

  if (shouldEmit(appError)) {
    errorCenter.emit(appError)
  }

  return appError
}

export function handlePlayerError(
  error: unknown,
  customMessage = '',
  context?: ErrorContext
): AppError {
  return handleError(error, {
    code: ErrorCode.AUDIO_DECODE_FAILED,
    customMessage: customMessage || 'Player error',
    context
  })
}

export function handleNetworkError(error: unknown, context?: ErrorContext): AppError {
  return handleError(error, {
    code: ErrorCode.NETWORK_OFFLINE,
    customMessage: 'Network error',
    context
  })
}

export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options: ErrorOptions = {}
): Promise<T | null> {
  try {
    return await fn()
  } catch (error) {
    handleError(error, options)
    return null
  }
}

export { AppError, ErrorCode, Errors }
