import type { ChildProcess } from 'node:child_process'
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
  startupTimeoutMs?: number
}

type ProcessListeners = {
  onStdoutData: (data: Buffer | string) => void
  onStderrData: (data: Buffer | string) => void
  onProcessError: (err: Error) => void
  onExit: (code: number | null) => void
}

abstract class NodeApiService extends BaseService {
  private readonly scriptName: string
  private readonly loggerScope: string
  private readonly requestServiceName: string
  private readonly unavailableMessage: string
  private readonly methodResolver: (endpoint: string) => RequestMethod
  private readonly startupTimeoutMs: number

  protected constructor(serviceId: string, port: number, options: NodeApiServiceOptions) {
    super(serviceId, port)
    this.scriptName = options.scriptName
    this.loggerScope = options.loggerScope
    this.requestServiceName = options.requestServiceName
    this.unavailableMessage = options.unavailableMessage
    this.methodResolver = options.methodResolver
    this.startupTimeoutMs = options.startupTimeoutMs ?? 15000
  }

  async start(): Promise<void> {
    this.status = 'starting'
    this.lastUpdate = Date.now()
    logger.info(`[${this.loggerScope}] Starting on port ${this.port}`)

    let proc: ChildProcess | null = null
    let listeners: ProcessListeners | null = null

    try {
      const scriptPath = getScriptPath(this.scriptName)
      logger.info(`[${this.loggerScope}] Script path: ${scriptPath}`)

      proc = spawn(process.execPath, [scriptPath], {
        env: {
          ...process.env,
          PORT: String(this.port),
          HOST: '127.0.0.1',
          ELECTRON_RUN_AS_NODE: '1',
          NODE_OPTIONS: ''
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
      })

      this.process = proc
      listeners = {
        onStdoutData: data => {
          logger.info(`[${this.loggerScope}] ${data.toString().trim()}`)
        },
        onStderrData: data => {
          logger.error(`[${this.loggerScope}] ${data.toString().trim()}`)
        },
        onProcessError: err => {
          logger.error(`[${this.loggerScope}] Process error:`, err)
          this.status = 'error'
          this.lastError = err.message
          this.lastUpdate = Date.now()
        },
        onExit: code => {
          logger.info(`[${this.loggerScope}] Process exited with code ${code}`)
          if (this.status === 'running') {
            this.status = 'stopped'
          }
          this.lastUpdate = Date.now()
        }
      }

      proc.stdout?.on('data', listeners.onStdoutData)
      proc.stderr?.on('data', listeners.onStderrData)
      proc.on('error', listeners.onProcessError)
      proc.on('exit', listeners.onExit)

      await this.waitForReady(this.startupTimeoutMs)

      this.status = 'running'
      this.lastUpdate = Date.now()
      logger.info(`[${this.loggerScope}] Started successfully`)
    } catch (error) {
      if (proc && listeners) {
        await this.cleanupFailedStart(proc, listeners)
      }
      this.status = 'error'
      this.lastError = error instanceof Error ? error.message : 'Unknown error'
      this.lastUpdate = Date.now()
      logger.error(`[${this.loggerScope}] Failed to start:`, error)
      throw error
    }
  }

  private removeProcessListeners(proc: ChildProcess, listeners: ProcessListeners): void {
    proc.stdout?.off('data', listeners.onStdoutData)
    proc.stderr?.off('data', listeners.onStderrData)
    proc.off('error', listeners.onProcessError)
    proc.off('exit', listeners.onExit)
  }

  private async cleanupFailedStart(proc: ChildProcess, listeners: ProcessListeners): Promise<void> {
    this.removeProcessListeners(proc, listeners)
    await this.gracefulKill(proc)
    if (this.process === proc) {
      this.process = null
    }
  }

  private static readonly FORCE_KILL_TIMEOUT = 5000

  async stop(): Promise<void> {
    this.status = 'stopping'
    this.lastUpdate = Date.now()
    logger.info(`[${this.loggerScope}] Stopping...`)

    const proc = this.process
    if (proc) {
      this.process = null
      await this.gracefulKill(proc)
    }

    this.status = 'stopped'
    this.lastUpdate = Date.now()
    logger.info(`[${this.loggerScope}] Stopped`)
  }

  private gracefulKill(proc: ChildProcess): Promise<void> {
    return new Promise(resolve => {
      if (proc.exitCode !== null || proc.signalCode !== null) {
        resolve()
        return
      }

      let settled = false
      let timer: NodeJS.Timeout | null = null

      const onExit = () => {
        finish()
      }

      const finish = () => {
        if (!settled) {
          settled = true
          if (timer) {
            clearTimeout(timer)
            timer = null
          }
          proc.off('exit', onExit)
          resolve()
        }
      }

      proc.once('exit', onExit)

      try {
        const killSent = proc.kill('SIGTERM')
        if (killSent === false) {
          finish()
          return
        }
      } catch {
        finish()
        return
      }

      timer = setTimeout(() => {
        if (!settled) {
          logger.warn(
            `[${this.loggerScope}] Process did not exit within ${NodeApiService.FORCE_KILL_TIMEOUT}ms, force killing`
          )
          try {
            proc.kill('SIGKILL')
          } catch {
            // Process may have already exited
          }
          finish()
        }
      }, NodeApiService.FORCE_KILL_TIMEOUT)
    })
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
      methodResolver: endpoint => (QQService.POST_ENDPOINTS.has(endpoint) ? 'POST' : 'GET'),
      startupTimeoutMs: 8000
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
      // The local Netease API used by Electron matches the web adapter and
      // expects query-string GET requests for endpoints like song/detail.
      methodResolver: () => 'GET',
      startupTimeoutMs: 12000
    })
  }
}
