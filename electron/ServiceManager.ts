import { ChildProcess, spawn } from 'node:child_process'
import http from 'node:http'
import type {
  ServiceConfig,
  ServiceStatus,
  ServiceStatusType,
  AvailableService
} from './types/service'
import logger from './logger'
import { getScriptPath } from './utils/paths'

/** IPC 消息类型定义 */
interface IpcMessage {
  type: 'ready' | 'error'
  port?: number
  error?: string
}

type JsonHttpError = Error & {
  code?: string
  response?: {
    status?: number
    data?: unknown
  }
}

type ParsedErrorPayload = {
  message: string
  data: unknown
  code?: string
}

function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          searchParams.append(key, String(item))
        }
      }
      continue
    }

    searchParams.append(key, String(value))
  }

  const query = searchParams.toString()
  return query.length > 0 ? `?${query}` : ''
}

function parseErrorPayload(raw: string): ParsedErrorPayload {
  if (!raw) {
    return {
      message: 'Empty response',
      data: undefined
    }
  }

  try {
    const parsed = JSON.parse(raw) as {
      error?: {
        message?: unknown
        name?: unknown
        code?: unknown
        status?: unknown
        config?: {
          url?: unknown
          method?: unknown
        }
      }
      message?: unknown
    }

    const upstreamError = parsed?.error
    const message =
      typeof upstreamError?.message === 'string'
        ? upstreamError.message
        : typeof parsed?.message === 'string'
          ? parsed.message
          : raw
    const code = typeof upstreamError?.code === 'string' ? upstreamError.code : undefined

    if (upstreamError && typeof upstreamError === 'object') {
      return {
        message,
        code,
        data: {
          error: {
            message,
            name: upstreamError.name,
            code,
            status: upstreamError.status,
            url: upstreamError.config?.url,
            method: upstreamError.config?.method
          }
        }
      }
    }
  } catch {
    // Keep the original text response for plain-text errors.
  }

  return {
    message: raw,
    data: raw
  }
}

async function requestJson(
  port: number,
  endpoint: string,
  params: Record<string, unknown>,
  options: {
    method: 'GET' | 'POST'
    serviceName: string
  }
): Promise<unknown> {
  const http = await import('node:http')
  const query = options.method === 'GET' ? buildQueryString(params) : ''
  const path = `/${endpoint}${query}`
  const body = options.method === 'POST' ? JSON.stringify(params) : null

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: 'localhost',
        port,
        path,
        method: options.method,
        headers:
          body === null
            ? undefined
            : {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
              }
      },
      res => {
        let data = ''
        res.on('data', chunk => (data += chunk))
        res.on('end', () => {
          const status = typeof res.statusCode === 'number' ? res.statusCode : 500
          const contentTypeHeader = res.headers['content-type']
          const contentType = Array.isArray(contentTypeHeader)
            ? contentTypeHeader.join(', ')
            : String(contentTypeHeader ?? '')

          if (status < 200 || status >= 300) {
            const payload = parseErrorPayload(data)
            const error = new Error(
              `${options.serviceName} service request failed with status ${status}: ${payload.message}`
            ) as JsonHttpError
            if (payload.code) {
              error.code = payload.code
            }
            error.response = {
              status,
              data: payload.data
            }
            reject(error)
            return
          }

          if (data.length === 0) {
            resolve({})
            return
          }

          try {
            resolve(JSON.parse(data))
          } catch (parseError) {
            const error = new Error(
              `${options.serviceName} service returned invalid JSON (${contentType || 'unknown content type'}): ${
                parseError instanceof Error ? parseError.message : String(parseError)
              }`
            ) as JsonHttpError
            error.response = {
              status,
              data
            }
            reject(error)
          }
        })
      }
    )

    req.on('error', reject)

    if (body !== null) {
      req.write(body)
    }

    req.end()
  })
}

/**
 * 服务基础类 - 所有音乐平台服务的基类
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
   * 等待服务就绪（IPC 消息 + 端口检查双重保障）
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

/**
 * QQ 音乐服务实现
 */
