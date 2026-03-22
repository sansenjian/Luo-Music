import type { ChildProcess } from 'node:child_process'
import http from 'node:http'
import type { ServiceStatus, ServiceStatusType } from '../types/service'

interface IpcMessage {
  type: 'ready' | 'error'
  port?: number
  error?: string
}

/**
 * 服务基础类 - 所有音乐平台服务的基础类
 */
export abstract class BaseService {
  protected serviceId: string
  protected port: number
  protected status: ServiceStatusType = 'pending'
  protected lastError?: string
  protected lastUpdate: number = Date.now()
  protected process: ChildProcess | null = null

  constructor(serviceId: string, port: number) {
    this.serviceId = serviceId
    this.port = port
  }

  /**
   * 启动服务
   */
  abstract start(): Promise<void>

  /**
   * 停止服务
   */
  abstract stop(): Promise<void>

  /**
   * 获取服务状态
   */
  getStatus(): ServiceStatus {
    return {
      serviceId: this.serviceId,
      enabled: this.status !== 'stopped' && this.status !== 'unavailable',
      status: this.status,
      port: this.port,
      lastError: this.lastError,
      lastUpdate: this.lastUpdate
    }
  }

  /**
   * 检查服务是否可用
   */
  isAlive(): boolean {
    return this.status === 'running' && this.process !== null
  }

  /**
   * 标记服务为运行状态（由外部启动时使用）
   */
  markAsRunning(port: number): void {
    this.port = port
    this.status = 'running'
    this.lastUpdate = Date.now()
    this.lastError = undefined
  }

  /**
   * 处理 API 请求
   */
  abstract handleRequest(endpoint: string, params: Record<string, unknown>): Promise<unknown>

  /**
   * 等待服务就绪（IPC 消息 + 端口检测双重保障）
   */
  protected async waitForReady(timeout: number = 15000): Promise<void> {
    // 使用 Promise.race 时，需要确保两个 promise 都被正确处理
    // waitForPort 的递归轮询可能产生未处理的 rejection，所以我们在 race 中捕获它
    const errors: Error[] = []

    await Promise.race([
      this.waitForIpcMessage(timeout).catch(err => {
        errors.push(err)
      }),
      this.waitForPort(timeout).catch(err => {
        errors.push(err)
      })
    ])

    // 如果两个都失败，抛出聚合错误
    if (errors.length === 2) {
      throw new Error(`Service startup failed: ${errors.map(e => e.message).join(', ')}`)
    }
  }

  /**
   * 等待 IPC 就绪消息
   */
  private waitForIpcMessage(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const processRef = this.process
      if (!processRef) {
        reject(new Error('Process not started'))
        return
      }

      const cleanup = (): void => {
        clearTimeout(timer)
        processRef.off('message', onMessage)
        processRef.off('exit', onExit)
      }

      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('IPC message timeout'))
      }, timeout)

      const onMessage = (msg: IpcMessage): void => {
        if (msg.type === 'ready') {
          cleanup()
          resolve()
        } else if (msg.type === 'error') {
          cleanup()
          reject(new Error(msg.error || 'Startup error'))
        }
      }

      const onExit = (): void => {
        cleanup()
        reject(new Error('Process exited before ready'))
      }

      processRef.on('message', onMessage)
      processRef.once('exit', onExit)
    })
  }

  /**
   * 等待端口响应
   */
  private async waitForPort(timeout: number): Promise<void> {
    const startTime = Date.now()

    const check = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        const elapsed = Date.now() - startTime
        if (elapsed > timeout) {
          reject(new Error(`Port check timeout after ${timeout}ms`))
          return
        }

        const req = http.request(
          {
            host: 'localhost',
            port: this.port,
            path: '/',
            method: 'GET',
            timeout: 2000
          },
          _res => {
            // 任何响应都表示服务已启动
            resolve()
          }
        )

        req.on('error', () => {
          setTimeout(() => check().then(resolve, reject), 500)
        })

        req.on('timeout', () => {
          req.destroy()
          setTimeout(() => check().then(resolve, reject), 500)
        })

        req.end()
      })
    }

    // 延迟 1 秒开始检测
    await new Promise(r => setTimeout(r, 1000))
    await check()
  }
}
