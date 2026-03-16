type CancelLikeError = {
  code?: unknown
  name?: unknown
  message?: unknown
  __CANCEL__?: unknown
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
