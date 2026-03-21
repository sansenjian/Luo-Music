type CancelLikeError = {
  code?: unknown
  name?: unknown
  message?: unknown
  reason?: unknown
  __CANCEL__?: unknown
}

export type RequestCancelReason = 'manual' | 'superseded'

export type RequestCanceledError = Error & {
  code: 'ERR_CANCELED'
  name: 'CanceledError'
  reason: RequestCancelReason
  __CANCEL__: true
}

const DEFAULT_CANCEL_MESSAGE = 'canceled'

export function createCanceledRequestError(
  reason: RequestCancelReason = 'manual',
  message: string = DEFAULT_CANCEL_MESSAGE
): RequestCanceledError {
  const error = new Error(message) as RequestCanceledError
  error.name = 'CanceledError'
  error.code = 'ERR_CANCELED'
  error.reason = reason
  error.__CANCEL__ = true
  return error
}

export function getCanceledRequestReason(error: unknown): RequestCancelReason | null {
  if (!isCanceledRequestError(error)) {
    return null
  }

  const reason = (error as CancelLikeError).reason
  return reason === 'superseded' ? 'superseded' : 'manual'
}

/**
 * Detect axios/AbortController cancellation errors across adapters and layers.
 */
export function isCanceledRequestError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const maybeError = error as CancelLikeError
  return (
    maybeError.code === 'ERR_CANCELED' ||
    maybeError.name === 'CanceledError' ||
    maybeError.__CANCEL__ === true ||
    maybeError.message === 'canceled'
  )
}