export class QQService extends BaseService {
  private static readonly POST_ENDPOINTS = new Set([
    'batchGetSongLists',
    'batchGetSongInfo',
    'checkQQLoginQr',
    'user/checkQQLoginQr'
  ])

  constructor(port: number) {
    super('qq', port)
  }

  async start(): Promise<void> {
    this.status = 'starting'
    this.lastUpdate = Date.now()
    logger.info(`[QQService] Starting on port ${this.port}`)

    try {
      // 使用统一的路径工具获取脚本路径（兼容开发和打包环境）
      const scriptPath = getScriptPath('qq-api-server.cjs')
      logger.info(`[QQService] Script path: ${scriptPath}`)

      // 启动 QQ 音乐 API 子进程，启用 IPC 通道
      this.process = spawn('node', [scriptPath], {
        env: {
          ...process.env,
          PORT: String(this.port),
          NODE_OPTIONS: '' // 清除继承的调试选项，避免 inspector 端口警告
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'] // 启用 IPC 通道
      })

      this.process.stdout?.on('data', data => {
        logger.info(`[QQService] ${data.toString().trim()}`)
      })

      this.process.stderr?.on('data', data => {
        logger.error(`[QQService] ${data.toString().trim()}`)
      })

      this.process.on('error', err => {
        logger.error(`[QQService] Process error:`, err)
        this.status = 'error'
        this.lastError = err.message
        this.lastUpdate = Date.now()
      })

      this.process.on('exit', code => {
        logger.info(`[QQService] Process exited with code ${code}`)
        if (this.status === 'running') {
          this.status = 'stopped'
        }
        this.lastUpdate = Date.now()
      })

      // 等待服务真正就绪（IPC 消息 + 端口检查）
      await this.waitForReady(15000)

      this.status = 'running'
      this.lastUpdate = Date.now()
      logger.info(`[QQService] Started successfully`)
    } catch (error) {
      this.status = 'error'
      this.lastError = error instanceof Error ? error.message : 'Unknown error'
      this.lastUpdate = Date.now()
      logger.error(`[QQService] Failed to start:`, error)
      throw error
    }
  }

  async stop(): Promise<void> {
    this.status = 'stopping'
    this.lastUpdate = Date.now()
    logger.info(`[QQService] Stopping...`)

    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }

    this.status = 'stopped'
    this.lastUpdate = Date.now()
    logger.info(`[QQService] Stopped`)
  }

  async handleRequest(endpoint: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.isAlive()) {
      throw new Error('QQ Service is not available')
    }

    // 通过 HTTP 请求转发到 QQ 音乐 API 服务
    const method = QQService.POST_ENDPOINTS.has(endpoint) ? 'POST' : 'GET'
    return requestJson(this.port, endpoint, params, {
      method,
      serviceName: 'QQ'
    })
  }
}

/**
 * 网易云音乐服务实现
 */
export class NeteaseService extends BaseService {
  constructor(port: number) {
    super('netease', port)
  }

