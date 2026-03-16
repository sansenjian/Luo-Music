import { describe, it, expect, vi } from 'vitest'

/**
 * ServiceManager Tests
 *
 * These tests verify the structure and behavior of the ServiceManager module.
 * Due to the complexity of mocking Node.js child_process and Electron in the test environment,
 * the core logic is tested through integration tests and type checking.
 */
describe('electron/ServiceManager', () => {
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
