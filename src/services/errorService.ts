import { errorCenter } from '@/utils/error/center'
import type { AppError, ErrorCode } from '@/utils/error/types'

type ErrorHandler = (error: AppError) => void | Promise<void>

export type ErrorService = {
  emit(error: AppError | Error | unknown): void
  on(code: ErrorCode, handler: ErrorHandler): void
  onAny(handler: ErrorHandler): () => void
}

export function createErrorService(): ErrorService {
  return {
    emit: error => errorCenter.emit(error),
    on: (code, handler) => errorCenter.on(code, handler),
    onAny: handler => errorCenter.onAny(handler)
  }
}