  async start(): Promise<void> {
    this.status = 'starting'
    this.lastUpdate = Date.now()
    logger.info(`[NeteaseService] Starting on port ${this.port}`)

    try {
      // 使用统一的路径工具获取脚本路径（兼容开发和打包环境）
      const scriptPath = getScriptPath('netease-api-server.cjs')
      logger.info(`[NeteaseService] Script path: ${scriptPath}`)

      // 启动网易云音乐 API 子进程，启用 IPC 通道
      this.process = spawn('node', [scriptPath], {
        env: {
          ...process.env,
          PORT: String(this.port),
          NODE_OPTIONS: '' // 清除继承的调试选项，避免 inspector 端口警告
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'] // 启用 IPC 通道
      })

      this.process.stdout?.on('data', data => {
        logger.info(`[NeteaseService] ${data.toString().trim()}`)
      })

      this.process.stderr?.on('data', data => {
        logger.error(`[NeteaseService] ${data.toString().trim()}`)
      })

      this.process.on('error', err => {
        logger.error(`[NeteaseService] Process error:`, err)
        this.status = 'error'
        this.lastError = err.message
        this.lastUpdate = Date.now()
      })

      this.process.on('exit', code => {
        logger.info(`[NeteaseService] Process exited with code ${code}`)
        if (this.status === 'running') {
          this.status = 'stopped'
        }
        this.lastUpdate = Date.now()
      })

      // 等待服务真正就绪（IPC 消息 + 端口检查）
      await this.waitForReady(15000)

      this.status = 'running'
      this.lastUpdate = Date.now()
      logger.info(`[NeteaseService] Started successfully`)
    } catch (error) {
      this.status = 'error'
      this.lastError = error instanceof Error ? error.message : 'Unknown error'
      this.lastUpdate = Date.now()
      logger.error(`[NeteaseService] Failed to start:`, error)
      throw error
    }
  }

  async stop(): Promise<void> {
    this.status = 'stopping'
    this.lastUpdate = Date.now()
    logger.info(`[NeteaseService] Stopping...`)

    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }

    this.status = 'stopped'
    this.lastUpdate = Date.now()
    logger.info(`[NeteaseService] Stopped`)
  }

  async handleRequest(endpoint: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.isAlive()) {
      throw new Error('Netease Service is not available')
    }

    return requestJson(this.port, endpoint, params, {
      method: 'POST',
      serviceName: 'Netease'
    })
  }
}

/**
 * 服务管理器 - 统一管理所有音乐平台服务
 */
export class ServiceManager {
  private services: Map<string, BaseService> = new Map()
  private config: ServiceConfig | null = null
  private startTasks: Map<string, Promise<void>> = new Map()

  private ensureBuiltInServices(config: ServiceConfig): void {
    if (!this.services.has('qq')) {
      this.registerService('qq', new QQService(config.services.qq?.port || 3200))
    }

    if (!this.services.has('netease')) {
      this.registerService('netease', new NeteaseService(config.services.netease?.port || 14532))
    }
  }

  private isServiceEnabled(serviceId: string): boolean {
    return this.config?.services[serviceId]?.enabled ?? true
  }

  /**
   * 初始化服务管理器
   */
  async initialize(config: ServiceConfig): Promise<void> {
    this.config = config
    logger.info('[ServiceManager] Initializing...')

    this.ensureBuiltInServices(config)

    // 根据配置启动服务
    const startupTasks = Object.entries(config.services)
      .filter(([, serviceConfig]) => serviceConfig.enabled)
      .map(async ([serviceId]) => {
        try {
          await this.startService(serviceId)
        } catch (error) {
          logger.error(`[ServiceManager] Failed to start ${serviceId}:`, error)
        }
      })

    await Promise.all(startupTasks)

    logger.info('[ServiceManager] Initialization complete')
  }

  /**
   * 注册服务
   */
  private registerService(serviceId: string, service: BaseService): void {
    this.services.set(serviceId, service)
    logger.info(`[ServiceManager] Registered service: ${serviceId}`)
  }

  /**
   * 启动服务
   */
  async startService(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId)
    if (!service) {
      throw new Error(`Service ${serviceId} not found`)
    }

    const pendingStart = this.startTasks.get(serviceId)
    if (pendingStart) {
      return pendingStart
    }

    const { status } = service.getStatus()
    if (status === 'starting' || status === 'running') {
      logger.warn(
        `[ServiceManager] Skip duplicate start for ${serviceId}, current status: ${status}`
      )
      return
    }

    const startTask = service.start().finally(() => {
      this.startTasks.delete(serviceId)
    })

