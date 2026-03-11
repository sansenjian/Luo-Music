import { ChildProcess } from 'child_process'
import net from 'net'
import http from 'http'
import logger from './logger'
import { createRequire } from 'module'

const require = createRequire(__filename)
// 使用 require 导入 electron，避免 ESM 打包后命名导出问题
const { app } = require('electron')

/**
 * 服务配置接口
 */
export interface ServiceConfig {
  /** 服务名称 */
  name: string
  /** 服务端口 */
  port: number
  /** 是否启用 */
  enabled: boolean
  /** 服务类型 */
  type: 'netease' | 'qq'
  /** 健康检查路径 */
  healthCheckPath?: string
}

/**
 * 服务状态接口
 */
export interface ServiceStatus {
  /** 服务名称 */
  name: string
  /** 是否启用 */
  enabled: boolean
  /** 是否运行中 */
  running: boolean
  /** 服务端口 */
  port: number
  /** 进程 ID（如果是子进程） */
  pid?: number
  /** 启动时间 */
  startTime?: Date
  /** 错误信息 */
  error?: string
  /** 服务类型 */
  type: 'netease' | 'qq'
}

/**
 * 服务状态枚举
 */
export type ServiceStatusType = 'pending' | 'running' | 'stopped' | 'error'

/**
 * 内部服务状态（包含更多细节）
 */
interface InternalServiceStatus extends ServiceStatus {
  status: ServiceStatusType
  lastCheck?: number
}

/**
 * 网易云 API 模块接口
 */
interface NeteaseApiModule {
  serveNcmApi: (options: { port: number; host: string }) => Promise<void>
}

/**
 * 默认服务配置
 */
const DEFAULT_SERVICES: ServiceConfig[] = [
  {
    name: 'netease',
    port: 14532,
    enabled: true,
    type: 'netease',
    healthCheckPath: '/'
  },
  {
    name: 'qq',
    port: 3200,
    enabled: true,
    type: 'qq',
    healthCheckPath: '/'
  }
]

/**
 * 服务管理器
 * 统一管理多个音乐平台 API 服务
 */
export class ServerManager {
  /** 服务配置映射 */
  private configMap: Map<string, ServiceConfig> = new Map()

  /** 启动队列 */
  private spawnQueue: string[] = []

  /** 运行中的服务进程（用于子进程模式，当前未使用） */
  private activeProcs: Map<string, ChildProcess> = new Map()

  /** 服务状态 */
  private serviceStatus: Map<string, InternalServiceStatus> = new Map()

  /** 是否已初始化 */
  private initialized = false

  /** 网易云 API 模块引用 */
  private neteaseApiModule: NeteaseApiModule | null = null

  /** QQ 音乐 API 模块引用 */
  private qqMusicApiModule: unknown = null

  constructor() {
    // 注册默认服务
    for (const config of DEFAULT_SERVICES) {
      this.registerService(config.name, config)
    }
  }

  /**
   * 注册服务配置
   */
  registerService(name: string, config: ServiceConfig): void {
    this.configMap.set(name, config)
    
    // 初始化服务状态
    this.serviceStatus.set(name, {
      name,
      enabled: config.enabled,
      running: false,
      port: config.port,
      type: config.type,
      status: 'pending'
    })

    logger.info(`[ServerManager] Service registered: ${name}`, config)
  }

