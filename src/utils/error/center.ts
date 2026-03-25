import { AppError, ErrorCode } from './types'
import { getPlatformAccessor } from '@/services/platformAccessor'

type ErrorHandler = (error: AppError) => void | Promise<void>

class ErrorCenter {
  private handlers: Map<ErrorCode, ErrorHandler[]> = new Map()
  private globalHandlers: ErrorHandler[] = []

  // 注册特定错误处理器
  on(code: ErrorCode, handler: ErrorHandler) {
    if (!this.handlers.has(code)) {
      this.handlers.set(code, [])
    }
    this.handlers.get(code)!.push(handler)
  }

  // 注册全局处理器（兜底）
  onAny(handler: ErrorHandler) {
    this.globalHandlers.push(handler)
  }

  // 抛出错误（业务代码调用）
  emit(error: AppError | Error | unknown) {
    let appError: AppError

    if (error instanceof AppError) {
      appError = error
    } else if (error instanceof Error) {
      // 包装未知错误
      appError = new AppError(
        ErrorCode.UNKNOWN_ERROR,
        error.message,
        true, // 默认为可恢复，避免过度打扰用户
        { stack: error.stack }
      )
    } else {
      appError = new AppError(ErrorCode.UNKNOWN_ERROR, String(error), true)
    }

    // 1. 特定处理器
    const specific = this.handlers.get(appError.code) || []

    // 2. 全局处理器
    const handlers = [...specific, ...this.globalHandlers]

    // 3. 执行处理链
    handlers.forEach(h => {
      try {
        void Promise.resolve(h(appError))
      } catch (e) {
        console.error('Error handler failed:', e)
      }
    })

    // 4. 不可恢复错误上报
    if (!appError.recoverable) {
      this.reportToMain(appError)
    }
  }

  // 发送到主进程记录日志（Electron）
  private reportToMain(error: AppError) {
    const platformService = getPlatformAccessor()
    if (platformService.isElectron()) {
      void platformService.send('error-report', {
        code: error.code,
        message: error.message,
        stack: error.stack,
        data: error.data,
        timestamp: Date.now()
      })
    }
  }
}

export const errorCenter = new ErrorCenter()
