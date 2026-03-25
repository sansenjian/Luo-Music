import {
  createCanceledRequestError,
  isCanceledRequestError,
  type RequestCancelReason
} from './cancelError'

type Awaitable<T> = PromiseLike<T> | T

function isAbortErrorLike(value: unknown): value is { aborted?: unknown; reason?: unknown } {
  return Boolean(value && typeof value === 'object')
}

function toCanceledError(reason: unknown, fallback: RequestCancelReason): Error {
  if (isCanceledRequestError(reason)) {
    return reason instanceof Error ? reason : createCanceledRequestError(fallback)
  }

  return createCanceledRequestError(fallback)
}

export interface LatestRequestTask {
  readonly signal: AbortSignal
  guard<T>(value: Awaitable<T>): Promise<T>
  commit(effect: () => void): boolean
  cancel(reason?: RequestCancelReason): void
  isCurrent(): boolean
  throwIfCanceled(): void
}

export interface LatestRequestController {
  start(): LatestRequestTask
  cancel(reason?: RequestCancelReason): void
  isPending(): boolean
}

export function createLatestRequestController(): LatestRequestController {
  let currentToken = 0
  let currentController: AbortController | null = null

  const isActive = (token: number, controller: AbortController): boolean =>
    currentToken === token && currentController === controller && !controller.signal.aborted

  const abortController = (
    controller: AbortController | null,
    reason: RequestCancelReason = 'manual'
  ): void => {
    if (!controller || controller.signal.aborted) {
      return
    }

    controller.abort(createCanceledRequestError(reason))
  }

  const cancel = (reason: RequestCancelReason = 'manual'): void => {
    abortController(currentController, reason)
    currentController = null
    currentToken += 1
  }

  const start = (): LatestRequestTask => {
    abortController(currentController, 'superseded')

    const controller = new AbortController()
    const token = currentToken + 1

    currentToken = token
    currentController = controller

    const throwIfCanceled = (): void => {
      if (isActive(token, controller)) {
        return
      }

      if (isAbortErrorLike(controller.signal) && controller.signal.aborted) {
        throw toCanceledError(controller.signal.reason, 'manual')
      }

      throw createCanceledRequestError('superseded')
    }

    const task: LatestRequestTask = {
      signal: controller.signal,
      async guard<T>(value: Awaitable<T>): Promise<T> {
        task.throwIfCanceled()

        try {
          const result = await value
          task.throwIfCanceled()
          return result
        } catch (error) {
          if (isCanceledRequestError(error)) {
            throw error
          }

          task.throwIfCanceled()
          throw error
        }
      },
      commit(effect: () => void): boolean {
        if (!task.isCurrent()) {
          return false
        }

        effect()
        return true
      },
      cancel(reason: RequestCancelReason = 'manual'): void {
        if (!task.isCurrent()) {
          return
        }

        abortController(controller, reason)
        if (currentController === controller) {
          currentController = null
          currentToken += 1
        }
      },
      isCurrent(): boolean {
        return isActive(token, controller)
      },
      throwIfCanceled
    }

    return task
  }

  return {
    start,
    cancel,
    isPending(): boolean {
      return currentController !== null && !currentController.signal.aborted
    }
  }
}
