import { ipcMain } from 'electron'

import { serviceManager } from './ServiceManager'
import { windowManager } from './WindowManager'
import {
  clearGatewayCache,
  executeWithRetry,
  getCache,
  getGatewayCacheStatus,
  setCache
} from './ipc/utils/gatewayCache.ts'
import logger from './logger'
import type { ServiceStatusResponse } from './ipc/types'
import type { ServiceConfig } from './types/service'

type TaskFactory<T> = () => Promise<T>

class Limiter {
  private readonly maxDegreeOfParallelism: number
  private runningPromises = 0
  private readonly outstandingPromises: Array<() => void> = []

  constructor(maxDegreeOfParallelism: number) {
    this.maxDegreeOfParallelism = Math.max(1, Math.floor(maxDegreeOfParallelism))
  }

  queue<T>(factory: TaskFactory<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const execute = () => {
        this.runningPromises += 1
        let result: Promise<T>

        try {
          result = factory()
        } catch (error) {
          this.runningPromises -= 1
          this.consume()
          reject(error)
          return
        }

        result
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.runningPromises -= 1
            this.consume()
          })
      }

      this.outstandingPromises.push(execute)
      this.consume()
    })
  }

  private consume(): void {
    while (
      this.outstandingPromises.length > 0 &&
      this.runningPromises < this.maxDegreeOfParallelism
    ) {
      const run = this.outstandingPromises.shift()
      if (run) {
        run()
      }
    }
  }
}

function createLimiter(concurrency: number): Limiter {
  return new Limiter(concurrency)
}

function toServiceStatusResponse(
  status: ReturnType<typeof serviceManager.getServiceStatus>
): ServiceStatusResponse {
  if (status === null) {
    return { status: 'stopped' }
  }

  if (status.status === 'running') {
    return { status: 'running', port: status.port }
  }

  if (
    status.status === 'pending' ||
    status.status === 'starting' ||
    status.status === 'stopping' ||
    status.status === 'stopped' ||
    status.status === 'unavailable'
  ) {
    return { status: 'stopped', port: status.port }
  }

  return { status: 'error', port: status.port }
}

export const LIMIT_CONCURRENCY = createLimiter(3)

export function createLimitedExecutor<T extends (...args: unknown[]) => Promise<unknown>>(
  limit: number
): (fn: T, ...args: Parameters<T>) => Promise<ReturnType<T>> {
  const limiter = createLimiter(limit)
  return (fn, ...args) => limiter.queue(() => fn(...args)) as Promise<ReturnType<T>>
}

export const PLAYER_CHANNELS = [
  'music-playing-control',
  'music-song-control',
  'music-playmode-control',
  'music-volume-up',
  'music-volume-down',
  'music-process-control',
  'music-compact-mode-control',
  'hide-player'
]

export function initPlayerIPC() {
  PLAYER_CHANNELS.forEach(channel => {
    ipcMain.on(channel, (event, ...args) => {
      const mainWindow = windowManager.getWindow()
      if (mainWindow && event.sender.id !== mainWindow.webContents.id) {
        windowManager.send(channel, ...args)
      } else if (!mainWindow) {
        windowManager.send(channel, ...args)
      }
    })
  })
}

export function initAPIGateway() {
  ipcMain.handle(
    'api:request',
    async (
      _,
      {
        service,
        endpoint,
        params,
        noCache
      }: {
        service: string
        endpoint: string
        params: Record<string, unknown>
        noCache?: boolean
      }
    ) => {
      const context = `api:request ${service}:${endpoint}`

      if (!noCache) {
        const cachedData = getCache(service, endpoint, params)
        if (cachedData !== null) {
          return { success: true, data: cachedData, cached: true }
        }
      }

      try {
        const result = await executeWithRetry(
          () => serviceManager.handleRequest(service, endpoint, params),
          context
        )

        if (!noCache) {
          setCache(service, endpoint, params, result)
        }

        return { success: true, data: result, cached: false }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error(`[API Gateway] ${context} failed after retries:`, errorMessage)
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  ipcMain.handle('api:services', () => {
    return serviceManager.getAvailableServices()
  })

  ipcMain.handle('service:status', (_, serviceId: string) => {
    return toServiceStatusResponse(serviceManager.getServiceStatus(serviceId))
  })

  ipcMain.handle('service:start', async (_, serviceId: string) => {
    try {
      await serviceManager.startService(serviceId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcMain.handle('service:stop', async (_, serviceId: string) => {
    try {
      await serviceManager.stopService(serviceId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcMain.handle('api:cache:clear', () => {
    clearGatewayCache()
    return { success: true }
  })

  ipcMain.handle('api:cache:status', () => {
    return getGatewayCacheStatus()
  })
}

export async function initServiceManager(config: ServiceConfig): Promise<void> {
  await serviceManager.initialize(config)
}