  /**
   * 启动指定服务
   */
  async startService(name: string): Promise<boolean> {
    const config = this.configMap.get(name)
    if (!config) {
      logger.error(`[ServerManager] Service not found: ${name}`)
      return false
    }

    if (!config.enabled) {
      logger.info(`[ServerManager] Service ${name} is disabled, skipping`)
      return false
    }

    const status = this.serviceStatus.get(name)
    if (status?.running) {
      logger.info(`[ServerManager] Service ${name} already running`)
      return true
    }

    try {
      // 检查端口是否可用
      const portAvailable = await this.checkPortAvailable(config.port)
      
      if (!portAvailable) {
        // 端口被占用，检查服务是否健康
        const isHealthy = await this.checkServiceHealth(name)
        if (isHealthy) {
          logger.info(`[ServerManager] Service ${name} already running on port ${config.port}, skipping start`)
          this.updateServiceStatus(name, {
            running: true,
            status: 'running',
            startTime: new Date(),
            error: undefined
          })
          return true
        }

        // 端口被占用但不健康，可能是外部进程占用
        logger.warn(`[ServerManager] Port ${config.port} is occupied by external process, attempting to kill...`)
        await this.killPortProcess(config.port)
      }

      // 根据服务类型启动
      let success = false
      if (config.type === 'netease') {
        success = await this.startNeteaseService(config)
      } else if (config.type === 'qq') {
        success = await this.startQQMusicService(config)
      }

      if (success) {
        this.updateServiceStatus(name, { 
          running: true, 
          status: 'running',
          startTime: new Date(),
          error: undefined 
        })
        logger.info(`[ServerManager] Service ${name} started successfully on port ${config.port}`)
      }

      return success
    } catch (error: any) {
      logger.error(`[ServerManager] Failed to start service ${name}:`, error.message)
      this.updateServiceStatus(name, { 
        running: false, 
        status: 'error',
        error: error.message 
      })
      return false
    }
  }

  /**
   * 停止指定服务
   * 注意：当前实现中服务在主进程中运行，无法单独停止
   */
  async stopService(name: string): Promise<boolean> {
    const status = this.serviceStatus.get(name)
    if (!status?.running) {
      logger.info(`[ServerManager] Service ${name} not running`)
      return true
    }

    // 当前实现中，服务在主进程中运行，无法单独停止
    // 只能更新状态
    logger.warn(`[ServerManager] Cannot stop service ${name} running in main process`)
    this.updateServiceStatus(name, { 
      running: false, 
      status: 'stopped',
      pid: undefined,
      startTime: undefined 
    })

    return true
  }

  /**
   * 重启指定服务
   */
  async restartService(name: string): Promise<boolean> {
    logger.info(`[ServerManager] Restarting service ${name}...`)
    
    await this.stopService(name)
    
    // 等待端口释放
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    return this.startService(name)
  }

  /**
   * 获取服务状态
   */
  getServiceStatus(name: string): ServiceStatus {
    const status = this.serviceStatus.get(name)
    if (!status) {
      return {
        name,
        enabled: false,
        running: false,
        port: 0,
        type: 'netease'
      }
    }

    // 返回公共接口部分
    return {
      name: status.name,
      enabled: status.enabled,
      running: status.running,
      port: status.port,
      pid: status.pid,
      startTime: status.startTime,
      error: status.error,
      type: status.type
    }
  }

  /**
   * 获取所有服务状态
   */
  getAllServiceStatus(): Record<string, ServiceStatus> {
    const result: Record<string, ServiceStatus> = {}
    
    for (const [name, status] of this.serviceStatus) {
      result[name] = this.getServiceStatus(name)
    }

    return result
  }

  /**
   * 检查服务健康状态
   */
  async checkServiceHealth(name: string): Promise<boolean> {
    const config = this.configMap.get(name)
    if (!config) {
      return false
    }

    return this.checkPortHealth(config.port, config.healthCheckPath || '/')
  }

  /**
   * 启动所有服务
   */
  async startAllServices(): Promise<void> {
    logger.info('[ServerManager] Starting all services...')
    
    const enabledServices: string[] = []
    for (const [name, config] of this.configMap) {
      if (config.enabled) {
        enabledServices.push(name)
      }
    }

    // 并行启动所有服务
    const startPromises = enabledServices.map(async (name) => {
      try {
        // 检查服务是否已在运行（例如由 launcher 启动）
        const status = this.serviceStatus.get(name)
        if (status?.running) {
          logger.info(`[ServerManager] Service ${name} already running, skipping`)
          return { name, result: true, skipped: true }
        }
        
        const result = await this.startService(name)
        return { name, result, skipped: false }
      } catch (error: any) {
        logger.error(`[ServerManager] Failed to start ${name}:`, error.message)
        return { name, result: false, error: error.message, skipped: false }
      }
    })

    const results = await Promise.all(startPromises)
    
    const summary: Record<string, string> = {}
    for (const { name, result, skipped } of results) {
      summary[name] = skipped ? 'skipped (already running)' : (result ? 'started' : 'failed')
    }

    this.initialized = true
    logger.info('[ServerManager] All services started:', summary)
  }

