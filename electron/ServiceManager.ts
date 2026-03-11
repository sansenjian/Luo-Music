import { ChildProcess, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import type {
  ServiceConfig,
  ServiceItemConfig,
  ServiceStatus,
  ServiceStatusType,
  AvailableService
} from './types/service'
import logger from './logger'
import { getScriptPath, PROJECT_ROOT } from './utils/paths'
import path from 'node:path'

const require = createRequire(__filename)
// 使用 require 导入 electron，避免 ESM 打包后命名导出问题
const { ipcMain } = require('electron')

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
   * 处理 API 请求
   */
  abstract handleRequest(endpoint: string, params: Record<string, unknown>): Promise<unknown>
}

/**
 * QQ 音乐服务实现
 */
export class QQService extends BaseService {
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
      
      // 启动 QQ 音乐 API 子进程
      this.process = spawn('node', [scriptPath], {
        env: { ...process.env, PORT: String(this.port) },
        stdio: ['ignore', 'pipe', 'pipe']
      })

      this.process.stdout?.on('data', (data) => {
        logger.info(`[QQService] ${data.toString().trim()}`)
      })

      this.process.stderr?.on('data', (data) => {
        logger.error(`[QQService] ${data.toString().trim()}`)
      })

      this.process.on('error', (err) => {
        logger.error(`[QQService] Process error:`, err)
        this.status = 'error'
        this.lastError = err.message
        this.lastUpdate = Date.now()
      })

      this.process.on('exit', (code) => {
        logger.info(`[QQService] Process exited with code ${code}`)
        if (this.status === 'running') {
          this.status = 'stopped'
        }
        this.lastUpdate = Date.now()
      })

      // 等待服务启动（简单延迟，实际应该检查端口）
      await new Promise(resolve => setTimeout(resolve, 2000))
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
    const http = await import('node:http')
    const url = `http://localhost:${this.port}/${endpoint}`

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(params)
      const req = http.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${e}`))
          }
        })
      })

      req.on('error', reject)
      req.write(postData)
      req.end()
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
      // 启动网易云音乐 API 子进程
      this.process = spawn('node', [
        require.resolve('../scripts/dev/netease-api-server.cjs')
      ], {
        env: { ...process.env, PORT: String(this.port) },
        stdio: ['ignore', 'pipe', 'pipe']
      })

      this.process.stdout?.on('data', (data) => {
        logger.info(`[NeteaseService] ${data.toString().trim()}`)
      })

      this.process.stderr?.on('data', (data) => {
        logger.error(`[NeteaseService] ${data.toString().trim()}`)
      })

      this.process.on('error', (err) => {
        logger.error(`[NeteaseService] Process error:`, err)
        this.status = 'error'
        this.lastError = err.message
        this.lastUpdate = Date.now()
      })

      this.process.on('exit', (code) => {
        logger.info(`[NeteaseService] Process exited with code ${code}`)
        if (this.status === 'running') {
          this.status = 'stopped'
        }
        this.lastUpdate = Date.now()
      })

      // 等待服务启动
      await new Promise(resolve => setTimeout(resolve, 2000))
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

    const http = await import('node:http')
    const url = `http://localhost:${this.port}/${endpoint}`

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(params)
      const req = http.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${e}`))
          }
        })
      })

      req.on('error', reject)
      req.write(postData)
      req.end()
    })
  }
}

/**
 * 服务管理器 - 统一管理所有音乐平台服务
 */
export class ServiceManager {
  private services: Map<string, BaseService> = new Map()
  private config: ServiceConfig | null = null

  /**
   * 初始化服务管理器
   */
  async initialize(config: ServiceConfig): Promise<void> {
    this.config = config
    logger.info('[ServiceManager] Initializing...')

    // 注册内置服务
    // 注意：QQ 音乐默认端口 3200，网易云音乐默认端口 14532
    this.registerService('qq', new QQService(config.services.qq?.port || 3200))
    this.registerService('netease', new NeteaseService(config.services.netease?.port || 14532))

    // 根据配置启动服务
    for (const [serviceId, serviceConfig] of Object.entries(config.services)) {
      if (serviceConfig.enabled) {
        try {
          await this.startService(serviceId)
        } catch (error) {
          logger.error(`[ServiceManager] Failed to start ${serviceId}:`, error)
        }
      }
    }

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
    await service.start()
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
}

// 导出单例
export const serviceManager = new ServiceManager()
