import { EventEmitter } from 'node:events'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('node:http', () => ({
  default: {
    request: requestMock
  },
  request: requestMock
}))

/**
 * ServiceManager Tests
 *
 * These tests verify the structure and behavior of the ServiceManager module.
 * Due to the complexity of mocking Node.js child_process and Electron in the test environment,
 * the core logic is tested through integration tests and type checking.
 */
describe('electron/ServiceManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('duplicate start guards', () => {
    it('should skip start when service is already running', async () => {
      const module = await import('../../electron/ServiceManager')
      const manager = new module.ServiceManager()

      class FakeService extends module.BaseService {
        async start(): Promise<void> {
          this.markAsRunning(3200)
        }

        async stop(): Promise<void> {
          this.status = 'stopped'
        }

        async handleRequest(): Promise<unknown> {
          return null
        }
      }

      const service = new FakeService('qq', 3200)
      const startSpy = vi.spyOn(service, 'start')
      ;(manager as unknown as { services: Map<string, unknown> }).services.set('qq', service)

      await manager.startService('qq')
      await manager.startService('qq')

      expect(startSpy).toHaveBeenCalledTimes(1)
    })

    it('should not restart a service marked as externally running', async () => {
      const module = await import('../../electron/ServiceManager')
      const manager = new module.ServiceManager()

      class FakeService extends module.BaseService {
        async start(): Promise<void> {
          this.markAsRunning(3200)
        }

        async stop(): Promise<void> {
          this.status = 'stopped'
        }

        async handleRequest(): Promise<unknown> {
          return null
        }
      }

      const service = new FakeService('qq', 3200)
      const startSpy = vi.spyOn(service, 'start')
      ;(manager as unknown as { services: Map<string, unknown> }).services.set('qq', service)

      manager.markServiceAsRunning('qq', 3200)
      await manager.startService('qq')

      expect(startSpy).not.toHaveBeenCalled()
    })
  })

  describe('QQService request forwarding', () => {
    it('forwards search requests as GET with query params', async () => {
      let capturedOptions: unknown
      let writtenBody: string | null = null

      requestMock.mockImplementation((options: unknown, callback: (response: EventEmitter) => void) => {
        capturedOptions = options

        const req = new EventEmitter() as EventEmitter & {
          write: (chunk: string) => void
          end: () => void
        }
        req.write = (chunk: string) => {
          writtenBody = chunk
        }
        req.end = () => {
          const res = new EventEmitter() as EventEmitter & {
            statusCode?: number
            headers: Record<string, string>
          }
          res.statusCode = 200
          res.headers = { 'content-type': 'application/json' }
          callback(res)
          res.emit('data', JSON.stringify({ response: { song: { list: [] } } }))
          res.emit('end')
        }

        return req
      })

      const module = await import('../../electron/ServiceManager')
      const service = new module.QQService(3200)
      service.markAsRunning(3200)
      ;(service as unknown as { process: unknown }).process = {}

      await expect(
        service.handleRequest('getSearchByKey', {
          key: 'jay',
          limit: 30,
          page: 1
        })
      ).resolves.toEqual({
        response: {
          song: {
            list: []
          }
        }
      })

      expect(capturedOptions).toMatchObject({
        host: 'localhost',
        port: 3200,
        method: 'GET',
        path: '/getSearchByKey?key=jay&limit=30&page=1'
      })
      expect(writtenBody).toBeNull()
    })

    it('keeps POST for QQ endpoints that require a request body', async () => {
      let capturedOptions: unknown
      let writtenBody: string | null = null

      requestMock.mockImplementation((options: unknown, callback: (response: EventEmitter) => void) => {
        capturedOptions = options

        const req = new EventEmitter() as EventEmitter & {
          write: (chunk: string) => void
          end: () => void
        }
        req.write = (chunk: string) => {
          writtenBody = chunk
        }
        req.end = () => {
          const res = new EventEmitter() as EventEmitter & {
            statusCode?: number
            headers: Record<string, string>
          }
          res.statusCode = 200
          res.headers = { 'content-type': 'application/json' }
          callback(res)
          res.emit('data', JSON.stringify({ code: 0, response: { ok: true } }))
          res.emit('end')
        }

        return req
      })

      const module = await import('../../electron/ServiceManager')
      const service = new module.QQService(3200)
      service.markAsRunning(3200)
      ;(service as unknown as { process: unknown }).process = {}

      await service.handleRequest('user/checkQQLoginQr', {
        ptqrtoken: 'token',
        qrsig: 'sig'
      })

      expect(capturedOptions).toMatchObject({
        host: 'localhost',
        port: 3200,
        method: 'POST',
        path: '/user/checkQQLoginQr'
      })
      expect(writtenBody).toBe(JSON.stringify({ ptqrtoken: 'token', qrsig: 'sig' }))
    })

    it('surfaces non-JSON error responses with their HTTP status', async () => {
      requestMock.mockImplementation((options: unknown, callback: (response: EventEmitter) => void) => {
        const req = new EventEmitter() as EventEmitter & {
          write: (chunk: string) => void
          end: () => void
        }
        req.write = () => {}
        req.end = () => {
          const res = new EventEmitter() as EventEmitter & {
            statusCode?: number
            headers: Record<string, string>
          }
          res.statusCode = 405
          res.headers = { 'content-type': 'text/plain' }
          callback(res)
          res.emit('data', 'Method Not Allowed')
          res.emit('end')
        }

        return req
      })

      const module = await import('../../electron/ServiceManager')
      const service = new module.QQService(3200)
      service.markAsRunning(3200)
      ;(service as unknown as { process: unknown }).process = {}

      await expect(service.handleRequest('getSearchByKey', { key: 'jay' })).rejects.toMatchObject({
        message: 'QQ service request failed with status 405: Method Not Allowed',
        response: {
          status: 405,
          data: 'Method Not Allowed'
        }
      })
    })
  })

  describe('initialize', () => {
    it('starts enabled services in parallel instead of serially awaiting each one', async () => {
      const module = await import('../../electron/ServiceManager')
      const manager = new module.ServiceManager()
      const resolvers = new Map<string, () => void>()

      const startServiceSpy = vi
        .spyOn(manager, 'startService')
        .mockImplementation(
          serviceId =>
            new Promise<void>(resolve => {
              resolvers.set(serviceId, resolve)
            })
        )

      const initializePromise = manager.initialize({
        services: {
          qq: { enabled: true, port: 3200 },
          netease: { enabled: true, port: 14532 }
        }
      })

      expect(startServiceSpy).toHaveBeenCalledTimes(2)
      expect(startServiceSpy).toHaveBeenNthCalledWith(1, 'qq')
      expect(startServiceSpy).toHaveBeenNthCalledWith(2, 'netease')

      resolvers.get('qq')?.()
      resolvers.get('netease')?.()
      await initializePromise
    })
  })

  describe('Module structure', () => {
    it('should export ServiceManager class', async () => {
      // Import the module to verify it can be loaded
      const module = await import('../../electron/ServiceManager')
      expect(module.ServiceManager).toBeDefined()
      expect(typeof module.ServiceManager).toBe('function')
    })

    it('should export serviceManager singleton', async () => {
      const module = await import('../../electron/ServiceManager')
      expect(module.serviceManager).toBeDefined()
      expect(module.serviceManager).toBeInstanceOf(module.ServiceManager)
    })

    it('should have correct interface methods', async () => {
      const module = await import('../../electron/ServiceManager')
      const { serviceManager } = module

      // Verify all required methods exist
      expect(typeof serviceManager.initialize).toBe('function')
      expect(typeof serviceManager.startService).toBe('function')
      expect(typeof serviceManager.stopService).toBe('function')
      expect(typeof serviceManager.restartService).toBe('function')
      expect(typeof serviceManager.getServiceStatus).toBe('function')
      expect(typeof serviceManager.getAvailableServices).toBe('function')
      expect(typeof serviceManager.handleRequest).toBe('function')
      expect(typeof serviceManager.stopAll).toBe('function')
    })
  })

  describe('ServiceConfig types', () => {
    it('should have correct type definitions', async () => {
      // This test verifies the types module can be imported
      const types = await import('../../electron/types/service')
      expect(types).toBeDefined()
    })
  })
})