  /**
   * 停止所有服务
   */
  async stopAllServices(): Promise<void> {
    logger.info('[ServerManager] Stopping all services...')

    for (const [name] of this.serviceStatus) {
      await this.stopService(name)
    }

    this.initialized = false
    logger.info('[ServerManager] All services stopped')
  }

  /**
   * 更新服务配置
   */
  updateServiceConfig(name: string, config: Partial<ServiceConfig>): boolean {
    const existingConfig = this.configMap.get(name)
    if (!existingConfig) {
      return false
    }

    const newConfig = { ...existingConfig, ...config }
    this.configMap.set(name, newConfig)

    // 更新状态中的启用标志
    if (config.enabled !== undefined) {
      this.updateServiceStatus(name, { enabled: config.enabled })
    }

    logger.info(`[ServerManager] Service ${name} config updated:`, newConfig)
    return true
  }

  /**
   * 获取服务配置
   */
  getServiceConfig(name: string): ServiceConfig | undefined {
    return this.configMap.get(name)
  }

  /**
   * 标记服务为运行中（用于 launcher 启动的服务）
   */
  markServiceAsRunning(name: string, port: number): void {
    const status = this.serviceStatus.get(name)
    logger.info(`[ServerManager] markServiceAsRunning called for ${name}, current status:`, status ? { running: status.running, status: status.status } : 'undefined')
    if (status) {
      this.serviceStatus.set(name, {
        ...status,
        running: true,
        status: 'running' as ServiceStatusType,
        port,
        startTime: new Date(),
        error: undefined
      })
      logger.info(`[ServerManager] Service ${name} marked as running on port ${port}`)
      logger.info(`[ServerManager] Service ${name} new status:`, this.serviceStatus.get(name))
    } else {
      logger.warn(`[ServerManager] Service ${name} not found, cannot mark as running`)
    }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }

  // ==================== 私有方法 ====================

  /**
   * 更新服务状态
   */
  private updateServiceStatus(name: string, updates: Partial<InternalServiceStatus>): void {
    const current = this.serviceStatus.get(name)
    if (current) {
      this.serviceStatus.set(name, { ...current, ...updates, lastCheck: Date.now() })
    }
  }

  /**
   * 检查端口是否可用
   */
  private checkPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer()
      
      server.once('error', () => resolve(false))
      server.once('listening', () => {
        server.close()
        resolve(true)
      })
      
