import { spawn } from 'node:child_process'
import logger from '../logger'
import { getScriptPath } from '../utils/paths'
import { BaseService } from './baseService'
import { requestJson } from './requestClient'

type RequestMethod = 'GET' | 'POST'

interface NodeApiServiceOptions {
  scriptName: string
  loggerScope: string
  requestServiceName: string
  unavailableMessage: string
  methodResolver: (endpoint: string) => RequestMethod
}

abstract class NodeApiService extends BaseService {
  private readonly scriptName: string
  private readonly loggerScope: string
  private readonly requestServiceName: string
  private readonly unavailableMessage: string
  private readonly methodResolver: (endpoint: string) => RequestMethod

  protected constructor(serviceId: string, port: number, options: NodeApiServiceOptions) {
    super(serviceId, port)
    this.scriptName = options.scriptName
    this.loggerScope = options.loggerScope
    this.requestServiceName = options.requestServiceName
    this.unavailableMessage = options.unavailableMessage
    this.methodResolver = options.methodResolver
  }

  async start(): Promise<void> {
    this.status = 'starting'
    this.lastUpdate = Date.now()
    logger.info(`[${this.loggerScope}] Starting on port ${this.port}`)

    try {
      const scriptPath = getScriptPath(this.scriptName)
      logger.info(`[${this.loggerScope}] Script path: ${scriptPath}`)

      this.process = spawn('node', [scriptPath], {
        env: {
          ...process.env,
          PORT: String(this.port),
          NODE_OPTIONS: ''
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
      })

      this.process.stdout?.on('data', data => {
        logger.info(`[${this.loggerScope}] ${data.toString().trim()}`)
      })

      this.process.stderr?.on('data', data => {
        logger.error(`[${this.loggerScope}] ${data.toString().trim()}`)
      })

      this.process.on('error', err => {
        logger.error(`[${this.loggerScope}] Process error:`, err)
        this.status = 'error'
        this.lastError = err.message
        this.lastUpdate = Date.now()
      })

      this.process.on('exit', code => {
        logger.info(`[${this.loggerScope}] Process exited with code ${code}`)
        if (this.status === 'running') {
          this.status = 'stopped'
        }
        this.lastUpdate = Date.now()
      })

      await this.waitForReady(15000)

      this.status = 'running'
      this.lastUpdate = Date.now()
      logger.info(`[${this.loggerScope}] Started successfully`)
    } catch (error) {
      this.status = 'error'
      this.lastError = error instanceof Error ? error.message : 'Unknown error'
      this.lastUpdate = Date.now()
      logger.error(`[${this.loggerScope}] Failed to start:`, error)
      throw error
    }
  }

  async stop(): Promise<void> {
    this.status = 'stopping'
    this.lastUpdate = Date.now()
    logger.info(`[${this.loggerScope}] Stopping...`)

    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }

    this.status = 'stopped'
    this.lastUpdate = Date.now()
    logger.info(`[${this.loggerScope}] Stopped`)
  }

  async handleRequest(endpoint: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.isAlive()) {
      throw new Error(this.unavailableMessage)
    }

    const method = this.methodResolver(endpoint)
    return requestJson(this.port, endpoint, params, {
      method,
      serviceName: this.requestServiceName
    })
  }
}

/**
 * QQ 音乐服务实现
 */
export class QQService extends NodeApiService {
  private static readonly POST_ENDPOINTS = new Set([
    'batchGetSongLists',
    'batchGetSongInfo',
    'checkQQLoginQr',
    'user/checkQQLoginQr'
  ])

  constructor(port: number) {
    super('qq', port, {
      scriptName: 'qq-api-server.cjs',
      loggerScope: 'QQService',
      requestServiceName: 'QQ',
      unavailableMessage: 'QQ Service is not available',
      methodResolver: endpoint => (QQService.POST_ENDPOINTS.has(endpoint) ? 'POST' : 'GET')
    })
  }
}

/**
 * 网易云音乐服务实现
 */
export class NeteaseService extends NodeApiService {
  constructor(port: number) {
    super('netease', port, {
      scriptName: 'netease-api-server.cjs',
      loggerScope: 'NeteaseService',
      requestServiceName: 'Netease',
      unavailableMessage: 'Netease Service is not available',
      methodResolver: () => 'POST'
    })
  }
}
