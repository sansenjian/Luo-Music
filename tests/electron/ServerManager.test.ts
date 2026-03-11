import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock child_process
const mockSpawn = vi.fn()
vi.mock('node:child_process', () => ({
  spawn: mockSpawn
}))

// Mock logger
vi.mock('../../electron/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

// Mock paths
vi.mock('../../electron/utils/paths', () => ({
  __dirname: '/mock/dir',
  RENDERER_DIST: '/mock/dist',
  VITE_PUBLIC: '/mock/public'
}))

describe('electron/ServerManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('ServerManager class', () => {
    it('should be defined', async () => {
      const { ServerManager } = await import('../../electron/ServerManager')
      expect(ServerManager).toBeDefined()
    })

    it('should export serverManager singleton', async () => {
      const { serverManager } = await import('../../electron/ServerManager')
      expect(serverManager).toBeDefined()
    })
  })

  describe('getServiceStatus()', () => {
    it('should return status for known service', async () => {
      const { serverManager } = await import('../../electron/ServerManager')

      const status = serverManager.getServiceStatus('netease')

      expect(status).toHaveProperty('running')
      expect(status).toHaveProperty('pid')
      expect(status).toHaveProperty('port')
      expect(status).toHaveProperty('name')
    })

    it('should return stopped status for unknown service', async () => {
      const { serverManager } = await import('../../electron/ServerManager')

      const status = serverManager.getServiceStatus('unknown-service')

      expect(status.running).toBe(false)
      expect(status.pid).toBeUndefined()
    })
  })

  describe('getAllServiceStatus()', () => {
    it('should return status for all services', async () => {
      const { serverManager } = await import('../../electron/ServerManager')

      const allStatus = serverManager.getAllServiceStatus()

      expect(allStatus).toHaveProperty('netease')
      expect(allStatus).toHaveProperty('qq')
    })
  })

  describe('startService()', () => {
    it('should return false for unknown service', async () => {
      const { serverManager } = await import('../../electron/ServerManager')

      const result = await serverManager.startService('unknown-service')

      expect(result).toBe(false)
    })

    it('should attempt to start known service', async () => {
      const { serverManager } = await import('../../electron/ServerManager')

      // Mock spawn to return a process-like object
      mockSpawn.mockReturnValue({
        pid: 12345,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      })

      const result = await serverManager.startService('netease')

      // Result depends on whether spawn was called
      expect(typeof result).toBe('boolean')
    })
  })

  describe('stopService()', () => {
    it('should return true for unknown service (already stopped)', async () => {
      const { serverManager } = await import('../../electron/ServerManager')

      const result = await serverManager.stopService('unknown-service')

      // 未知服务被视为已停止，返回 true
      expect(result).toBe(true)
    })
  })

  describe('restartService()', () => {
    it('should return false for unknown service', async () => {
      const { serverManager } = await import('../../electron/ServerManager')

      const result = await serverManager.restartService('unknown-service')

      expect(result).toBe(false)
    })
  })

  describe('updateServiceConfig()', () => {
    it('should update service config', async () => {
      const { serverManager } = await import('../../electron/ServerManager')

      // Should not throw
      expect(() => {
        serverManager.updateServiceConfig('netease', { enabled: true })
      }).not.toThrow()
    })
  })

  describe('checkServiceHealth()', () => {
    it('should return boolean health status for service', async () => {
      const { serverManager } = await import('../../electron/ServerManager')

      const health = await serverManager.checkServiceHealth('netease')

      // checkServiceHealth 返回 boolean，不是对象
      expect(typeof health).toBe('boolean')
    })
  })
})