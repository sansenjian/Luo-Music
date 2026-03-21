import { isCanceledRequestError } from '../http/cancelError'
import { AppError, ErrorCode } from './types'

export type ErrorContext = Record<string, unknown>

type ErrorLike = {
  code?: unknown
  message?: unknown
  name?: unknown
  reason?: unknown
  response?: {
    status?: unknown
    data?: unknown
  }
  stack?: unknown
}

function getErrorLike(error: unknown): ErrorLike | null {
  return error && typeof error === 'object' ? (error as ErrorLike) : null
}

function getStatus(error: unknown): number | null {
  const status = getErrorLike(error)?.response?.status
  return typeof status === 'number' ? status : null
}

function getCode(error: unknown): string | null {
  const code = getErrorLike(error)?.code
  return typeof code === 'string' ? code : null
}

export function extractErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof AppError) {
    return error.message
  }

  if (error instanceof Error && typeof error.message === 'string' && error.message.length > 0) {
    return error.message
  }

  const message = getErrorLike(error)?.message
  if (typeof message === 'string' && message.length > 0) {
    return message
  }

  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  return fallbackMessage
}

function buildErrorData(error: unknown, context?: ErrorContext): ErrorContext | undefined {
  const base: ErrorContext = { ...(context ?? {}) }

  if (error instanceof Error) {
    base.name = error.name
    base.stack = error.stack
  }

  const errorLike = getErrorLike(error)
  const code = getCode(error)
  const status = getStatus(error)
  const reason = errorLike?.reason
  if (code) {
    base.code = code
  }
  if (status !== null) {
    base.status = status
  }
  if (typeof reason === 'string' && reason.length > 0) {
    base.reason = reason
  }
  if (errorLike?.response?.data !== undefined) {
    base.responseData = errorLike.response.data
  }

  return Object.keys(base).length > 0 ? base : undefined
}

function resolveApiErrorCode(error: unknown): ErrorCode {
  if (error instanceof AppError) {
    return error.code
  }

  if (isCanceledRequestError(error)) {
    return ErrorCode.API_REQUEST_FAILED
  }

  const status = getStatus(error)
  if (status === 404) {
    return ErrorCode.PLAYLIST_NOT_FOUND
  }
  if (status === 429) {
    return ErrorCode.API_RATE_LIMIT
  }
  if (status === 502 || status === 503 || status === 504) {
    return ErrorCode.SERVICE_UNAVAILABLE
  }

  const code = getCode(error)
  if (
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ERR_TIMED_OUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return ErrorCode.API_TIMEOUT
  }

  if (
    code === 'ERR_NETWORK' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN'
  ) {
    return ErrorCode.SERVICE_UNAVAILABLE
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return ErrorCode.NETWORK_OFFLINE
  }

  return ErrorCode.API_REQUEST_FAILED
}

export function normalizeApiError(
  error: unknown,
  contextLabel?: string,
  context?: ErrorContext
): AppError {
  if (error instanceof AppError) {
    return error
  }

  const isCanceled = isCanceledRequestError(error)
  const fallbackMessage = isCanceled ? 'canceled' : 'API request failed'
  const message = extractErrorMessage(error, fallbackMessage)
  const fullMessage = contextLabel ? `${contextLabel}: ${message}` : message
  const data = buildErrorData(error, {
    ...context,
    canceled: isCanceled || undefined,
    silent: isCanceled || undefined
  })

  return new AppError(resolveApiErrorCode(error), fullMessage, true, data)
}

export function normalizeError(
  error: unknown,
  code: ErrorCode,
  fallbackMessage: string,
  context?: ErrorContext,
  recoverable: boolean = true
): AppError {
  if (error instanceof AppError) {
    return error
  }

  return new AppError(
    code,
    extractErrorMessage(error, fallbackMessage),
    recoverable,
    buildErrorData(error, context)
  )
}