      server.listen(port)
    })
  }

  /**
   * 检查端口健康状态
   */
  private checkPortHealth(port: number, path: string, timeout: number = 3000): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.request({
        host: 'localhost',
        port,
        path,
        method: 'GET',
        timeout
      }, (res) => {
        // 严格判断状态码 2xx
        const isSuccess = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300
        resolve(isSuccess)
      })

      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })

      req.end()
    })
  }

  /**
   * 终止占用端口的进程
   */
  private async killPortProcess(port: number): Promise<void> {
    try {
      const { execSync } = await import('child_process')
      
      // 跨平台处理：Windows 使用 netstat + taskkill，macOS/Linux 使用 lsof
      if (process.platform === 'win32') {
        const output = execSync(`netstat -ano | findstr :${port}`).toString()
        const lines = output.split('\n').filter((line: string) => line.includes('LISTENING'))

        for (const line of lines) {
          const parts = line.trim().split(/\s+/)
          const pid = parts[parts.length - 1]
          
          if (pid && pid !== process.pid.toString()) {
            logger.info(`[ServerManager] Killing process ${pid} on port ${port}`)
            execSync(`taskkill /F /PID ${pid}`)
            logger.info(`[ServerManager] Process ${pid} killed`)
          }
        }
      } else {
        // macOS/Linux: 使用 lsof 查找并终止进程
        const output = execSync(`lsof -ti :${port}`).toString()
        const pids = output.trim().split('\n').filter(Boolean)
        
        for (const pid of pids) {
          if (pid && pid !== process.pid.toString()) {
            logger.info(`[ServerManager] Killing process ${pid} on port ${port}`)
            execSync(`kill -9 ${pid}`)
            logger.info(`[ServerManager] Process ${pid} killed`)
          }
        }
      }

      // 等待端口释放
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`[ServerManager] Failed to kill process on port ${port}:`, errorMessage)
      throw new Error(`Port ${port} is occupied and cannot be freed`)
    }
  }

  /**
   * 启动网易云 API 服务
   */
  private async startNeteaseService(config: ServiceConfig): Promise<boolean> {
    try {
      // 动态加载网易云 API 模块
      if (!this.neteaseApiModule) {
        // 使用 createRequire 正确加载 CommonJS 模块
        const require = createRequire(import.meta.url)
        const neteaseModule = require('@neteasecloudmusicapienhanced/api')
        
        logger.info('[ServerManager] Netease module keys:', Object.keys(neteaseModule).slice(0, 10).join(', '))
        logger.info('[ServerManager] serveNcmApi type:', typeof neteaseModule.serveNcmApi)
        
        // 验证 serveNcmApi 是否存在且为函数
        if (typeof neteaseModule.serveNcmApi !== 'function') {
          throw new Error(`serveNcmApi is not a function, got: ${typeof neteaseModule.serveNcmApi}`)
        }
        
        // 直接保存函数引用，不包装对象
        const serveNcmApi = neteaseModule.serveNcmApi
        this.neteaseApiModule = { serveNcmApi }
        logger.info('[ServerManager] Netease API module loaded, serveNcmApi type:', typeof this.neteaseApiModule.serveNcmApi)
      }

      logger.info('[ServerManager] Calling serveNcmApi with port:', config.port)
      await this.neteaseApiModule.serveNcmApi({
        port: config.port,
        host: 'localhost'
      })

      logger.info(`[ServerManager] Netease API started on port ${config.port}`)
      return true
    } catch (error: any) {
      logger.error(`[ServerManager] Failed to start Netease API:`, error.message)
      throw error
    }
  }

  /**
   * 启动 QQ 音乐 API 服务
   */
  private async startQQMusicService(config: ServiceConfig): Promise<boolean> {
    try {
      // 切换工作目录到 userData，防止 API 写入只读目录报错
      const userDataPath = app.getPath('userData')
      const originalCwd = process.cwd()

      try {
        const fs = await import('fs')
        if (!fs.existsSync(userDataPath)) {
          fs.mkdirSync(userDataPath, { recursive: true })
        }
        process.chdir(userDataPath)
        logger.info(`[ServerManager] Changed CWD to ${userDataPath} for QQ Music API`)
      } catch (err) {
        logger.error('[ServerManager] Failed to change CWD:', err)
      }

      // 设置环境变量
      process.env.PORT = String(config.port)
      process.env.HOST = 'localhost'

      // 动态加载 QQ 音乐 API 模块
      if (!this.qqMusicApiModule) {
        this.qqMusicApiModule = await import('@sansenjian/qq-music-api')
      }

      logger.info(`[ServerManager] QQ Music API started on port ${config.port}`)

      // 恢复原始工作目录
      try {
        process.chdir(originalCwd)
        logger.info(`[ServerManager] Restored CWD to ${originalCwd}`)
      } catch (err) {
        logger.error('[ServerManager] Failed to restore CWD:', err)
      }

      return true
    } catch (error: any) {
      logger.error(`[ServerManager] Failed to start QQ Music API:`, error.message)
      throw error
    }
  }
}

// 导出单例实例
export const serverManager = new ServerManager()