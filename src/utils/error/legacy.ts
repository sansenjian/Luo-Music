import { useToastStore } from '../../store/toastStore'

export const ErrorType = {
  NETWORK: 'network',
  API: 'api',
  PLAYER: 'player',
  VALIDATION: 'validation',
  UNKNOWN: 'unknown'
} as const

type ErrorTypeValue = (typeof ErrorType)[keyof typeof ErrorType]

type ErrorOptions = {
  type?: ErrorTypeValue
  customMessage?: string
  showToast?: boolean
  onError?: ((error: unknown) => void) | null
}

export function handleError(error: unknown, options: ErrorOptions = {}) {
  const { type = ErrorType.UNKNOWN, customMessage = '', showToast = true, onError = null } = options

  console.error(`[${type.toUpperCase()} Error]:`, error)

  const errorMessage = error instanceof Error ? error.message : ''

  const ErrorMessages: Record<ErrorTypeValue, string> = {
    [ErrorType.NETWORK]: '网络连接失败，请检查网络设置',
    [ErrorType.API]: '服务请求失败，请稍后重试',
    [ErrorType.PLAYER]: '播放出错，请尝试其他歌曲',
    [ErrorType.VALIDATION]: '输入数据无效',
    [ErrorType.UNKNOWN]: '发生未知错误'
  }

  const message = customMessage || errorMessage || ErrorMessages[type]

  if (showToast) {
    try {
      const toastStore = useToastStore()
      toastStore.error(message)
    } catch {
      console.error(`[Toast] ${message}`)
    }
  }

  if (onError) {
    onError(error)
  }

  return {
    type,
    message,
    originalError: error
  }
}

export function handleApiError(error: unknown, customMessage = '') {
  return handleError(error, {
    type: ErrorType.API,
    customMessage: customMessage || '请求失败，请稍后重试'
  })
}

export function handlePlayerError(error: unknown, customMessage = '') {
  return handleError(error, {
    type: ErrorType.PLAYER,
    customMessage: customMessage || '播放出错，请尝试其他歌曲'
  })
}

export function handleNetworkError(error: unknown) {
  return handleError(error, {
    type: ErrorType.NETWORK
  })
}

export function withErrorHandling<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  options: ErrorOptions = {}
) {
  return async function (this: unknown, ...args: Parameters<T>) {
    try {
      return await fn.apply(this, args)
    } catch (error) {
      handleError(error, options)
      return null
    }
  }
}