    this.startTasks.set(serviceId, startTask)
    await startTask
  }

  /**
   * 停止服务
   */
  async stopService(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId)
    if (!service) {
      throw new Error(`Service ${serviceId} not found`)
    }
    await service.stop()
  }

  /**
   * 重启服务
   */
  async restartService(serviceId: string): Promise<void> {
    await this.stopService(serviceId)
    await this.startService(serviceId)
  }

  /**
   * 获取服务状态
   */
  getServiceStatus(serviceId: string): ServiceStatus | null {
    const service = this.services.get(serviceId)
    return service ? service.getStatus() : null
  }

  /**
   * 获取所有可用服务
   */
  getAvailableServices(): Record<string, AvailableService | null> {
    const result: Record<string, AvailableService | null> = {}

    for (const [serviceId, service] of this.services) {
      const status = service.getStatus()
      if (status.enabled && service.isAlive()) {
        result[serviceId] = {
          status: 'ready',
          port: status.port,
          lastError: status.lastError
        }
      } else if (status.enabled && !service.isAlive()) {
        result[serviceId] = {
          status: 'error',
          port: status.port,
          lastError: status.lastError
        }
      } else {
        result[serviceId] = null
      }
    }

    return result
  }

  /**
   * 处理 API 请求（统一网关）
   */
  async handleRequest(
    service: string,
    endpoint: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const serviceInstance = this.services.get(service)
    if (!serviceInstance) {
      throw new Error(`Service ${service} not found`)
    }
    if (!this.isServiceEnabled(service)) {
      throw new Error(`Service ${service} is disabled`)
    }
    if (!serviceInstance.isAlive()) {
      await this.startService(service)
    }
    if (!serviceInstance.isAlive()) {
      throw new Error(`Service ${service} is not available`)
    }
    return serviceInstance.handleRequest(endpoint, params)
  }

  /**
   * 停止所有服务
   */
  async stopAll(): Promise<void> {
    logger.info('[ServiceManager] Stopping all services...')
    for (const [serviceId, service] of this.services) {
      try {
        await service.stop()
      } catch (error) {
        logger.error(`[ServiceManager] Failed to stop ${serviceId}:`, error)
      }
    }
    logger.info('[ServiceManager] All services stopped')
  }

  /**
   * 停止所有服务（别名）
   */
  async stopAllServices(): Promise<void> {
    return this.stopAll()
  }

  /**
   * 启动所有已注册的服务
   */
  async startAllServices(): Promise<void> {
    logger.info('[ServiceManager] Starting all services...')
    for (const [serviceId] of this.services) {
      try {
        await this.startService(serviceId)
      } catch (error) {
        logger.error(`[ServiceManager] Failed to start ${serviceId}:`, error)
      }
    }
    logger.info('[ServiceManager] All services started')
  }

  /**
   * 获取所有服务状态
   */
  getAllServiceStatus(): Record<string, ServiceStatus> {
    const result: Record<string, ServiceStatus> = {}
    for (const [serviceId, service] of this.services) {
      result[serviceId] = service.getStatus()
    }
    return result
  }

  /**
   * 标记服务为运行状态（由外部启动时使用）
   */
  markServiceAsRunning(serviceId: string, port: number): void {
    const service = this.services.get(serviceId)
    if (service) {
      service.markAsRunning(port)
      logger.info(`[ServiceManager] Marked ${serviceId} as running on port ${port}`)
    } else {
      logger.warn(`[ServiceManager] Service ${serviceId} not found for marking as running`)
    }
  }

  /**
   * 检查服务健康状态
   */
  async checkServiceHealth(
    serviceId: string
  ): Promise<{ healthy: boolean; status: ServiceStatus | null }> {
    const service = this.services.get(serviceId)
    if (!service) {
      return { healthy: false, status: null }
    }

    const status = service.getStatus()
    const healthy = service.isAlive()

    return { healthy, status }
  }

  /**
   * 更新服务配置
   */
  updateServiceConfig(serviceId: string, config: unknown): void {
    logger.info(`[ServiceManager] Updating config for ${serviceId}:`, config)
    // 当前实现中，服务配置在初始化时确定
    // 此方法预留用于动态配置更新
    // 可以在未来扩展以支持热重载配置
  }
}

// 导出单例
export const serviceManager = new ServiceManager()
